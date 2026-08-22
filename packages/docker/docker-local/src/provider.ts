/**
 * `DockerProvider` backed by the local `docker` CLI, executed through
 * `ctx.subprocess`. The CLI is the backend rather than the Engine API socket
 * because Compose is a CLI-only capability: reimplementing project
 * orchestration over raw HTTP would duplicate the one component that already
 * owns dependency order, network creation, and teardown.
 * @module @deepseek-ai/dsh-docker-local/provider
 */

import type { Context } from '@deepseek-ai/cordis'
import type { SubprocessHandle, SubprocessOutputReader } from '@deepseek-ai/dsh-subprocess'
import type {
  DockerComposeRequest,
  DockerComposeResult,
  DockerContainer,
  DockerContainerState,
  DockerControlRequest,
  DockerEngineResult,
  DockerEngineStatus,
  DockerImage,
  DockerListRequest,
  DockerLogsRequest,
  DockerLogsResult,
  DockerProvider,
} from '@deepseek-ai/dsh-docker'
import { DockerError } from '@deepseek-ai/dsh-docker'

/** Registry id of the local CLI backend. */
export const LOCAL_DOCKER_PROVIDER_ID = 'local'

/** Compose labels the CLI stamps on every container it creates. */
const PROJECT_LABEL = 'com.docker.compose.project'
const SERVICE_LABEL = 'com.docker.compose.service'

/**
 * How this backend may manage a local container runtime. macOS ships no
 * daemon, so a Linux VM manager provides one; Linux runs the engine natively
 * and only ever needs the daemon started.
 */
export interface LocalDockerEnginePolicy {
  /** Whether an unreachable engine may be started by this backend. */
  readonly allowStart: boolean
  /** Whether a missing container runtime may be installed by this backend. */
  readonly allowInstall: boolean
  /** VM manager used on macOS to provide a Linux engine. */
  readonly vmCli: string
  /** Package manager that installs the runtime on macOS. */
  readonly macInstaller: string
  /** Cooperative timeout for one engine start. */
  readonly startTimeoutMs: number
  /** Cooperative timeout for one engine installation. */
  readonly installTimeoutMs: number
}

/** Execution limits this backend applies to every CLI invocation. */
export interface LocalDockerLimits {
  /** Executable name or absolute path of the Docker CLI. */
  readonly cli: string
  /** Engine-management policy; the three engine methods answer from it. */
  readonly engine: LocalDockerEnginePolicy
  /** Host platform, in `process.platform` vocabulary. */
  readonly platform: NodeJS.Platform
  /** Working directory for CLI invocations, and the root relative compose paths resolve against. */
  readonly projectRoot: string
  /** Cooperative timeout for one inspection call (list, images, logs). */
  readonly inspectTimeoutMs: number
  /** Cooperative timeout for one Compose lifecycle call. */
  readonly composeTimeoutMs: number
  /** Cap on collected stdout bytes of one invocation. */
  readonly maxOutputBytes: number
  /** Termination grace period handed to the subprocess seam. */
  readonly graceMs: number
  /** Trailing log lines used when a request states no `tail`. */
  readonly defaultLogTail: number
}

/** Settled output of one CLI invocation. */
interface CliOutcome {
  readonly exitCode: number | null
  readonly stdout: string
  readonly stderr: string
  readonly truncated: boolean
}

/**
 * Fields the provider reads out of `docker ps --format json`. The CLI emits
 * one JSON object per line with these exact capitalized keys.
 */
interface PsRow {
  readonly ID?: unknown
  readonly Names?: unknown
  readonly Image?: unknown
  readonly State?: unknown
  readonly Status?: unknown
  readonly Ports?: unknown
  readonly CreatedAt?: unknown
  readonly Labels?: unknown
}

/** Fields the provider reads out of `docker images --format json`. */
interface ImageRow {
  readonly ID?: unknown
  readonly Repository?: unknown
  readonly Tag?: unknown
  readonly Size?: unknown
  readonly CreatedAt?: unknown
}

/** Read a string field, or undefined when the CLI omitted or nulled it. */
function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/**
 * Map the CLI's `State` word onto the seam's closed union. The CLI reports the
 * engine's own state vocabulary, which the seam mirrors exactly; anything else
 * is a newer engine word and reads as `dead` rather than widening the union.
 */
function containerState(value: unknown): DockerContainerState {
  switch (value) {
    case 'created': return 'created'
    case 'running': return 'running'
    case 'paused': return 'paused'
    case 'restarting': return 'restarting'
    case 'exited': return 'exited'
    default: return 'dead'
  }
}

/**
 * Parse the CLI's comma-separated `Labels` column into a lookup. Label values
 * may not contain a comma, so splitting is unambiguous; a malformed entry
 * without `=` is skipped rather than failing the whole listing.
 */
function labelValue(labels: unknown, key: string): string | undefined {
  if (typeof labels !== 'string') return undefined
  for (const entry of labels.split(',')) {
    const eq = entry.indexOf('=')
    if (eq < 1) continue
    if (entry.slice(0, eq) === key) return entry.slice(eq + 1) || undefined
  }
  return undefined
}

/**
 * Parse the CLI's human size string (`1.09GB`, `52.4MB`) into bytes. The CLI
 * offers no machine size in `--format json`, and the value is display-only, so
 * an unparseable string reads as 0 rather than failing the listing.
 */
function sizeBytes(value: unknown): number {
  const match = /^([\d.]+)\s*([KMGT]?)B$/i.exec(typeof value === 'string' ? value.trim() : '')
  if (match === null) return 0
  const scale = { '': 1, K: 1e3, M: 1e6, G: 1e9, T: 1e12 }[(match[2] ?? '').toUpperCase()] ?? 1
  return Math.round(Number(match[1]) * scale)
}

/** Split the CLI's `Ports` column into individual mappings. */
function ports(value: unknown): readonly string[] {
  if (typeof value !== 'string' || value.length === 0) return []
  return value.split(',').map(entry => entry.trim()).filter(entry => entry.length > 0)
}

/**
 * Parse newline-delimited JSON as the Docker CLI emits it. A blank or
 * unparseable line is skipped: `docker` interleaves plain-text warnings
 * (context deprecation, credential-helper notices) with JSON rows on stdout,
 * and a warning must not void an otherwise valid listing.
 */
function jsonLines(stdout: string): readonly Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = []
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('{')) continue
    try {
      rows.push(JSON.parse(trimmed) as Record<string, unknown>)
    } catch {
      // A non-JSON line on stdout is a CLI warning, never a container row.
    }
  }
  return rows
}

/**
 * The local Docker CLI backend. Every operation is one short-lived,
 * non-shell-interpreted `docker` invocation: arguments reach the executable as
 * a fixed argv, so a container name or compose path can never be interpreted
 * as a flag or a shell fragment.
 */
export class LocalDockerProvider implements DockerProvider {
  readonly id = LOCAL_DOCKER_PROVIDER_ID

  constructor(private readonly ctx: Context, private readonly limits: LocalDockerLimits) {}

  /**
   * Run one `docker` invocation and collect its output.
   * @param args - arguments after the executable; never shell-interpreted.
   * @param timeoutMs - cooperative timeout for this invocation.
   * @param signal - caller cancellation, combined with the timeout.
   * @returns the settled exit facts and collected output.
   */
  private async cli(args: readonly string[], timeoutMs: number, signal?: AbortSignal): Promise<CliOutcome> {
    const timeout = AbortSignal.timeout(timeoutMs)
    const combined = signal === undefined ? timeout : AbortSignal.any([signal, timeout])
    const collect = { maxBytes: this.limits.maxOutputBytes }
    let handle: SubprocessHandle
    try {
      handle = this.ctx.subprocess.spawn({
        argv: [this.limits.cli, ...args],
        cwd: this.limits.projectRoot,
        stdio: { stdin: 'ignore', stdout: collect, stderr: collect },
        graceMs: this.limits.graceMs,
        signal: combined,
      })
    } catch (cause) {
      throw new DockerError(`failed to launch "${this.limits.cli}"`, 'DOCKER_ENGINE_FAILED', { cause })
    }
    const outcome = await handle.done
    const { stdout, stderr } = handle.collected
    /* v8 ignore start -- both streams were requested in collect mode, so the seam always exposes their readers. */
    if (stdout === undefined || stderr === undefined) {
      throw new DockerError('subprocess dropped a requested collect stream', 'DOCKER_ENGINE_FAILED')
    }
    /* v8 ignore stop */
    if (timeout.aborted) {
      throw new DockerError(`docker ${args[0] ?? ''} timed out after ${timeoutMs}ms`, 'DOCKER_ENGINE_FAILED')
    }
    const out = read(stdout)
    const err = read(stderr)
    return { exitCode: outcome.exitCode, stdout: out.text, stderr: err.text, truncated: out.truncated }
  }

  /**
   * Run a CLI invocation that must succeed, classifying a non-zero exit.
   * @param args - arguments after the executable.
   * @param timeoutMs - cooperative timeout for this invocation.
   * @param signal - caller cancellation.
   * @returns the successful invocation's output.
   */
  private async run(args: readonly string[], timeoutMs: number, signal?: AbortSignal): Promise<CliOutcome> {
    const result = await this.cli(args, timeoutMs, signal)
    if (result.exitCode !== 0) {
      const detail = result.stderr.trim() || result.stdout.trim()
      // The CLI has one exit code for every failure, so the message is the
      // only signal that separates a missing object from an engine fault.
      const missing = /\bNo such\b|\bnot found\b|\bno configuration file\b/i.test(detail)
      throw new DockerError(
        `docker ${args.join(' ')} failed: ${detail || `exit ${String(result.exitCode)}`}`,
        missing ? 'DOCKER_NOT_FOUND' : 'DOCKER_ENGINE_FAILED',
      )
    }
    return result
  }

  async available(): Promise<boolean> {
    try {
      // `info` is the cheapest call that fails when the daemon is down; the
      // client-only `version` succeeds without a reachable engine.
      const result = await this.cli(['info', '--format', '{{.ServerVersion}}'], this.limits.inspectTimeoutMs)
      return result.exitCode === 0
    } catch {
      // An unavailable engine is a selection fact, not a failure to report:
      // the seam skips this provider and reports its own selection error.
      return false
    }
  }

  /**
   * Run one non-`docker` executable (the VM manager or the installer) and
   * collect its output without classifying a non-zero exit: engine management
   * reports failure through the returned status, not by throwing.
   * @param argv - executable and its arguments; never shell-interpreted.
   * @param timeoutMs - cooperative timeout for this invocation.
   * @param signal - caller cancellation, combined with the timeout.
   * @returns the settled exit facts and collected output, or a launch failure.
   */
  private async tool(argv: readonly string[], timeoutMs: number, signal?: AbortSignal): Promise<CliOutcome> {
    const timeout = AbortSignal.timeout(timeoutMs)
    const combined = signal === undefined ? timeout : AbortSignal.any([signal, timeout])
    const collect = { maxBytes: this.limits.maxOutputBytes }
    let handle: SubprocessHandle
    try {
      handle = this.ctx.subprocess.spawn({
        argv: [...argv],
        cwd: this.limits.projectRoot,
        stdio: { stdin: 'ignore', stdout: collect, stderr: collect },
        graceMs: this.limits.graceMs,
        signal: combined,
      })
    } catch (cause) {
      // A missing executable is the ordinary "not installed" answer here.
      return { exitCode: null, stdout: '', stderr: String(cause), truncated: false }
    }
    // ENOENT for a program this machine may simply not have surfaces on
    // `done`, not from `spawn`. That is an answer, not a fault: report it as
    // an unsuccessful settlement so probing stays a plain question.
    let outcome: Awaited<typeof handle.done>
    try {
      outcome = await handle.done
    } catch (cause) {
      return { exitCode: null, stdout: '', stderr: String(cause), truncated: false }
    }
    const { stdout, stderr } = handle.collected
    /* v8 ignore start -- both streams were requested in collect mode, so the seam always exposes their readers. */
    if (stdout === undefined || stderr === undefined) {
      return { exitCode: null, stdout: '', stderr: 'subprocess dropped a requested collect stream', truncated: false }
    }
    /* v8 ignore stop */
    const out = read(stdout)
    const err = read(stderr)
    return { exitCode: outcome.exitCode, stdout: out.text, stderr: err.text, truncated: out.truncated }
  }

  /** Whether an executable resolves on this machine. */
  private async installed(executable: string, signal?: AbortSignal): Promise<boolean> {
    const probe = await this.tool(['command', '-v', executable], this.limits.inspectTimeoutMs, signal)
    if (probe.exitCode === 0) return true
    // `command` is a shell builtin the subprocess seam cannot spawn directly;
    // fall back to asking the executable itself to identify.
    const direct = await this.tool([executable, '--version'], this.limits.inspectTimeoutMs, signal)
    return direct.exitCode === 0
  }

  /**
   * The runtime this platform manages: a Linux VM manager on macOS, the engine
   * itself on Linux. Windows has no runtime this backend installs or starts.
   */
  private engineRuntime(): string | undefined {
    if (this.limits.platform === 'darwin') return this.limits.engine.vmCli
    if (this.limits.platform === 'linux') return this.limits.cli
    return undefined
  }

  async engineStatus(signal?: AbortSignal): Promise<DockerEngineStatus> {
    if (await this.available()) {
      const runtime = this.engineRuntime()
      return {
        running: true,
        startable: false,
        installable: false,
        ...runtime === undefined ? {} : { runtime },
      }
    }
    const runtime = this.engineRuntime()
    if (runtime === undefined) {
      return {
        running: false,
        startable: false,
        installable: false,
        detail: `this backend manages no container runtime on ${this.limits.platform}`,
      }
    }
    const present = await this.installed(runtime, signal)
    return {
      running: false,
      runtime,
      startable: present && this.limits.engine.allowStart,
      installable: !present && this.limits.engine.allowInstall,
      detail: present
        ? `${runtime} is installed but its engine is not answering`
        : `${runtime} is not installed on this machine`,
    }
  }

  async startEngine(signal?: AbortSignal): Promise<DockerEngineResult> {
    const runtime = this.engineRuntime()
    if (runtime === undefined || !this.limits.engine.allowStart) {
      throw new DockerError('starting a local engine is not permitted by this backend', 'DOCKER_ENGINE_UNMANAGEABLE')
    }
    // macOS starts the VM that hosts the daemon; Linux starts the daemon's own
    // service unit, which is the only supervised path that survives this
    // short-lived process.
    const argv = this.limits.platform === 'darwin'
      ? [runtime, 'start']
      : ['systemctl', 'start', 'docker']
    const outcome = await this.tool(argv, this.limits.engine.startTimeoutMs, signal)
    return { status: await this.engineStatus(signal), output: outcome.stdout + outcome.stderr }
  }

  async installEngine(signal?: AbortSignal): Promise<DockerEngineResult> {
    const runtime = this.engineRuntime()
    if (runtime === undefined || !this.limits.engine.allowInstall) {
      throw new DockerError('installing a local engine is not permitted by this backend', 'DOCKER_ENGINE_UNMANAGEABLE')
    }
    if (this.limits.platform !== 'darwin') {
      // Linux distributions disagree on package name, repository, and
      // privilege escalation; guessing one would break the others silently.
      throw new DockerError(
        `installing a container runtime on ${this.limits.platform} is the operator's step; install docker with the distribution's package manager`,
        'DOCKER_ENGINE_UNMANAGEABLE',
      )
    }
    // macOS needs both halves: the client CLI and the VM that provides a
    // Linux daemon for it to talk to.
    const outputs: string[] = []
    for (const formula of [this.limits.cli, runtime]) {
      const outcome = await this.tool(
        [this.limits.engine.macInstaller, 'install', formula],
        this.limits.engine.installTimeoutMs,
        signal,
      )
      outputs.push(outcome.stdout + outcome.stderr)
    }
    return { status: await this.engineStatus(signal), output: outputs.join('\n') }
  }

  async control(request: DockerControlRequest, signal?: AbortSignal): Promise<DockerContainer> {
    if (request.container.trim().length === 0) {
      throw new DockerError('container must not be empty', 'DOCKER_INVALID_REQUEST')
    }
    // `--` stops flag parsing, so a container named like a flag stays an operand.
    // A stop waits out the container's grace period, so this shares the Compose
    // budget rather than the much shorter inspection one.
    await this.run([request.action, '--', request.container], this.limits.composeTimeoutMs, signal)
    // The CLI echoes only the id it acted on, so the settled state comes from a
    // fresh listing instead of from the action's own output.
    const containers = await this.list({ all: true }, signal)
    const settled = containers.find(c => c.id === request.container || c.name === request.container)
    if (settled === undefined) {
      throw new DockerError(
        `container "${request.container}" is gone after ${request.action}`,
        'DOCKER_NOT_FOUND',
      )
    }
    return settled
  }

  async list(request: DockerListRequest, signal?: AbortSignal): Promise<readonly DockerContainer[]> {
    const args = ['ps', '--format', 'json', '--no-trunc']
    if (request.all === true) args.push('--all')
    if (request.project !== undefined) args.push('--filter', `label=${PROJECT_LABEL}=${request.project}`)
    const result = await this.run(args, this.limits.inspectTimeoutMs, signal)
    const rows: readonly PsRow[] = jsonLines(result.stdout)
    return rows.flatMap((row) => {
      const id = text(row.ID)
      if (id === undefined) return []
      const project = labelValue(row.Labels, PROJECT_LABEL)
      const service = labelValue(row.Labels, SERVICE_LABEL)
      return [{
        id,
        name: text(row.Names) ?? id,
        image: text(row.Image) ?? '',
        state: containerState(row.State),
        status: text(row.Status) ?? '',
        ...project === undefined ? {} : { project },
        ...service === undefined ? {} : { service },
        ports: ports(row.Ports),
        createdAt: text(row.CreatedAt) ?? '',
      }]
    })
  }

  async images(signal?: AbortSignal): Promise<readonly DockerImage[]> {
    const result = await this.run(['images', '--format', 'json', '--no-trunc'], this.limits.inspectTimeoutMs, signal)
    // One id carries several `repository:tag` rows; the seam reports one image
    // per id with every tag pointing at it.
    const byId = new Map<string, { tags: string[]; size: number; createdAt: string }>()
    const rows: readonly ImageRow[] = jsonLines(result.stdout)
    for (const row of rows) {
      const id = text(row.ID)
      if (id === undefined) continue
      const existing = byId.get(id)
        ?? { tags: [], size: sizeBytes(row.Size), createdAt: text(row.CreatedAt) ?? '' }
      const repository = text(row.Repository)
      const tag = text(row.Tag)
      if (repository !== undefined && repository !== '<none>' && tag !== undefined && tag !== '<none>') {
        existing.tags.push(`${repository}:${tag}`)
      }
      byId.set(id, existing)
    }
    return [...byId].map(([id, entry]) => ({ id, tags: entry.tags, size: entry.size, createdAt: entry.createdAt }))
  }

  async logs(request: DockerLogsRequest, signal?: AbortSignal): Promise<DockerLogsResult> {
    const tail = request.tail ?? this.limits.defaultLogTail
    if (!Number.isInteger(tail) || tail < 1) {
      throw new DockerError('logs tail must be a positive integer', 'DOCKER_INVALID_REQUEST')
    }
    const args = ['logs', '--tail', String(tail)]
    if (request.since !== undefined) args.push('--since', request.since)
    // `--` stops flag parsing, so a container literally named `--follow`
    // reaches the CLI as an operand.
    args.push('--', request.container)
    // The CLI writes container stderr to its own stderr; both streams are the
    // container's output, so the result interleaves them oldest-first.
    const result = await this.run(args, this.limits.inspectTimeoutMs, signal)
    return {
      container: request.container,
      content: result.stdout + result.stderr,
      truncated: result.truncated,
    }
  }

  /** Build the argv prefix shared by every Compose lifecycle call. */
  private composeArgs(request: DockerComposeRequest, tail: readonly string[]): readonly string[] {
    if (request.file.length === 0) {
      throw new DockerError('compose file path must not be empty', 'DOCKER_INVALID_REQUEST')
    }
    const args = ['compose', '--file', request.file]
    if (request.project !== undefined) args.push('--project-name', request.project)
    return [...args, ...tail, ...request.services ?? []]
  }

  /**
   * Resolve the project name the CLI acted on. An explicit name wins;
   * otherwise Compose derives it from the file's directory, which the settled
   * containers report back through their own project label.
   */
  private static projectOf(request: DockerComposeRequest, containers: readonly DockerContainer[]): string {
    return request.project ?? containers.find(c => c.project !== undefined)?.project ?? ''
  }

  async composeUp(request: DockerComposeRequest, signal?: AbortSignal): Promise<DockerComposeResult> {
    // `--wait` settles the call on running/healthy containers instead of the
    // CLI's detach acknowledgement, so the returned state is the real one.
    const args = this.composeArgs(request, ['up', '--detach', '--wait'])
    const result = await this.run(args, this.limits.composeTimeoutMs, signal)
    const containers = await this.list(
      request.project === undefined ? { all: true } : { all: true, project: request.project },
      signal,
    )
    const scoped = request.project === undefined ? containers : containers.filter(c => c.project === request.project)
    return {
      project: LocalDockerProvider.projectOf(request, scoped),
      output: result.stdout + result.stderr,
      containers: scoped,
    }
  }

  async composeDown(request: DockerComposeRequest, signal?: AbortSignal): Promise<DockerComposeResult> {
    // `down` removes containers wholesale and rejects a service filter, so the
    // seam's service selection cannot reach it.
    const args = this.composeArgs({ file: request.file, ...request.project === undefined ? {} : { project: request.project } }, ['down'])
    const result = await this.run(args, this.limits.composeTimeoutMs, signal)
    const containers = request.project === undefined
      ? []
      : await this.list({ all: true, project: request.project }, signal)
    return {
      project: LocalDockerProvider.projectOf(request, containers),
      output: result.stdout + result.stderr,
      containers,
    }
  }
}

/**
 * Read one settled stream in full. After settlement `readFrom(0)` is the batch
 * result, and its `lossy` flag is exactly the "the tail window dropped older
 * bytes" fact the seam reports as truncation.
 */
function read(reader: SubprocessOutputReader): { text: string; truncated: boolean } {
  const chunk = reader.readFrom(0)
  return { text: chunk.text, truncated: chunk.lossy }
}
