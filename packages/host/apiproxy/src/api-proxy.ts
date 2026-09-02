/**
 * Host-side ApiProxy implementation. Signature discipline: unary takes the
 * narrow RpcRequest<P> and echoes request.rpcId on the RpcResponse<T>.
 */

import { randomUUID } from 'node:crypto'
import { mkdir, opendir, realpath, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, join, sep } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { installModelSelection } from '@deepseek-ai/dsh-agent'
import type { Agent, ModelSelection, ModelSelectionRef, AgentOptions, AgentStatus } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent-presets/types'
import { AttachmentError, admitEncodedImages } from '@deepseek-ai/dsh-attachment'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import { contentHasImage, createUserMessage, freezeMessage, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import { errorChain } from '@deepseek-ai/dsh-llm'
import type { ContentBlock, MessageSource } from '@deepseek-ai/dsh-llm'
import { isAppendSurfaceEvent, isJsonValue } from '@deepseek-ai/dsh-session'
import type { JsonValue, Session, SessionEvent, SessionEventMap, SessionHeader, SessionId, UserMessage } from '@deepseek-ai/dsh-session'
import type { SessionPersistence } from '@deepseek-ai/dsh-session-persistence'
import { SessionQueryError, type SessionSearchCursor } from '@deepseek-ai/dsh-session-query'
import { SubagentError } from '@deepseek-ai/dsh-subagent'
import type { SubagentListEntry as CatalogSubagentListEntry } from '@deepseek-ai/dsh-subagent'
import { isUserInvocable } from '@deepseek-ai/dsh-skill'
import type { Workspace, WorkspaceRecord } from '@deepseek-ai/dsh-workspace'
import {
  workspaceDomainState, workspaceRecord, WorkspaceId as brandWorkspaceId,
  WorkspaceMoveInvalidError, WorkspaceOrderInvalidError, WorkspaceUnknownSessionError,
} from '@deepseek-ai/dsh-workspace'
// Type-only: brings the `ctx.tools` Context merge into this program (viewFor reads presenters).
import {
  InvalidPresetIdError, PresetExistsError, PresetMountError,
  PresetNotWritableError, resolveSessionPreset, UnknownPresetError,
} from '@deepseek-ai/dsh-agent-presets'
import type { PresetBearingSession } from '@deepseek-ai/dsh-agent-presets'
import type {} from '@deepseek-ai/dsh-tools'
import type {
  ApiProxy, ConfigurableProviderView, CredentialView, DockerComposeBrowseEntry,
  DockerContainerEntry, DockerImageEntry,
  GoalRef, HistoryEntry, HostFrame,
  ModelCatalogFailure, ModelProviderGroup,
  ModelReasoning, MuxFrame, PromptContentPart, QuestionResponsePayload, SessionListMetadata, SessionProjectionsBlock, SessionSearchItem,
  QueuedInboxItem, SessionSummary, SettingsNamespaceView, SubagentAddress, JobView, ToolEventView,
  WorkspaceId, WorkspaceView,
} from './api/index.ts'
import {
  DEFAULT_SESSION_LOG_COMPRESSION_LEVEL,
  flushLiveSessionLog,
  sessionLogExportDeps,
  sessionLogZipFilename,
  streamSessionLogZip,
  type SessionLogExportReady,
  type SessionLogCompressionLevel,
} from './session-export.ts'
import type { SessionRawArtifact } from '@deepseek-ai/dsh-session-persistence'
import {
  SESSION_SEARCH_RESULT_LIMIT,
  SESSION_SEARCH_SNIPPET_MAX_CODE_POINTS,
  truncateUnicodeCodePoints,
} from './api/session-search.ts'
// Type-only: resolves `ctx.get('sessionProjections')` to the projection registry.
import type {} from '@deepseek-ai/dsh-session-projection'
// Type-only: resolves `ctx.get('tasks')` to the background job registry.
import type {} from '@deepseek-ai/dsh-jobs'
import type { JobSnapshot } from '@deepseek-ai/dsh-jobs'
// Type-only: resolves `ctx.get('sessionProjectionCache')` (the cold listing column).
import type {} from '@deepseek-ai/dsh-session-projection-cache'
// GoalError narrows domain rejections to their stable codes at the wire boundary.
import { GoalError } from '@deepseek-ai/dsh-goal'
import type { GoalRef as CoreGoalRef } from '@deepseek-ai/dsh-goal'
// Type-only edges: resolve the command-change stream and `ctx.get('skills')`.
import type {} from '@deepseek-ai/dsh-commands'
// Type-only: the dynamic-package runner's forwarded-event declarations. Its
// client-safe `./types` subpath deliberately, not the package root — the root
// merges `ctx.dynamicCordisRunner`, and a dependency on that package would
// rebuild the api-remotes cycle this direction exists to avoid.
import type {} from '@deepseek-ai/dsh-cordis-host-runner/types'
import type {} from '@deepseek-ai/dsh-skill'
// Type-only edge: the editor domain reports which language servers are mounted.
import type {} from '@deepseek-ai/dsh-lsp'
// Value edge: the editor domain narrows the filesystem seam's failure codes
// onto its own wire vocabulary, which needs FsError as a value.
import { FsError } from '@deepseek-ai/dsh-fs'
import type { FileSystem, FsTarget, FsVersion } from '@deepseek-ai/dsh-fs'
import type { SandboxExecutionPolicy } from '@deepseek-ai/dsh-sandbox'
// Value edge: the docker domain narrows the seam's provider-selection failures
// onto one wire code; the import also resolves `ctx.get('docker')`.
import { DockerError } from '@deepseek-ai/dsh-docker'
import { parsePipeline, PIPELINE_FILE, setStageEnabledInTable, TreadmillError } from '@deepseek-ai/dsh-treadmill'
import type { DockerContainer, DockerImage } from '@deepseek-ai/dsh-docker'
// Value edge: the git domain narrows the seam's provider-selection and
// repository failures onto its own wire codes; the import also resolves
// `ctx.get('git')`.
import { GitError } from '@deepseek-ai/dsh-git'
import type { GitStatus } from '@deepseek-ai/dsh-git'
// The settings/credentials seams: brand guards run at this wire boundary; the
// service reads stay optional (`ctx.get`) so a composition without either
// provider still serves every other domain.
import { SettingsConflictError, settingsNamespace } from '@deepseek-ai/dsh-settings'
import type { SettingsDescriptor, SettingsNamespace, SettingsPathOp } from '@deepseek-ai/dsh-settings'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
// Value edge: the rename impl narrows the title service's validation failure; the import also resolves `ctx.get('sessionTitle')`.
import { SessionTitleInvalidError } from '@deepseek-ai/dsh-session-title'
import type { CallId } from '@deepseek-ai/dsh-llm/brand'
import type { ScopeKey } from '@deepseek-ai/dsh-scope'
import type { ApprovalOutcome, ApprovalRequestId } from '@deepseek-ai/dsh-user-approval'
// Side-effect type import: resolves the `approval/request` waterfall and
// `ctx.get('approval')` without a value dependency on the seam (optional composition).
import type {} from '@deepseek-ai/dsh-user-approval'
import { approvalResponsePayloadSchema } from './api/approvals.schema.ts'
import { imageLimitsProjectionSchema, sessionListMetadataProjectionSchema } from './api/sessions.schema.ts'
import { questionResponsePayloadSchema } from './api/questions.schema.ts'
import type { ClientResponse, RpcError, RpcReceipt, RpcRequest, RpcResponse } from './api/rpc.ts'
import type { ResponseValue } from './api/rpc-map.ts'
import { RpcId } from './api/rpc.ts'
import type {
  AskUserQuestionAnswer, AskUserQuestionItem, AskUserQuestionRequest,
} from '@deepseek-ai/dsh-user-questions'
import { UserQuestionError } from '@deepseek-ai/dsh-user-questions'
import { DirectoryPickerError } from '@deepseek-ai/dsh-host-directory-picker'
import {
  ApiRemoteSessionNotFound as SessionNotFound,
  ApiRemoteSubagentSessionOwnership as SubagentSessionOwnership,
  API_REMOTE_FORWARDED_EVENTS,
  apiRemoteSubagentOwnershipError,
  createApiRemoteAgentResolver,
  hasApiRemoteSubagentOwner,
  inspectApiRemoteSession,
} from '@deepseek-ai/dsh-api-remotes'
import { canOpenNativePath, openNativePath, openNativeTextFile } from './native-path-opener.ts'

/** Page size when history is called without maxMessages. */
const DEFAULT_MAX_MESSAGES = 50

/** Provider work budget: at most 100 calls and 2,000 inspected hits. */
const SESSION_SEARCH_PROVIDER_CALL_LIMIT = 100

/** Bound cold-log stat fan-out and settle each started batch before cancellation returns. */
const COLD_SUMMARY_BATCH_SIZE = 16
/** Default maximum artifact size eligible for one cold blankness read. */
export const DEFAULT_COLD_BLANK_PROBE_MAX_BYTES = 1024

/** Default cap on characters one `docker.logs` response carries. */
/**
 * Largest file this editor opens. A browser editor holds the whole text in
 * memory and ships it back on every save, so this cap is the product's choice,
 * not the filesystem's.
 */
export const EDITOR_MAX_FILE_BYTES = 5 * 1024 * 1024

/** Characters of container log the docker domain returns before truncating. */
export const DEFAULT_DOCKER_LOG_MAX_CHARS = 40_000

/** Default cap on characters one Compose lifecycle response carries. */
export const DEFAULT_DOCKER_COMPOSE_OUTPUT_MAX_CHARS = 40_000

/**
 * Directory levels the repository scan descends below each workspace root. A
 * monorepo keeps its inner repositories within a few levels of its root, and
 * every extra level multiplies the directories walked.
 */
export const GIT_DISCOVERY_MAX_DEPTH = 4

/** Largest number of repositories one discovery answers before truncating. */
export const GIT_DISCOVERY_LIMIT = 100

/** Commits one `git.log` response carries when the client names no limit. */
export const GIT_LOG_DEFAULT_LIMIT = 50

/**
 * Integration branches a checkout is compared against when the client names
 * none. Both spellings of each are asked for: a repository may track its base
 * locally, on the remote, or only one of the two, and a name that does not
 * resolve is reported as absent rather than failing the call.
 */
export const GIT_DEFAULT_BASES: readonly string[] = [
  'main', 'origin/main', 'master', 'origin/master', 'develop', 'origin/develop',
]

/** Commits one `git.graph` response carries when the client names no limit. */
export const GIT_GRAPH_DEFAULT_LIMIT = 120

/** Default cap on rows one `docker.browseCompose` level returns. */
export const DEFAULT_DOCKER_COMPOSE_BROWSE_MAX_ENTRIES = 500

/**
 * File names `docker.browseCompose` offers as compose candidates. Compose's
 * own default file set plus the `*.compose.yml` convention; the check is
 * case-insensitive because the host filesystem may be too.
 */
const COMPOSE_FILE_PATTERN = /^(?:docker-)?compose(?:\.[\w-]+)?\.ya?ml$|\.compose\.ya?ml$/i

/** Conversation message event types (the pagination counting unit). */
const MESSAGE_TYPES = new Set(['user/message', 'assistant/message'])

/** Validate one prompt as a batch before publishing any durable image object. */
async function durablePromptContent(ctx: Context, content: readonly PromptContentPart[]): Promise<ContentBlock[]> {
  if (content.every(part => part.type === 'text')) {
    return content.map(part => ({ type: 'text', text: part.text }))
  }
  const refs = await admitEncodedImages(ctx.attachments, content.filter(part => part.type === 'image'))
  let next = 0
  return content.map(part => part.type === 'text'
    ? { type: 'text', text: part.text }
    // admitEncodedImages returns one reference per image part in order.
    : { type: 'image', attachment: refs[next++] as ImageAttachmentRef })
}

/** Search durable content for an image reference, including nested tool results. */
function imageBlockIn(content: unknown, match: (ref: ImageAttachmentRef) => boolean): ImageAttachmentRef | undefined {
  if (!Array.isArray(content)) return undefined
  for (const value of content) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) continue
    const block = value as { type?: unknown; attachment?: unknown; content?: unknown }
    if (block.type === 'image' && typeof block.attachment === 'object' && block.attachment !== null) {
      const ref = block.attachment as ImageAttachmentRef
      if (match(ref)) return ref
    }
    if (block.type === 'tool-result') {
      const nested = imageBlockIn(block.content, match)
      if (nested !== undefined) return nested
    }
  }
  return undefined
}

/** Search every durable event carrier that can own model-visible content. */
function imageInEvent(event: SessionEvent, match: (ref: ImageAttachmentRef) => boolean): ImageAttachmentRef | undefined {
  const data = event.data as {
    content?: unknown
    message?: { content?: unknown }
    inserted?: Array<{ content?: unknown }>
    chunk?: { type?: unknown; block?: unknown }
  }
  const direct = imageBlockIn(data.content, match)
  if (direct !== undefined) return direct
  if (data.message !== undefined) {
    const wrapped = imageBlockIn(data.message.content, match)
    if (wrapped !== undefined) return wrapped
  }
  if (data.inserted !== undefined) {
    for (const message of data.inserted) {
      const inserted = imageBlockIn(message.content, match)
      if (inserted !== undefined) return inserted
    }
  }
  if (event.type === 'assistant/chunk' && data.chunk?.type === 'block-end') {
    return imageBlockIn([data.chunk.block], match)
  }
  return undefined
}

/** True when the current model-visible surface contains an image. */
function messagesHaveImage(messages: readonly { content: readonly ContentBlock[] }[]): boolean {
  return messages.some(message => contentHasImage(message.content))
}

/** Resolve the first reference matching one opaque id. */
function referencedImage(events: readonly SessionEvent[], attachmentId: string): ImageAttachmentRef | undefined {
  for (const event of events) {
    const found = imageInEvent(event, ref => String(ref.attachmentId) === attachmentId)
    if (found !== undefined) return found
  }
  return undefined
}

/** Strict browser-zone profile: UTC or an IANA Area/Location-style identifier. */
const IANA_TIME_ZONE = /^[A-Za-z][A-Za-z0-9_+.-]*(?:\/[A-Za-z0-9_+.-]+)+$/

/** Validate and canonicalize one browser-supplied IANA zone at the wire boundary. */
function canonicalClientTimeZone(value: string): string | undefined {
  if (value.length === 0 || value.trim() !== value
    || (value !== 'UTC' && !IANA_TIME_ZONE.test(value))) return undefined
  try {
    const canonical = new Intl.DateTimeFormat('en-US', { timeZone: value })
      .resolvedOptions().timeZone
    /* v8 ignore next -- Intl returns UTC or a canonical IANA Area/Location for accepted input. */
    if (canonical !== 'UTC' && !IANA_TIME_ZONE.test(canonical)) return undefined
    return canonical
  } catch {
    // Intl rejects unsupported zone names; the RPC maps that parser rejection below.
    return undefined
  }
}

/** Read live abort state across awaits without treating it as synchronously immutable. */
function isAborted(signal: AbortSignal): boolean {
  return signal.aborted
}

/**
 * Message-boundary pagination: count maxMessages append-origin messages
 * backwards from the window tail. Replacement copies never entered the
 * conversation a reader sees — they restate a shadowed range for the model
 * alone — so they consume no quota; the page stays one contiguous raw range,
 * which keeps a compaction's log-only `compaction/summary` record on the same page as its
 * replacement. The cut is the starting seq of the oldest message group (chunks
 * group via sourceEventSeqs — never cut mid-message). The tail page naturally
 * includes the in-progress partial.
 */
function paginate(
  events: readonly SessionEvent[],
  beforeSeq: number | undefined,
  maxMessages: number,
): { events: SessionEvent[]; hasMore: boolean } {
  const window = beforeSeq === undefined ? [...events] : events.filter(event => event.seq < beforeSeq)
  let count = 0
  let cut = 0
  for (let i = window.length - 1; i >= 0; i--) {
    const event = window[i] as SessionEvent
    if (!MESSAGE_TYPES.has(event.type) || !isAppendSurfaceEvent(event)) continue
    count++
    const sources = (event as { sourceEventSeqs?: number[] }).sourceEventSeqs
    let groupStart = event.seq
    if (sources !== undefined) {
      for (const source of sources) {
        if (source < groupStart) groupStart = source
      }
    }
    if (count >= maxMessages) {
      cut = groupStart
      break
    }
  }
  const page = window.filter(event => event.seq >= cut)
  return { events: page, hasMore: cut > 0 }
}

/** Wrap an ok result echoing the request's rpcId. */
function ok<T>(request: RpcRequest<unknown>, value: T): RpcResponse<T> {
  return { rpcId: request.rpcId, result: { ok: true, value } }
}

/**
 * Build the provider/model catalog over every registered route. Shared by the
 * session-scoped `session.models` and host-scoped `llm.models`. Catalog
 * membership stays advisory: an unlisted session selection remains valid for
 * provider dispatch, but is not injected back into the selector after its
 * owning catalog stops advertising it. Per-provider failures ride `failures`
 * without failing the sound groups; groups that advertise nothing are dropped.
 */
async function buildModelCatalog(ctx: Context): Promise<{
  groups: ModelProviderGroup[]
  failures: ModelCatalogFailure[]
}> {
  const catalog = await Promise.all(ctx.llm.listProviders().map(async (provider) => {
    try {
      const models = await ctx.llm.listModels(provider.id)
      const entries = await Promise.all(models.map(async (model) => {
        const resolved = await ctx.llm.resolveModelInfo(provider.id, model.id)
        const reasoning: ModelReasoning | undefined = resolved.reasoning === undefined
          ? undefined
          : {
            efforts: resolved.reasoning.efforts.map(effort => ({
              id: effort.id,
              name: effort.name,
              ...effort.description === undefined
                ? {}
                : { description: effort.description },
            })),
            ...resolved.reasoning.defaultEffort === undefined
              ? {}
              : { defaultEffort: resolved.reasoning.defaultEffort },
          }
        return {
          id: model.id,
          name: model.name,
          ...model.description === undefined ? {} : { description: model.description },
          ...reasoning === undefined ? {} : { reasoning },
          ...resolved.inputModalities === undefined ? {} : { inputModalities: [...resolved.inputModalities] },
        }
      }))
      const group: ModelProviderGroup = {
        id: provider.id,
        name: provider.name,
        models: entries,
      }
      return { kind: 'group' as const, group }
    } catch (error: unknown) {
      const failure: ModelCatalogFailure = {
        id: provider.id,
        name: provider.name,
        message: error instanceof Error ? error.message : String(error),
      }
      return { kind: 'failure' as const, failure }
    }
  }))
  return {
    groups: catalog.flatMap(item => item.kind === 'group' ? [item.group] : []).filter(group => group.models.length > 0),
    failures: catalog.flatMap(item => item.kind === 'failure' ? [item.failure] : []),
  }
}

/** Wrap an error result echoing the request's rpcId. */
function err<T>(request: RpcRequest<unknown>, error: RpcError): RpcResponse<T> {
  return { rpcId: request.rpcId, result: { ok: false, error } }
}

/**
 * The RPC refusal a preset failure becomes, or undefined when the failure is
 * about something else.
 *
 * Both the session-create path and the switch path can be handed the same two
 * failures, and a client that has to branch on the code needs them worded the
 * same from either.
 * @param request - the request being answered.
 * @param error - the thrown value.
 * @returns the refusal, or undefined when the caller should keep handling.
 */
function presetFailure(request: RpcRequest<unknown>, error: unknown): RpcResponse<never> | undefined {
  if (error instanceof UnknownPresetError) {
    return err(request, {
      code: 'agent-preset-not-found',
      message: error.message,
      details: { agentPreset: error.presetId, available: [...error.available] },
    })
  }
  if (error instanceof PresetMountError) {
    return err(request, {
      code: 'agent-preset-invalid',
      message: error.message,
      details: { agentPreset: error.presetId, reason: error.reason },
    })
  }
  return undefined
}

/** Simple async queue: core callbacks push, the AsyncIterable pulls; abort/return cleans up. */
class FrameQueue<F> {
  private buffer: F[] = []
  private waiter: (() => void) | undefined
  private done = false

  push(item: F): void {
    if (this.done) return
    this.buffer.push(item)
    this.waiter?.()
  }

  end(): void {
    this.done = true
    this.waiter?.()
  }

  async *iterate(signal: AbortSignal, cleanup: () => void): AsyncGenerator<F> {
    const onAbort = (): void => { this.end() }
    signal.addEventListener('abort', onAbort, { once: true })
    try {
      while (true) {
        while (this.buffer.length > 0) yield this.buffer.shift() as F
        if (this.done || signal.aborted) return
        await new Promise<void>((resolve) => { this.waiter = resolve })
        this.waiter = undefined
      }
    } finally {
      signal.removeEventListener('abort', onAbort)
      cleanup()
    }
  }
}

/**
 * Server-side frame mint: pure pushes get a fresh rpcId per frame (answerable
 * frames — approval/question requested — mint their stable id in their
 * pending registries instead).
 */
function frame<F>(payload: F): RpcRequest<F> {
  return { rpcId: RpcId(randomUUID()), payload }
}

/**
 * Narrow one allowlisted host event's argument list to the JSON values the
 * wrapper frame carries. A rejected argument is an allowlist mistake (the
 * forwarded path applies no projection), not hostile input, so it throws rather
 * than degrading to a lossy frame. The throw surfaces where the forwarding
 * listener runs, so the emitter's own listener containment logs it and drops
 * that frame — loud in the Host log, not at load or at the emit. Exported for
 * the test that owns this decision: every currently allowlisted event has a
 * statically JSON-safe payload, so a type-legal `ctx.emit` cannot reach the
 * rejection branch.
 * @param event - forwarded host event name, named in the failure.
 * @param args - the emitter's argument list.
 * @returns the same arguments typed as JSON values.
 */
export function assertJsonArgs(event: string, args: readonly unknown[]): JsonValue[] {
  for (const [index, arg] of args.entries()) {
    if (!isJsonValue(arg)) {
      throw new Error(`forwarded host event "${event}" argument ${index} is not lossless JSON data`)
    }
  }
  return args as JsonValue[]
}

/** Queue the subscription baseline frame. */
function subscribeSession(queue: FrameQueue<RpcRequest<MuxFrame>>, session: Session): void {
  queue.push(frame({ type: 'session/subscribed', sessionId: session.id, lastSeq: session.seq - 1 }))
}

/**
 * Project registry snapshots onto the wire view, dropping the three internal
 * fields {@link JobView} documents as absent.
 */
function jobViews(snapshots: readonly JobSnapshot[]): JobView[] {
  return snapshots.map(job => ({
    id: job.id,
    kind: job.kind,
    label: job.label,
    status: job.status,
    ...job.detail === undefined ? {} : { detail: job.detail },
    startedAt: job.startedAt,
    ...job.finishedAt === undefined ? {} : { finishedAt: job.finishedAt },
  }))
}

/**
 * Whether the session's conversation has started: no turn has run yet (a
 * turn is one model-loop execution). Standalone plugin events — command
 * lifecycle records, plan/mode, titles, goals — never open a turn, so
 * running `/plan` or `/goal` on a fresh session keeps it blank
 * (list-hidden, reusable).
 */
function sessionBlank(session: Session): boolean {
  return !session.events.some(event => event.type === 'turn/start')
}

/** Advance the Session-list hint projection by one committed event. */
function applySessionListMetadata(state: SessionListMetadata, event: SessionEvent): SessionListMetadata {
  const blank = state.blank && event.type !== 'turn/start'
  const lastPromptAt = event.type === 'user/message' && event.data.source.kind === 'user'
    ? event.time
    : state.lastPromptAt
  return blank === state.blank && lastPromptAt === state.lastPromptAt
    ? state
    : { blank, lastPromptAt }
}

/** Fold exact list metadata for an attached Session. */
function sessionListMetadata(events: readonly SessionEvent[]): SessionListMetadata {
  let state: SessionListMetadata = { blank: true, lastPromptAt: null }
  for (const event of events) state = applySessionListMetadata(state, event)
  return state
}

/** Sort by creation or latest human prompt, whichever is newer. */
function sessionListUpdatedAt(header: SessionHeader, metadata: SessionListMetadata | undefined): number {
  return Math.max(header.createdAt, metadata?.lastPromptAt ?? 0)
}

/** Shared Session-header projection for list baselines and creation frames. */
function sessionListFields(header: SessionHeader, events: readonly SessionEvent[] = []): {
  parentSessionId?: SessionId
  origin?: 'subagent'
  cwd?: string
  agentPreset?: string
} {
  // The preset comes from the log, not the header: a session that switched
  // while blank ran its turns under the newer composition, and a picker
  // showing the creation-time value would contradict what the model saw.
  const agentPreset = resolveSessionPreset({ header, events })
  return {
    ...header.parentSession === undefined ? {} : { parentSessionId: header.parentSession },
    ...header.origin === undefined ? {} : { origin: header.origin },
    ...header.cwd === undefined ? {} : { cwd: header.cwd },
    ...agentPreset === undefined ? {} : { agentPreset },
  }
}

/** SessionSummary projection for attached (in-memory) sessions. */
function summarize(session: Session, running: boolean): SessionSummary {
  const metadata = sessionListMetadata(session.events)
  return {
    sessionId: session.id,
    updatedAt: sessionListUpdatedAt(session.header, metadata),
    running,
    blank: metadata.blank,
    ...sessionListFields(session.header, session.events),
  }
}

/**
 * Verify a possibly blank cold Session only when its physical artifact passes
 * the configured per-Session size check. A stale `blank: true`, an
 * absent cache row, a large or location-less artifact, and read failures all
 * resolve to visible (`false`); listing must never hide a conversation on a
 * cache hint or an unavailable optimization.
 */
async function probeColdSessionMetadata(
  ctx: Context,
  persistence: SessionPersistence,
  meta: SessionHeader,
  maxBytes: number,
  signal?: AbortSignal,
): Promise<SessionListMetadata | undefined> {
  if (maxBytes === 0) return undefined
  signal?.throwIfAborted()
  const location = persistence.locate(meta)
  if (location === undefined) return undefined
  signal?.throwIfAborted()
  let size: number
  try {
    size = (await stat(location.path)).size
  } catch {
    signal?.throwIfAborted()
    return undefined
  }
  if (size > maxBytes) return undefined
  try {
    const { events } = await persistence.readFrom(meta.id, 0, signal)
    signal?.throwIfAborted()
    return sessionListMetadata(events)
  } catch (error) {
    signal?.throwIfAborted()
    ctx.logger.warn(`session.list: blank probe for "${meta.id}" failed (serving it as visible): ${String(error)}`)
    return undefined
  }
}

/** SessionSummary projection for a cold persisted Session. */
async function summarizeCold(
  ctx: Context,
  persistence: SessionPersistence,
  meta: SessionHeader,
  metadata: SessionListMetadata | undefined,
  blankProbeMaxBytes: number,
  signal?: AbortSignal,
): Promise<SessionSummary> {
  const probed = metadata?.blank === false
    ? undefined
    : await probeColdSessionMetadata(ctx, persistence, meta, blankProbeMaxBytes, signal)
  return {
    sessionId: meta.id,
    updatedAt: sessionListUpdatedAt(meta, probed ?? metadata),
    running: false,
    blank: metadata?.blank === false ? false : probed?.blank ?? false,
    // Header-only: reading the log for a blank-window preset switch would
    // defeat the same index read, and attaching the session replaces this row
    // with `summarize()`, which resolves the switch from the events.
    ...sessionListFields(meta),
  }
}

/** Map a browse-primitive failure onto the wire error vocabulary (unknown throws stay internal). */
function directoryError(error: unknown): RpcError {
  if (error instanceof DirectoryPickerError) {
    return { code: error.code, message: error.message, details: { path: error.path } }
  }
  return { code: 'internal', message: error instanceof Error ? error.message : String(error), details: {} }
}

/** Resolved Agent model and project-directory defaults consumed by the API implementation. */
export interface ApiProxyDefaults {
  /**
   * The model selection a session starts from when its own log names none. Read on
   * every access rather than captured, so a default saved during this process
   * reaches the sessions that have not run a turn yet.
   */
  defaultModelSelection: () => ModelSelection
  /**
   * Record a selection as the new default. Either absent, or a closure that
   * may itself decline — the gateway plugin always passes one, and it no-ops
   * when the deployment mounts no settings provider or when the write races
   * service teardown. A switch then stays process-local. A rejection is
   * reported and swallowed: the switch already applies to its own session,
   * and undoing it because storage failed would be the worse outcome.
   */
  saveDefaultModelSelection?: (selection: ModelSelection) => Promise<void>
  /** Default project directory for new sessions whose create request carries no cwd. */
  cwd: string
  /** Native open-with-default-application; injectable for carrier tests. */
  openPath?: (path: string, signal: AbortSignal) => Promise<void>
  /** Native text-editor handoff; injectable for settings-document tests. */
  openTextFile?: (path: string, signal: AbortSignal) => Promise<void>
  /** Validated DEFLATE level for session-log ZIP entries; defaults to 6. */
  sessionExportCompressionLevel?: SessionLogCompressionLevel
  /** Maximum artifact size eligible for one cold blankness read. */
  coldBlankProbeMaxBytes?: number
  /** Cap on characters one `docker.logs` response carries; the newest text survives. */
  dockerLogMaxChars?: number
  /** Cap on rows one `docker.browseCompose` level returns. */
  dockerComposeBrowseMaxEntries?: number
  /** Cap on characters one Compose lifecycle response carries; the newest text survives. */
  dockerComposeOutputMaxChars?: number
  /**
   * Whether handing a path to the native opener can work at all — the
   * `hasDocument` capability the preset roster reports, and the switch
   * between opening a preset directory and answering its path as text.
   * Absent, an injected `openPath` counts as openable and everything else
   * falls back to platform detection ({@link canOpenNativePath}).
   */
  canOpenPath?: () => boolean
}

/** The tool/call payload fields the presenter path reads. */
interface ToolCallData { callId: string; name: string; arguments: string }
/**
 * One outstanding approval question: the stable server-request id, the frame
 * material replayed to late mux subscribers, and the resolver that settles the
 * answerer's promise back into `ctx.approval`.
 */
interface PendingApproval {
  rpcId: RpcId
  sessionId: SessionId
  approvalId: ApprovalRequestId
  toolName: string
  callId?: CallId
  reason?: string
  resolve(outcome: ApprovalOutcome): void
}

/** Project a pending entry into its answerable mux frame (initial push and mux-open replay share it). */
function requestedFrame(pending: PendingApproval): RpcRequest<MuxFrame> {
  return {
    rpcId: pending.rpcId,
    payload: {
      type: 'approval/requested',
      sessionId: pending.sessionId,
      approvalId: pending.approvalId,
      toolName: pending.toolName,
      ...pending.callId === undefined ? {} : { callId: pending.callId },
      ...pending.reason === undefined ? {} : { reason: pending.reason },
    },
  }
}

/** One host-owned question wait, addressed by the stable server-request id. */
interface PendingQuestion {
  rpcId: RpcId
  sessionId: SessionId
  questions: AskUserQuestionItem[]
  resolve: (answer: AskUserQuestionAnswer) => void
  reject: (error: UserQuestionError) => void
  signal?: AbortSignal
  onAbort?: () => void
}

/** Validate one answer batch against the exact question request it resolves. */
function matchesQuestions(payload: QuestionResponsePayload, pending: PendingQuestion): boolean {
  if (payload.sessionId !== pending.sessionId) return false
  const answers = payload.answer.answers
  if (answers.length !== pending.questions.length) return false
  return answers.every((answer, index) => {
    const question = pending.questions[index] as AskUserQuestionItem
    if (answer.id !== question.id) return false
    if (new Set(answer.selected).size !== answer.selected.length) return false
    const custom = answer.custom?.trim()
    if (custom !== undefined && custom === '') return false
    if (question.multiSelect !== true) {
      if (custom !== undefined && answer.selected.length > 0) return false
      if (answer.selected.length > 1) return false
    }
    const labels = new Set(question.options?.map(option => option.label) ?? [])
    return answer.selected.every(label => labels.has(label))
  })
}

/**
 * Compute the render intent for a tool/call or tool/result event through the
 * presenters registered at this moment; every other event type gets none. A
 * result's presenter needs its call's parsed args — `argsFor` supplies them
 * (live: the per-session call table; history: an in-page backscan), returning
 * undefined when the pairing is unavailable (e.g. the call fell off the page),
 * which soft-falls to no view. Presenter or JSON.parse throws also soft-fall:
 * the client's documented default (generic JSON card) covers every miss.
 */
function viewFor(
  ctx: Context,
  event: SessionEvent,
  argsFor: (callId: string) => unknown,
  // Presenters live with the definitions, and definitions live in the scope
  // chain: a preset registers its tools into its standing layer. A live agent
  // is a scope whose chain passes through its preset; a cold read passes the
  // preset's standing key directly — no agent, no resume. An undefined scope
  // sees only the global layer, which is the pre-preset deployment shape.
  scope?: ScopeKey,
): ToolEventView | undefined {
  try {
    if (event.type === 'tool/call') {
      const { name, arguments: raw } = event.data as ToolCallData
      const view = ctx.tools.get(name, scope)?.presentCall?.(JSON.parse(raw))
      return view === undefined ? undefined : { for: 'call', view }
    }
    if (event.type === 'tool/result') {
      const { message, meta } = event.data
      const [result] = message.content
      const callId = message.source.callId
      const call = argsFor(callId) as { name: string; args: unknown } | undefined
      if (call === undefined) return undefined
      const view = ctx.tools.get(call.name, scope)?.presentResult?.(call.args, {
        content: result.content,
        isError: result.isError === true,
        ...meta === undefined ? {} : { meta },
      })
      return view === undefined ? undefined : { for: 'result', view }
    }
  } catch (error: unknown) {
    // A throwing presenter (or unparseable arguments) must not break delivery;
    // the event still ships, just without a view.
    console.error(`api-proxy: presenter failed for ${event.type}, falling back to generic: ${String(error)}`)
  }
  return undefined
}

/**
 * Resolve a tool/result's call pairing by scanning a window of events backwards
 * for the matching tool/call. Used by the history path (the page is the
 * window — a cross-page pairing soft-falls to no view) and by live-path table
 * misses after a reconnect-eviction.
 */
function backscanArgs(events: readonly SessionEvent[], callId: string): { name: string; args: unknown } | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i] as SessionEvent
    if (event.type !== 'tool/call') continue
    const data = event.data as ToolCallData
    if (data.callId !== callId) continue
    try {
      return { name: data.name, args: JSON.parse(data.arguments) }
    } catch {
      // Unparseable stored arguments: same soft-fall as a live parse failure.
      return undefined
    }
  }
  return undefined
}

/** Render one detached history page through the same presenter path as ordinary history. */
function historyPage(
  ctx: Context,
  events: readonly SessionEvent[],
  beforeSeq: number | undefined,
  maxMessages: number | undefined,
  scope?: ScopeKey,
): { events: HistoryEntry[]; hasMore: boolean } {
  const page = paginate(events, beforeSeq, maxMessages ?? DEFAULT_MAX_MESSAGES)
  return {
    events: page.events.map((event) => {
      const view = viewFor(ctx, event, callId => backscanArgs(page.events, callId), scope)
      return { event, ...view === undefined ? {} : { view } }
    }),
    hasMore: page.hasMore,
  }
}

/**
 * The projection baseline for one history tail page: the registry's
 * watermark-cache snapshot — one fully synchronous read (no await between the
 * page slice and this), so all values and `asOfSeq` form a single consistent
 * cut and `asOfSeq` equals the window tail event seq. The carrier holds zero
 * domain knowledge (each value passed its unit's own schema inside the
 * registry). An absent registry means the deployment has no projection seam:
 * the whole block is absent and clients treat every key as capability-absent.
 */
/**
 * Which session a transcript read is served from. An attached session is the
 * live object and keeps appending, so its events and projection baseline are
 * read together in one synchronous step; a detached one is already a frozen
 * inspection.
 */
type HistorySource =
  | { readonly kind: 'attached'; readonly session: Session }
  | { readonly kind: 'detached'; readonly header: SessionHeader; readonly events: SessionEvent[] }

function projectionsFor(ctx: Context, session: Session): SessionProjectionsBlock | undefined {
  const registry = ctx.get('sessionProjections')
  if (registry === undefined) return undefined
  return registry.snapshot(session)
}

/**
 * The projection baseline of one session.list row, fail-soft: attached
 * sessions cut the registry's live watermark cache; cold sessions view the
 * persisted projection cache's identity-checked stored rows (zero log loads
 * either way — the listing use case the cache exists for). The block shape
 * (values + asOfSeq) matches the history tail's, so a client seeds its
 * value store under the same higher-seq-wins rule. Any failure — and an
 * empty value set — yields an absent block: a listing without projections
 * is degraded, never broken.
 */
function listProjectionsFor(ctx: Context, meta: SessionHeader, session: Session | undefined): SessionProjectionsBlock | undefined {
  try {
    const block = session !== undefined
      ? ctx.get('sessionProjections')?.snapshot(session)
      : ctx.get('sessionProjectionCache')?.cachedSnapshot(meta)
    return block !== undefined && Object.keys(block.values).length > 0 ? block : undefined
  } catch (error) {
    ctx.logger.warn(`session.list: projection column for "${meta.id}" failed (serving the row without it): ${String(error)}`)
    return undefined
  }
}

/** Projection baseline for a detached history tail without Agent activation. */
function detachedProjectionsFor(
  ctx: Context,
  events: readonly SessionEvent[],
): SessionProjectionsBlock | undefined {
  const registry = ctx.get('sessionProjections')
  if (registry === undefined) return undefined
  return registry.restore({}, events, 0).snapshot
}

/**
 * Best-effort projections for one subagent history page, fail-soft like
 * {@link listProjectionsFor}: a registered unit throwing on a corrupt payload
 * never blocks transcript reading — the page is served without the block.
 * @param ctx - context carrying the logger for the degradation warning.
 * @param childSessionId - the child whose page is being decorated.
 * @param compute - the arm-specific fold (live watermark or detached restore).
 * @returns the projections block, or undefined when the fold failed.
 */
function subagentHistoryProjections(
  ctx: Context,
  childSessionId: SessionId,
  compute: () => SessionProjectionsBlock | undefined,
): SessionProjectionsBlock | undefined {
  try {
    return compute()
  } catch (error) {
    ctx.logger.warn(`subagent.history: projections for "${childSessionId}" failed (serving the page without them): ${String(error)}`)
    return undefined
  }
}

/** Map continuation admission failures without exposing provider details. */
function subagentPromptError(
  request: RpcRequest<{ childSessionId: SessionId }>,
  error: unknown,
  signal: AbortSignal,
): RpcResponse<never> {
  const childSessionId = request.payload.childSessionId
  if (signal.aborted) {
    return err(request, { code: 'cancelled', message: 'subagent prompt was cancelled', details: {} })
  }
  if (error instanceof SubagentError) {
    switch (error.code) {
      case 'NOT_RESUMABLE':
        return err(request, {
          code: 'subagent-not-resumable',
          message: 'subagent cannot be resumed',
          details: { childSessionId },
        })
      case 'UNAUTHORIZED':
        return err(request, {
          code: 'subagent-unauthorized',
          message: 'subagent does not belong to this parent',
          details: { childSessionId },
        })
      case 'DRAINING':
      case 'ACTIVATION_CLOSING':
      case 'CONTINUATION_UNAVAILABLE':
      case 'PERSISTENCE_UNAVAILABLE':
        return err(request, {
          code: 'subagent-delivery-unavailable',
          message: 'subagent follow-up is temporarily unavailable',
          details: { childSessionId },
        })
      default:
        break
    }
  }
  return err(request, { code: 'internal', message: 'subagent prompt failed', details: {} })
}

/** Stable RPC face of the missing projections capability, shared by every catalog read path. */
function projectionsUnavailableError(): RpcError {
  return {
    code: 'internal',
    message: 'subagent catalog is unavailable: this deployment does not mount the sessionProjections registry (load @deepseek-ai/dsh-session-projection)',
    details: {},
  }
}

/** Verify one address and mode against the complete direct-child catalog. */
async function catalogChild(
  ctx: Context,
  address: SubagentAddress,
  signal?: AbortSignal,
): Promise<{
  entry?: Extract<CatalogSubagentListEntry, { kind: 'child' }>
  error?: RpcError
}> {
  const { parentSessionId, childSessionId, mode } = address
  try {
    const entries = await ctx.subagents.listChildren(parentSessionId, signal)
    const entry = entries.find(candidate => candidate.id === childSessionId)
    if (entry === undefined || (entry.kind === 'child' && entry.mode !== mode)) {
      return {
        error: {
          code: 'subagent-not-found',
          message: `session "${childSessionId}" is not a ${mode} direct child of "${parentSessionId}"`,
          details: { parentSessionId, childSessionId },
        },
      }
    }
    if (entry.kind === 'diagnostic') {
      return {
        error: {
          code: 'subagent-catalog-diagnostic',
          message: `subagent "${childSessionId}" is ${entry.reason}`,
          details: { parentSessionId, childSessionId, reason: entry.reason },
        },
      }
    }
    return { entry }
  } catch (error: unknown) {
    if (signal?.aborted || (error instanceof SubagentError && error.code === 'CANCELLED')) {
      return { error: { code: 'cancelled', message: 'subagent catalog read was cancelled', details: {} } }
    }
    if (error instanceof SubagentError && error.code === 'SUBAGENT_CONTROL_PROJECTIONS_UNAVAILABLE') {
      return { error: projectionsUnavailableError() }
    }
    return { error: { code: 'internal', message: 'subagent catalog read failed', details: {} } }
  }
}

/**
 * The requested preset differs from the one this session already runs.
 *
 * A session's composition is fixed at creation: its history was produced under
 * that preset's tools, so adopting the identity under a different one would
 * replay tool calls the rebuilt agent cannot make. Naming a different preset
 * is therefore a caller error rather than a switch.
 */
/** The roster is absent: this deployment composes no agent presets at all. */
function noRoster(agentPreset: string): RpcError {
  return {
    code: 'agent-preset-not-found',
    message: 'this deployment composes no agent presets',
    details: { agentPreset, available: [] },
  }
}

/** Map one authoring/roster failure onto its wire code. */
function presetError(agentPreset: string, error: unknown): RpcError {
  if (error instanceof UnknownPresetError) {
    return {
      code: 'agent-preset-not-found',
      message: error.message,
      details: { agentPreset: error.presetId, available: [...error.available] },
    }
  }
  if (error instanceof PresetNotWritableError) {
    return { code: 'agent-preset-read-only', message: error.message, details: { agentPreset, reason: error.message } }
  }
  if (error instanceof InvalidPresetIdError || error instanceof PresetExistsError) {
    return { code: 'agent-preset-invalid', message: error.message, details: { agentPreset, reason: error.message } }
  }
  return { code: 'internal', message: `agent preset "${agentPreset}": ${String(error)}`, details: {} }
}

class AgentPresetConflict extends Error {
  constructor(
    readonly sessionId: SessionId,
    readonly requestedPreset: string,
    readonly existingPreset: string | undefined,
  ) {
    super(
      existingPreset === undefined
        ? `session "${sessionId}" records no agent preset, so it cannot be adopted under one; `
        + 'a deployment composing no roster records none on any session — '
        : `session "${sessionId}" already runs agent preset ${JSON.stringify(existingPreset)}; `
      + `requested ${JSON.stringify(requestedPreset)}. A session's preset is fixed at creation.`,
    )
  }
}

/** Requested identity already belongs to a session with another project cwd. */
class SessionCwdConflict extends Error {
  constructor(
    readonly sessionId: SessionId,
    readonly requestedCwd: string,
    readonly existingCwd: string | undefined,
  ) {
    super(
      `session "${sessionId}" already exists with cwd ${JSON.stringify(existingCwd)}; `
      + `requested ${JSON.stringify(requestedCwd)}`,
    )
  }
}

/** An explicit Host naming operation would duplicate another Workspace title. */
class WorkspaceNameConflictError extends Error {
  constructor(readonly workspaceName: string) {
    super(`workspace name '${workspaceName}' is already in use`)
    this.name = 'WorkspaceNameConflictError'
  }
}

/** Shared workspace-not-found error response of the workspace.* mutation rows. */
function workspaceNotFound<T>(request: RpcRequest<unknown>, workspaceId: string): RpcResponse<T> {
  return err(request, {
    code: 'workspace-not-found',
    message: `workspace "${workspaceId}" not found`,
    details: { workspaceId },
  })
}

/** Wire projection of one workspace entity (the workspace.* value row). */
function workspaceView(workspace: Workspace): WorkspaceView {
  return {
    workspaceId: workspace.id,
    path: workspace.path,
    title: workspace.title,
    sessionIds: [...workspace.sessionIds],
    createdAt: workspace.createdAt,
    updatedAt: workspace.updatedAt,
  }
}

/** Wire projection of the durable record carried by `domain/changed`. */
function changedWorkspaceView(workspaceId: string, value: unknown): WorkspaceView {
  const record: WorkspaceRecord = workspaceRecord.parse(value)
  return {
    workspaceId: workspaceId as WorkspaceId,
    path: record.path,
    title: record.title,
    sessionIds: [...record.sessionIds],
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}

/**
 * Provider-selection codes the Docker seam raises before any engine call.
 * Every one of them means the browser has no engine to show, so they collapse
 * onto one wire code instead of five the client would have to branch on.
 */
const DOCKER_SELECTION_CODES: ReadonlySet<string> = new Set([
  'DOCKER_PROVIDER_UNAVAILABLE',
  'DOCKER_PROVIDER_AMBIGUOUS',
  'DOCKER_PROVIDER_CONFIGURED_MISSING',
  'DOCKER_PROVIDER_CONFIGURED_UNAVAILABLE',
])

/** The wire refusal every docker.* row answers when no composition mounts the seam. */
function dockerAbsent(): RpcError {
  return {
    code: 'docker-unavailable',
    message: 'docker seam is absent: this composition mounts no Docker seam (e.g. @deepseek-ai/dsh-docker with @deepseek-ai/dsh-docker-local) in its plugin set',
    details: {},
  }
}

/** Map one seam failure onto the wire vocabulary: selection failures are the empty state, everything else is internal. */
function dockerError(error: unknown): RpcError {
  if (error instanceof DockerError && DOCKER_SELECTION_CODES.has(error.code)) {
    return { code: 'docker-unavailable', message: error.message, details: {} }
  }
  return { code: 'internal', message: error instanceof Error ? error.message : String(error), details: {} }
}

/**
 * Map one Compose failure onto the wire vocabulary. A selection failure stays
 * the empty state, but an engine that rejected the project is a distinct
 * answer: the operator's file was reached and refused, so the client shows the
 * engine's own text instead of an internal fault.
 */
function dockerComposeError(error: unknown): RpcError {
  if (error instanceof DockerError && !DOCKER_SELECTION_CODES.has(error.code)) {
    return { code: 'compose-failed', message: error.message, details: {} }
  }
  return dockerError(error)
}

/** Wire projection of one seam container (the state union widens to the wire's plain string). */
function dockerContainerEntry(container: DockerContainer): DockerContainerEntry {
  return {
    id: container.id,
    name: container.name,
    image: container.image,
    state: container.state,
    status: container.status,
    ...container.project === undefined ? {} : { project: container.project },
    ...container.service === undefined ? {} : { service: container.service },
    ports: [...container.ports],
    createdAt: container.createdAt,
  }
}

/** Wire projection of one seam image. */
function dockerImageEntry(image: DockerImage): DockerImageEntry {
  return {
    id: image.id,
    tags: [...image.tags],
    size: image.size,
    createdAt: image.createdAt,
  }
}

/**
 * Whether a file name is one this browser offers as a compose candidate.
 * @param name - the directory entry's base name.
 * @returns true when the name is a recognized compose file.
 */
export function isComposeFileName(name: string): boolean {
  return COMPOSE_FILE_PATTERN.test(name)
}

/** The wire refusal every git.* row answers when no composition mounts a Git seam. */
function gitAbsent(): RpcError {
  return {
    code: 'git-unavailable',
    message: 'git seam is absent: this composition mounts no @deepseek-ai/dsh-git provider in its plugin set',
    details: {},
  }
}

/**
 * Map one Git seam failure onto the domain's wire vocabulary. Provider
 * selection failures all become `git-unavailable` because they are one empty
 * state for a client; repository-level failures stay distinct, since each is a
 * state the tab renders differently.
 */
function gitError(error: unknown): RpcError {
  if (error instanceof GitError) {
    const { code } = error
    if (code.startsWith('GIT_PROVIDER_')) {
      return { code: 'git-unavailable', message: error.message, details: {} }
    }
    if (code === 'GIT_OUTSIDE_REPOSITORY' || code === 'GIT_INVALID_REQUEST') {
      return { code: 'git-denied', message: error.message, details: {} }
    }
    if (code === 'GIT_NOT_A_REPOSITORY' || code === 'GIT_NOT_FOUND') {
      return { code: 'git-not-found', message: error.message, details: {} }
    }
    if (code === 'GIT_CONFLICTED') {
      return { code: 'git-conflicted', message: error.message, details: {} }
    }
    if (code === 'GIT_NOTHING_STAGED') {
      return { code: 'git-nothing-staged', message: error.message, details: {} }
    }
    return { code: 'git-failed', message: error.message, details: {} }
  }
  if (error instanceof GitOutsideWorkspace) {
    return { code: 'git-denied', message: error.message, details: {} }
  }
  return { code: 'internal', message: error instanceof Error ? error.message : String(error), details: {} }
}

/**
 * A repository that lies outside every registered workspace. The fence runs
 * before every git.* operation including reads, so a wire value can never
 * address an arbitrary repository on the machine.
 */
export class GitOutsideWorkspace extends Error {
  constructor(root: string) {
    super(`"${root}" is not inside a registered workspace`)
    this.name = 'GitOutsideWorkspace'
  }
}

/**
 * Prove a client-supplied repository root lies inside a registered workspace,
 * and answer its canonical form. Containment is decided on the realpath of
 * both sides, so a symlink cannot present an outside repository as an inside
 * one.
 *
 * @param ctx - host context carrying the workspace registry.
 * @param root - the client-supplied repository root.
 * @returns the canonical repository root.
 * @throws {GitOutsideWorkspace} when no registered workspace contains it.
 */
async function gitRoot(ctx: Context, root: string): Promise<string> {
  let canonical: string
  try {
    canonical = await realpath(root)
  } catch {
    // An unresolvable path cannot be proven to be inside a workspace, which is
    // the same refusal as one that provably is not.
    throw new GitOutsideWorkspace(root)
  }
  for (const workspace of ctx.workspaceRegistry.list()) {
    const base = workspace.path.endsWith(sep) ? workspace.path : workspace.path + sep
    if (canonical === workspace.path || canonical.startsWith(base)) return canonical
  }
  throw new GitOutsideWorkspace(root)
}

/** Project one seam status onto its wire view. */
function gitStatusView(status: GitStatus): ResponseValue<'git.status'> {
  return {
    root: status.root,
    ...status.branch === undefined ? {} : { branch: status.branch },
    ...status.head === undefined ? {} : { head: status.head },
    ...status.upstream === undefined ? {} : { upstream: status.upstream },
    ahead: status.ahead,
    behind: status.behind,
    changes: status.changes.map(change => ({
      path: change.path,
      absolutePath: change.absolutePath,
      index: change.index,
      worktree: change.worktree,
      ...change.origPath === undefined ? {} : { origPath: change.origPath },
      ...change.similarity === undefined ? {} : { similarity: change.similarity },
      binary: change.binary,
      ...change.insertions === undefined ? {} : { insertions: change.insertions },
      ...change.deletions === undefined ? {} : { deletions: change.deletions },
    })),
    truncated: status.truncated,
  }
}

/** The wire refusal every editor.* row answers when no composition mounts a filesystem seam. */
function editorAbsent(): RpcError {
  return {
    code: 'editor-unavailable',
    message: 'filesystem seam is absent: this composition mounts no @deepseek-ai/dsh-fs provider in its plugin set',
    details: {},
  }
}

/** The project's own stage table, relative to its root; absent means the harness default table applies. */
const PROJECT_TABLE = '.spec/treadmill.yaml'

/**
 * Where an installation skill or command lives when saved into a project:
 * the project `.dsh/skills` root, which outranks the harness copy there. A
 * command becomes a flat skill file; every other installation path is refused.
 * @param path - installation-relative path.
 * @returns the project-relative path, or `undefined` when not a skill or command.
 */
function projectSkillPath(path: string): string | undefined {
  const skill = /^skills\/([a-z0-9-]+)\/(.+)$/.exec(path)
  if (skill !== null) return `.dsh/skills/${skill[1]}/${skill[2]}`
  const command = /^commands\/([a-z0-9-]+\.md)$/.exec(path)
  if (command !== null) return `.dsh/skills/${command[1]}`
  return undefined
}

/** The wire refusal every treadmill.* row answers when no composition mounts the Treadmill service. */
function treadmillAbsent(): RpcError {
  return {
    code: 'treadmill-unavailable',
    message: 'treadmill service is absent: this composition mounts no @deepseek-ai/dsh-treadmill plugin',
    details: {},
  }
}

/** Map one installation-file failure onto the treadmill wire vocabulary. */
function treadmillError(error: unknown): RpcError {
  if (error instanceof TreadmillError) {
    return { code: error.code === 'denied' ? 'treadmill-denied' : 'treadmill-not-found', message: error.message, details: {} }
  }
  return { code: 'internal', message: error instanceof Error ? error.message : String(error), details: {} }
}

/**
 * Map one filesystem failure onto the editor's wire vocabulary. Each code is a
 * state the editor renders differently, so they stay distinct rather than
 * collapsing into one internal error.
 */
function editorError(error: unknown): RpcError {
  const code = error instanceof FsError ? error.code : undefined
  if (code === 'FS_STALE_VERSION') {
    return { code: 'editor-stale', message: (error as FsError).message, details: {} }
  }
  if (code === 'FS_SANDBOX_DENIED' || code === 'FS_PERMISSION_DENIED') {
    return { code: 'editor-denied', message: (error as FsError).message, details: {} }
  }
  if (code === 'FS_NOT_TEXT') {
    return { code: 'editor-not-text', message: (error as FsError).message, details: {} }
  }
  if (code === 'FS_TOO_LARGE') {
    return { code: 'editor-too-large', message: (error as FsError).message, details: {} }
  }
  if (error instanceof EditorOutsideWorkspace) {
    return { code: 'editor-denied', message: error.message, details: {} }
  }
  return { code: 'internal', message: error instanceof Error ? error.message : String(error), details: {} }
}

/**
 * A path that resolved outside the session's workspace root. Separate from the
 * sandbox's own refusal because this fence runs first, on every operation
 * including reads, so a wire value can never address the wider filesystem.
 */
class EditorOutsideWorkspace extends Error {
  constructor(path: string) {
    super(`"${path}" is outside the session workspace`)
    this.name = 'EditorOutsideWorkspace'
  }
}

/**
 * The sandbox policy one editor write runs under. Resolved from the addressed
 * session so the write honors that session's mode and workspace root; without
 * a session the deployment default applies, which is the stricter answer.
 *
 * @param ctx - host context carrying the sandbox-policy and session services.
 * @param sessionId - the addressed session, when the client named one.
 * @returns the resolved policy, or undefined when no policy service is mounted.
 */
function editorPolicy(ctx: Context, sessionId: string | undefined): SandboxExecutionPolicy | undefined {
  const policy = ctx.get('sandboxPolicy')
  if (policy === undefined) return undefined
  const session = sessionId === undefined ? undefined : ctx.sessions.get(sessionId as SessionId)
  return session === undefined ? policy.resolve({}) : policy.resolve({ session })
}

/**
 * The workspace root the editor is fenced by: the addressed session's project
 * directory, else the deployment's own root.
 *
 * @param ctx - host context carrying the session and sandbox-policy services.
 * @param fs - the filesystem seam.
 * @param sessionId - the addressed session, when the client named one.
 * @param signal - cancellation for the resolution.
 * @returns the resolved root target.
 */
async function editorRoot(
  ctx: Context,
  fs: FileSystem,
  sessionId: string | undefined,
  signal: AbortSignal,
): Promise<FsTarget> {
  const session = sessionId === undefined ? undefined : ctx.sessions.get(sessionId as SessionId)
  const cwd = session?.header.cwd
  if (cwd !== undefined && cwd !== '') return fs.resolve(cwd, { signal })
  const policy = ctx.get('sandboxPolicy')?.resolve({})
  return fs.resolve(policy?.workspaceRoot ?? process.cwd(), { signal })
}

/**
 * Resolve a client-supplied path and prove it lives inside `root`.
 *
 * @param fs - the filesystem seam.
 * @param root - the workspace root the path must be contained by.
 * @param path - the client-supplied path.
 * @param signal - cancellation for the resolution.
 * @returns the resolved target.
 * @throws {EditorOutsideWorkspace} when the path escapes the root.
 */
async function editorTarget(
  fs: FileSystem,
  root: FsTarget,
  path: string,
  signal: AbortSignal,
): Promise<FsTarget> {
  const target = await fs.resolve(path, { cwd: root.displayPath, signal })
  // Containment is decided by the seam, which compares resolved targets rather
  // than raw strings, so `..` and symlinks cannot walk out.
  if (target.targetKey !== root.targetKey && !fs.contains(root, target)) {
    throw new EditorOutsideWorkspace(path)
  }
  return target
}


/**
 * Ancestor chain from the filesystem root to `target` inclusive — the
 * breadcrumb rows of a compose browse, every one a jump target.
 * @param target - absolute directory the browse listed.
 * @returns the crumbs, root first.
 */
function composeCrumbs(target: string): DockerComposeBrowseEntry[] {
  const crumbs: DockerComposeBrowseEntry[] = []
  let current = target
  for (;;) {
    const parent = dirname(current)
    // basename of a root is '' — label the root crumb by its full path.
    crumbs.unshift({
      name: parent === current ? current : basename(current),
      path: current,
      directory: true,
      hidden: false,
    })
    if (parent === current) return crumbs
    current = parent
  }
}

/**
 * List one directory level, keeping child directories and compose YAML files.
 * Directories come first, each group name-sorted, so the rows read as
 * "descend here" before "pick this".
 * @param target - absolute directory to list.
 * @param maxEntries - cap on returned rows.
 * @returns the rows and whether the cap dropped any.
 */
async function composeLevel(
  target: string,
  maxEntries: number,
): Promise<{ entries: DockerComposeBrowseEntry[]; truncated: boolean }> {
  const directories: DockerComposeBrowseEntry[] = []
  const files: DockerComposeBrowseEntry[] = []
  let seen = 0
  const level = await opendir(target)
  for await (const dirent of level) {
    const isDirectory = dirent.isDirectory()
    if (!isDirectory && !isComposeFileName(dirent.name)) continue
    seen += 1
    if (seen > maxEntries) continue
    const row: DockerComposeBrowseEntry = {
      name: dirent.name,
      path: join(target, dirent.name),
      directory: isDirectory,
      hidden: dirent.name.startsWith('.'),
    }
    ;(isDirectory ? directories : files).push(row)
  }
  const byName = (a: DockerComposeBrowseEntry, b: DockerComposeBrowseEntry) => a.name.localeCompare(b.name)
  directories.sort(byName)
  files.sort(byName)
  return { entries: [...directories, ...files], truncated: seen > maxEntries }
}

/**
 * Implement ApiProxy over a composed host context.
 * @param ctx - a context with the Host spine and Workspace registry mounted.
 * @param defaults - host routing and project-directory defaults.
 * @returns the ApiProxy implementation.
 */
export function createApiProxy(ctx: Context, defaults: ApiProxyDefaults): ApiProxy {
  const sessionExportCompressionLevel = defaults.sessionExportCompressionLevel
    ?? DEFAULT_SESSION_LOG_COMPRESSION_LEVEL
  const coldBlankProbeMaxBytes = defaults.coldBlankProbeMaxBytes
    ?? DEFAULT_COLD_BLANK_PROBE_MAX_BYTES
  const dockerLogMaxChars = defaults.dockerLogMaxChars ?? DEFAULT_DOCKER_LOG_MAX_CHARS
  const dockerComposeOutputMaxChars = defaults.dockerComposeOutputMaxChars ?? DEFAULT_DOCKER_COMPOSE_OUTPUT_MAX_CHARS
  const dockerComposeBrowseMaxEntries = defaults.dockerComposeBrowseMaxEntries
    ?? DEFAULT_DOCKER_COMPOSE_BROWSE_MAX_ENTRIES

  /**
   * The addressed session's own stage table, read through the sandboxed fs
   * seam; `undefined` without a session, a seam, or the file.
   */
  const projectTable = async (
    sessionId: string | undefined,
    signal: AbortSignal,
  ): Promise<{ target: FsTarget; text: string } | undefined> => {
    const fs = ctx.get('fs')
    if (sessionId === undefined || fs === undefined) return undefined
    const target = await editorTarget(fs, await editorRoot(ctx, fs, sessionId, signal), PROJECT_TABLE, signal)
    try {
      return { target, text: await fs.readText(target, signal) }
    } catch (error: unknown) {
      if (error instanceof FsError && error.code === 'FS_NOT_FOUND') return undefined
      throw error
    }
  }
  /** The seed model each create/resume declares; re-read so it never goes stale. */
  const agentOptions = (): AgentOptions => {
    const { provider, model } = defaults.defaultModelSelection()
    return { provider, model }
  }
  type WebModelSelectionRef = ModelSelectionRef & { current: ModelSelection }
  const selections = new WeakMap<Agent, WebModelSelectionRef>()
  /**
   * Serializes `agentPreset.select` per session. Two concurrent selects both
   * pass the blank check, and the second `unmountPresetFor` then finds nothing
   * to unmount because the first already removed the record — leaving two
   * compositions registered into one agent layer. The client's `busy` flag is
   * not enforcement: the wire is reachable directly.
   */
  const presetSwitches = new Map<SessionId, Promise<unknown>>()
  /** Client-chosen identity creation/resume, deduplicated across concurrent retries. */
  const sessionCreations = new Map<SessionId, Promise<Agent>>()
  /** Serializes path ownership and explicit title checks with Workspace mutations. */
  let workspaceCreationChain = Promise.resolve()
  const pendingQuestions = new Map<RpcId, PendingQuestion>()
  const pendingApprovals = new Map<RpcId, PendingApproval>()
  const muxQueues = new Set<FrameQueue<RpcRequest<MuxFrame>>>()
  const imageAdmissionChains = new WeakMap<Agent, Promise<void>>()

  /** Serialize image admission with model selection for one agent. */
  function serializeImageAdmission<T>(agent: Agent, operation: () => Promise<T>): Promise<T> {
    const result = (imageAdmissionChains.get(agent) ?? Promise.resolve()).then(operation)
    imageAdmissionChains.set(agent, result.then(() => undefined, () => undefined))
    return result
  }

  /**
   * Install or return the session-local model selection that prompt assembly snapshots.
   *
   * Precedence, resolved on EVERY read rather than seeded once: a selection
   * made in this process, else the session's own latest logged request/header,
   * else the live Agent default. Re-reading keeps the two tiers exact in both
   * directions: a session with a recorded request derives its selection from
   * its log, while a blank session (New Session reuses one rather than minting
   * another) reads any default saved after it was created. There is no create-time
   * per-session override tier on this wire — if one returns (a create-options
   * contribution), it must fold in between the selection and the log.
   */
  function selectionFor(agent: Agent): WebModelSelectionRef {
    const installed = selections.get(agent)
    if (installed !== undefined) return installed
    let picked: ModelSelection | undefined
    const selection: WebModelSelectionRef = {
      get current(): ModelSelection {
        if (picked !== undefined) return picked
        // Incrementally folded by the session, so a per-step read costs
        // O(new events) rather than a rescan.
        const logged = agent.session.requestHeader()?.config
        if (logged === undefined) return defaults.defaultModelSelection()
        return {
          provider: logged.provider,
          model: logged.model,
          ...logged.reasoningEffort === undefined
            ? {}
            : { reasoningEffort: logged.reasoningEffort },
        }
      },
      set current(next: ModelSelection) {
        picked = next
      },
      assembled: undefined,
    }
    installModelSelection(agent.ctx, selection)
    selections.set(agent, selection)
    return selection
  }

  /** Pre-publication setup used by both fresh and resumed Web agents. */
  function installSelection(agentCtx: Context): void {
    const agent = agentCtx.agent
    if (agent === undefined) throw new Error('api-proxy: agent setup has no scoped agent')
    selectionFor(agent)
  }

  /**
   * Reject an attempt to run an existing session under a different preset.
   *
   * A caller that names no preset always adopts the session as it is, so the
   * common paths — reconnecting, resuming, retrying a create — are unaffected.
   * @param sessionId - the identity being adopted.
   * @param requested - the preset the request named, if any.
   * @param existing - the preset the session RUNS, if any; both callers resolve
   * it from the log, which differs from the creation header once a blank
   * session has switched.
   * @throws when both are present and differ.
   */
  function assertPresetUnchanged(
    sessionId: SessionId,
    requested: string | undefined,
    existing: string | undefined,
  ): void {
    if (requested === undefined || requested === existing) return
    throw new AgentPresetConflict(sessionId, requested, existing)
  }

  /**
   * Resolve the preset an agent will be composed from, and the setup that
   * installs it.
   *
   * The id is resolved BEFORE the session exists because the session boundary
   * snapshots `meta` before asynchronous setup begins — a preset discovered
   * during setup could never reach the header. Mounting still happens in
   * setup, where a failure rolls the whole creation back rather than leaving a
   * published session whose capabilities are half-installed.
   *
   * A deployment with no preset roster composes nothing and every session
   * shares the host composition, which is the behavior before presets existed.
   * @param presetId - the requested preset, or `undefined` for the default.
   * @returns the id to record on the header (absent without a roster) and the setup callback.
   * @throws when the roster supplies no such preset.
   */
  async function composeAgent(presetId: string | undefined): Promise<{
    agentPreset?: string
    setup: (agentCtx: Context) => Promise<void>
  }> {
    const presets = ctx.get('agentPresets')
    if (presets === undefined) {
      return {
        setup: (agentCtx: Context) => {
          installSelection(agentCtx)
          return Promise.resolve()
        },
      }
    }
    const resolvedId = (await presets.resolve(presetId)).id
    return {
      agentPreset: resolvedId,
      setup: async (agentCtx: Context) => {
        installSelection(agentCtx)
        await presets.mount(agentCtx, resolvedId)
      },
    }
  }

  const hasSubagentOwner = (
    session: Pick<Session, 'header'>,
    agent: Agent | undefined,
  ): boolean => hasApiRemoteSubagentOwner(ctx, session, agent)
  const subagentOwnershipError = (sessionId: SessionId): RpcError =>
    apiRemoteSubagentOwnershipError(sessionId)
  const inspectServable = (sessionId: SessionId): Promise<{ meta: SessionHeader; events: SessionEvent[] }> =>
    inspectApiRemoteSession(ctx, sessionId)
  // Cold resume composes the preset the session recorded, for the same reason
  // `session.create` does: its history was produced under that composition.
  // Every generic entry point — prompt, models, commands — arrives here, so
  // leaving it out meant a session opened after a restart ran on host tools
  // and the deployment persona. Resolved from the LOG, not the header: a
  // session that switched while blank ran its turns under the newer
  // composition, and the header is written once at creation. Reading the
  // header here would silently undo the switch on the next restart and
  // restore that history under the old tool set.
  const agentFor = createApiRemoteAgentResolver(ctx, {
    agentOptions,
    setup: async ({ meta, events }) =>
      (await composeAgent(resolveSessionPreset({ header: meta, events }))).setup,
  })

  /** Send one transient frame to every connected mux consumer. */
  function broadcast(payload: MuxFrame): void {
    const envelope = frame(payload)
    for (const queue of muxQueues) queue.push(envelope)
  }

  // Projection change feed → session/projection push frames. The carrier
  // mints the wire frame (the Service Definition package holds no wire vocabulary); the
  // child activates only when a projection registry is composed, and the
  // subscription unwinds with this gateway's fiber.
  ctx.inject(['sessionProjections'], (projectionCtx) => {
    projectionCtx.sessionProjections.onChanged((session, key, value, seq) => {
      broadcast({ type: 'session/projection', sessionId: session.id, key, value, seq })
    })
  })

  // The cache supplies recency and a monotonic non-blank hint. A cached
  // `blank: true` remains only a prefix fact and is verified on the cold path.
  ctx.inject(['sessionProjections'], (projectionCtx) => {
    projectionCtx.sessionProjections.register<'sessionListMetadata', SessionListMetadata>({
      key: 'sessionListMetadata',
      schema: sessionListMetadataProjectionSchema,
      init: () => ({ blank: true, lastPromptAt: null }),
      apply: applySessionListMetadata,
      view: state => state,
      stateVersion: 1,
    })
  })

  // The imageLimits projection unit: the attachments config this proxy
  // enforces at prompt admission, constant per host boot. `apply` keeps the
  // same state reference for every event, so no change frames are ever
  // pushed — baselines alone carry the value — and clients pre-check intake
  // and label upload affordances from it. Registered here, not in the
  // attachment Service Definition: dsh-llm depends on dsh-attachment, so the
  // seam package cannot reference the projection registry without a cycle,
  // and the per-message rules the value describes are this proxy's own
  // admission checks. The child activates only while both seams are composed.
  // `view` reading the live service instead of the (null) state is sanctioned
  // exactly for boot-constant units: the value cannot change within a process
  // lifetime, so the fold stays observationally pure, and a stale persisted
  // cache row re-viewing to the current config is the correct outcome.
  ctx.inject(['sessionProjections', 'attachments'], (projectionCtx) => {
    projectionCtx.sessionProjections.register<'imageLimits', null>({
      key: 'imageLimits',
      schema: imageLimitsProjectionSchema,
      init: () => null,
      apply: state => state,
      view: () => projectionCtx.attachments.imageLimits,
      stateVersion: 1,
    })
  })

  /** Project both durable inbox lists, optionally including the splice currently being emitted. */
  const queueItems = (
    agent: Agent,
    splice?: SessionEventMap['agent/inbox/spliced'],
  ): QueuedInboxItem[] => {
    const project = (target: 'next-turn' | 'next-step'): readonly UserMessage[] => {
      const messages = target === 'next-turn' ? agent.inbox.nextTurn : agent.inbox.nextStep
      return splice?.target === target
        ? messages.toSpliced(splice.start, splice.removedCount ?? 0, ...splice.inserted)
        : messages
    }
    return [
      ...project('next-turn').map(message => ({ id: message.id, placement: 'queued' as const, message })),
      ...project('next-step').map(message => ({
        id: message.id,
        // Only user-origin messages are steering; injected context (approval
        // notices, task completion, attached snapshots) is not a user action
        // and must not render as a pending steering bubble.
        placement: message.source.kind === 'user' ? 'steering' as const : 'context' as const,
        message,
      })),
    ]
  }

  ctx.on('session/event', (session, event) => {
    if (event.type !== 'agent/inbox/spliced') return
    const agent = ctx.agents.get(session.id)
    if (agent?.session !== session) return
    broadcast({ type: 'session/queue', sessionId: session.id, items: queueItems(agent, event.data) })
  })

  /** Remove a wait before settling it: synchronous deletion makes the first claimant win. */
  function claimQuestion(pending: PendingQuestion, outcome: 'answered' | 'cancelled'): void {
    pendingQuestions.delete(pending.rpcId)
    if (pending.signal !== undefined && pending.onAbort !== undefined) {
      pending.signal.removeEventListener('abort', pending.onAbort)
    }
    broadcast({
      type: 'question/resolved', sessionId: pending.sessionId,
      questionRpcId: pending.rpcId, outcome,
    })
  }

  const disposeProvider = ctx.userQuestions.registerProvider({
    ask(request: AskUserQuestionRequest): Promise<AskUserQuestionAnswer> {
      const sessionId = request.agent?.id
      if (sessionId === undefined) {
        return Promise.reject(new UserQuestionError(
          'web user interaction requires an agent-owned session', 'ASK_MISSING_AGENT'))
      }
      return new Promise<AskUserQuestionAnswer>((resolve, reject) => {
        const rpcId = RpcId(randomUUID())
        const pending: PendingQuestion = {
          rpcId, sessionId, questions: request.questions, resolve, reject,
          ...(request.signal === undefined ? {} : { signal: request.signal }),
        }
        const onAbort = (): void => {
          claimQuestion(pending, 'cancelled')
          reject(new UserQuestionError(
            'ask_user_question was aborted before the user answered', 'ASK_ABORTED'))
        }
        pending.onAbort = onAbort
        pendingQuestions.set(rpcId, pending)
        request.signal?.addEventListener('abort', onAbort, { once: true })
        const envelope: RpcRequest<MuxFrame> = {
          rpcId,
          payload: { type: 'question/requested', sessionId, questions: request.questions },
        }
        for (const queue of muxQueues) queue.push(envelope)
      })
    },
  })
  ctx.effect(() => () => {
    disposeProvider()
    for (const pending of [...pendingQuestions.values()]) {
      claimQuestion(pending, 'cancelled')
      pending.reject(new UserQuestionError(
        'web user-questions provider was disposed', 'ASK_ABORTED'))
    }
  }, 'api-proxy: user-questions provider')

  // --- Approval pending registry ------------------------------------------
  // The proxy is the approval channel for every agent this host owns: an ask
  // through `ctx.approval` becomes an answerable server-request on the mux
  // stream (stable rpcId), settled by POST /api/respond. The entry survives
  // client disconnects — mux-open replays still-pending requested frames with
  // the same rpcId (the refresh-recovery baseline) — and withdraws on the
  // ask's own abort signal (turn cancel), pushing `cancelled` to subscribers.
  if (ctx.get('approval') !== undefined) {
    // Teardown parity with the question provider above: a gateway disposed
    // while approvals are pending settles every entry as 'cancelled' (the
    // service's fail-closed vocabulary), so no ask promise dangles past the
    // proxy's lifetime and subscribers see the withdrawal.
    ctx.effect(() => () => {
      for (const pending of [...pendingApprovals.values()]) pending.resolve('cancelled')
    }, 'api-proxy: approval registry teardown')
    ctx.on('approval/request', (req, next) => {
      // Dispatch rides a microtask behind the service's own signal check: an
      // abort landing in that window would register the abort listener AFTER
      // the signal fired — never invoked, entry pending forever, zombie frame
      // on every mux replay. Settle synchronously instead of publishing.
      if (req.signal?.aborted === true) return Promise.resolve<ApprovalOutcome>('cancelled')
      // The audit pair `approval/asked` is already appended by the service
      // before dispatch, but dispatch rides a microtask: parallel tool calls
      // can append several asked events before any answerer runs. THIS
      // request's event is therefore the newest asked event that is still
      // undecided, unclaimed by another pending entry, and — when the ask
      // names a call — carries the same callId.
      const events = req.agent.session.events
      const claimed = new Set<ApprovalRequestId>()
      for (const entry of pendingApprovals.values()) claimed.add(entry.approvalId)
      const decided = new Set<ApprovalRequestId>()
      let approvalId: ApprovalRequestId | undefined
      for (let i = events.length - 1; i >= 0; i -= 1) {
        const event = events[i] as SessionEvent
        if (event.type === 'approval/decided') {
          decided.add(event.data.id)
        } else if (event.type === 'approval/asked') {
          if (decided.has(event.data.id) || claimed.has(event.data.id)) continue
          // Symmetric pairing: a callId-bearing ask only takes its own call's
          // record, and a callId-less ask only takes a callId-less record —
          // so neither shape can steal the other's audit id under parallel
          // asks. (Today every producer — the tool executor — passes callId;
          // the callId-less arm guards any future non-tool asker.)
          if ((req.callId ?? null) !== (event.data.callId ?? null)) continue
          approvalId = event.data.id
          break
        }
      }
      // No asked event means the request bypassed the service's audit path —
      // not this channel's question; delegate to the fail-closed default.
      if (approvalId === undefined) return next()
      const id = approvalId
      return new Promise<ApprovalOutcome>((resolve) => {
        const settle = (outcome: ApprovalOutcome): void => {
          /* v8 ignore next 3 -- defensive double-settle guard: respond() routes
             through the pending table (a settled id is not-pending before it can
             re-settle) and the first settle removes the abort listener, so no
             reachable path settles twice; kept against future settle callers. */
          if (!pendingApprovals.delete(pending.rpcId)) return
          req.signal?.removeEventListener('abort', onAbort)
          broadcast({ type: 'approval/resolved', sessionId: pending.sessionId, approvalId: id, outcome })
          // A cancelled ask was already settled by the service's own signal
          // race, which discards this late resolution; resolving is a no-op
          // there and keeps this promise from dangling forever.
          resolve(outcome)
        }
        const onAbort = (): void => { settle('cancelled') }
        const pending: PendingApproval = {
          rpcId: RpcId(randomUUID()),
          sessionId: req.agent.session.id,
          approvalId: id,
          toolName: req.toolName,
          ...req.callId === undefined ? {} : { callId: req.callId },
          ...req.reason === undefined ? {} : { reason: req.reason },
          resolve: settle,
        }
        pendingApprovals.set(pending.rpcId, pending)
        req.signal?.addEventListener('abort', onAbort, { once: true })
        const envelope = requestedFrame(pending)
        for (const queue of muxQueues) queue.push(envelope)
      })
    })
  }

  type SessionReadState = {
    id: SessionId
    header: SessionHeader
    events: SessionEvent[]
  }

  /** Read one stable session prefix without acquiring an Agent owner. */
  async function readSessionState(sessionId: SessionId): Promise<SessionReadState> {
    const attached = ctx.sessions.get(sessionId)
    if (attached !== undefined) {
      return {
        id: attached.id,
        header: attached.header,
        events: [...attached.events],
      }
    }
    const inspected = await inspectServable(sessionId)
    return { id: inspected.meta.id, header: inspected.meta, events: inspected.events }
  }

  /** Resolve the Workspace inherited by a fork without making ordinary loose lineage grouped. */
  async function forkWorkspace(source: Pick<Session, 'id' | 'header'>): Promise<Workspace | undefined> {
    const workspaces = ctx.workspaceRegistry.list()
    const direct = workspaces.find(workspace => workspace.sessionIds.includes(source.id))
    if (direct !== undefined || source.header.origin !== 'subagent') return direct

    const lineage = await ctx.sessionQuery.traceSession(source.id)
    for (const ancestor of lineage.ancestors) {
      const workspace = workspaces.find(candidate => candidate.sessionIds.includes(ancestor.header.id))
      if (workspace !== undefined) return workspace
    }
    return undefined
  }

  /**
   * Resolve which session one transcript read is served from, without
   * acquiring an Agent owner. This is the read's only asynchronous step
   * besides ensuring the composition; {@link historyCutOf} takes the cut.
   * @param sessionId - the transcript being read.
   * @returns the attached session, or the inspected detached header and events.
   * @throws {@link ApiRemoteSessionNotFound} when no project-backed session has that identity.
   */
  async function historySourceFor(sessionId: SessionId): Promise<HistorySource> {
    const attached = ctx.sessions.get(sessionId)
    if (attached !== undefined) return { kind: 'attached', session: attached }
    const inspected = await inspectServable(sessionId)
    return { kind: 'detached', header: inspected.meta, events: inspected.events }
  }

  /**
   * The header and events {@link presenterScopeFor} reads to decide which
   * composition a transcript ran under.
   * @param source - the live or detached session this read is served from.
   * @returns that session's creation header and its events.
   */
  function sourceSession(source: HistorySource): PresetBearingSession {
    if (source.kind === 'detached') return { header: source.header, events: source.events }
    return { header: source.session.header, events: source.session.events }
  }

  /**
   * One transcript cut: the events and the projection baseline that describe
   * the SAME log position.
   *
   * Synchronous, and the two reads sit next to each other, because an attached
   * session keeps appending: an `await` between them would serve events cut at
   * N beside a baseline folded to N+1, which is one response describing two
   * moments. The caller does its awaiting before this call.
   * @param source - the live or detached session this read is served from.
   * @param includeProjections - whether the caller asked for the baseline (a tail page does).
   * @returns the events and, when asked, the baseline for that same position.
   */
  function historyCutOf(
    source: HistorySource,
    includeProjections: boolean,
  ): { events: SessionEvent[]; projections?: SessionProjectionsBlock } {
    if (source.kind === 'detached') {
      const projections = includeProjections ? detachedProjectionsFor(ctx, source.events) : undefined
      return { events: source.events, ...projections === undefined ? {} : { projections } }
    }
    const events = [...source.session.events]
    const projections = includeProjections ? projectionsFor(ctx, source.session) : undefined
    return { events, ...projections === undefined ? {} : { projections } }
  }

  /**
   * The registry view scope a transcript's presenters resolve in.
   *
   * A live agent is that scope itself (its chain passes through its preset's
   * standing layer). A cold session resolves its preset from the LOG, and the
   * preset's STANDING key serves without resuming anything — ensuring the
   * mount composes plugins but starts no agent, session, or turn. No roster,
   * no recorded preset, or a preset the roster no longer supplies all fall
   * back to the global layer: the transcript still serves, with the generic
   * cards a viewless entry renders.
   *
   * Reading the header alone would render a session that switched while blank
   * through the composition it was CREATED with. Every tool only the newer
   * preset registers resolves to no presenter there, and the transcript
   * silently degrades to generic cards for exactly the calls its history is
   * made of.
   * @param sessionId - the transcript being read.
   * @param session - that session's header and log (attached or inspected).
   * @returns the scope to pass to presenter lookups, or undefined for global.
   */
  async function presenterScopeFor(
    sessionId: SessionId,
    session: PresetBearingSession,
  ): Promise<ScopeKey | undefined> {
    const live = ctx.get('agents')?.get(sessionId)
    if (live !== undefined) return live
    const presets = ctx.get('agentPresets')
    if (presets === undefined) return undefined
    try {
      // An unrecorded preset (a log from before the roster existed) renders
      // through the DEFAULT preset's standing layer: that is the composition
      // an unnamed session composes today, and presenters are pure display,
      // so the worst a mismatch produces is the generic card it had anyway.
      return await presets.standingKeyFor(resolveSessionPreset(session))
    } catch {
      // Swallows only the unknown/unusable-preset rejection from the roster:
      // a deleted or broken preset must degrade this read, never fail it.
      return undefined
    }
  }

  /** Resolve one requested identity to a live agent, creating or resuming it once. */
  async function ensureSession(
    sessionId: SessionId,
    cwd: string,
    checkPersistedIdentity: boolean,
    presetId?: string,
  ): Promise<Agent> {
    let creation = sessionCreations.get(sessionId)
    if (creation === undefined) {
      creation = (async () => {
        const attached = ctx.sessions.get(sessionId)
        const live = ctx.agents.get(sessionId)
        if (attached !== undefined && hasSubagentOwner(attached, live)) {
          throw new SubagentSessionOwnership(sessionId)
        }
        if (live !== undefined) return live

        const persistence = checkPersistedIdentity ? ctx.get('sessionPersistence') : undefined
        const stored = persistence === undefined
          ? undefined
          : (await persistence.list()).find(header => header.id === sessionId)
        if (persistence !== undefined && stored !== undefined) {
          const inspected = await persistence.inspect(sessionId)
          // Ownership first: explicit-id adoption of a session-backed
          // subagent must answer `agent-busy` regardless of the requested
          // cwd (the api/commands.ts contract), not a cwd conflict.
          if (hasSubagentOwner({ header: inspected.meta }, undefined)) {
            throw new SubagentSessionOwnership(sessionId)
          }
          if (inspected.meta.cwd !== cwd) {
            throw new SessionCwdConflict(sessionId, cwd, inspected.meta.cwd)
          }
          // Resolved from the log, not the header: a session that switched
          // while blank ran every turn under the newer composition.
          const storedPreset = resolveSessionPreset({ header: inspected.meta, events: inspected.events })
          assertPresetUnchanged(sessionId, presetId, storedPreset)
          // The stored preset wins over anything the request names: a resumed
          // session's history was produced under that composition, and
          // rebuilding it differently would replay tool calls the model can no
          // longer make.
          return (await ctx.agents.resume({
            resumeSessionId: sessionId,
            agentOptions: agentOptions(),
            setup: (await composeAgent(storedPreset)).setup,
          })).agent
        }

        try {
          await mkdir(cwd, { recursive: true })
        } catch (error: unknown) {
          throw new Error(`failed to ensure project directory "${cwd}": ${String(error)}`, { cause: error })
        }
        const composition = await composeAgent(presetId)
        return (await ctx.agents.create({
          sessionId,
          agentOptions: agentOptions(),
          meta: {
            cwd,
            ...composition.agentPreset === undefined ? {} : { agentPreset: composition.agentPreset },
          },
          setup: composition.setup,
        })).agent
      })().catch((error: unknown) => {
        // Another Host entry path may have published the same identity while
        // this operation crossed an asynchronous persistence/filesystem step.
        const live = ctx.agents.get(sessionId)
        if (live !== undefined) {
          if (hasSubagentOwner(live.session, live)) throw new SubagentSessionOwnership(sessionId)
          return live
        }
        const attached = ctx.sessions.get(sessionId)
        if (attached !== undefined && hasSubagentOwner(attached, undefined)) {
          throw new SubagentSessionOwnership(sessionId)
        }
        throw error
      }).finally(() => {
        sessionCreations.delete(sessionId)
      })
      sessionCreations.set(sessionId, creation)
    }
    const agent = await creation
    if (hasSubagentOwner(agent.session, agent)) throw new SubagentSessionOwnership(sessionId)
    // Beside the cwd check for the same reason, and after the await so it
    // covers every path that yields a live agent — freshly created, adopted
    // live, resumed from disk, or recovered by the concurrent-creation catch.
    assertPresetUnchanged(sessionId, presetId, resolveSessionPreset(agent.session))
    if (agent.session.header.cwd !== cwd) {
      throw new SessionCwdConflict(sessionId, cwd, agent.session.header.cwd)
    }
    return agent
  }

  /** Resolve or create one path while holding the Host's workspace-create chain. */
  function ensureWorkspace(path: string): Promise<{ workspace: Workspace; created: boolean }> {
    const operation = workspaceCreationChain.then(async () => {
      const existing = await ctx.workspaceRegistry.resolveByPath(path)
      if (existing !== undefined) return { workspace: existing, created: false }
      return { workspace: await ctx.workspaceRegistry.create(path), created: true }
    })
    workspaceCreationChain = operation.then(() => undefined, () => undefined)
    return operation
  }

  /**
   * Build the session.list baseline shared by listing and search visibility.
   * Attached sessions come from memory; servable cold sessions merge from
   * persistence, and the final order is newest-first.
   */
  async function listVisibleSessionSummaries(signal?: AbortSignal): Promise<SessionSummary[]> {
    signal?.throwIfAborted()
    const summarizeAttached = (session: Session): SessionSummary => {
      const agent = ctx.agents.get(session.id)
      const projections = listProjectionsFor(ctx, session.header, session)
      return {
        ...summarize(session, agent?.status === 'running'),
        ...projections === undefined ? {} : { projections },
      }
    }
    const items = ctx.sessions.list().map(summarizeAttached)
    signal?.throwIfAborted()
    const attached = new Set(items.map(item => item.sessionId))
    const persistence = ctx.get('sessionPersistence')
    if (persistence !== undefined) {
      const cold = (await persistence.list(signal))
        .filter(meta => !attached.has(meta.id) && meta.cwd !== undefined)
      signal?.throwIfAborted()
      for (let offset = 0; offset < cold.length; offset += COLD_SUMMARY_BATCH_SIZE) {
        signal?.throwIfAborted()
        const batch = cold.slice(offset, offset + COLD_SUMMARY_BATCH_SIZE)
        const settled = await Promise.allSettled(
          batch.map(async (meta) => {
            // Projection hints remain optional. Blank verification may read
            // this Session's artifact only when it passes the configured size check.
            const projections = listProjectionsFor(ctx, meta, undefined)
            const summary = await summarizeCold(
              ctx,
              persistence,
              meta,
              projections?.values.sessionListMetadata,
              coldBlankProbeMaxBytes,
              signal,
            )
            const attachedSession = ctx.sessions.get(meta.id)
            if (attachedSession !== undefined) return summarizeAttached(attachedSession)
            return {
              ...summary,
              ...projections === undefined ? {} : { projections },
            }
          }),
        )
        const summaries: SessionSummary[] = []
        let rejected = false
        let failure: unknown
        for (const result of settled) {
          if (result.status === 'fulfilled') {
            summaries.push(result.value)
          } else if (!rejected) {
            rejected = true
            failure = result.reason
          }
        }
        if (rejected) throw failure
        signal?.throwIfAborted()
        items.push(...summaries)
      }
    }
    items.sort((a, b) => b.updatedAt - a.updatedAt)
    return items
  }

  /**
   * Resolve the goal service THIS agent runs.
   *
   * The service is per session: an agent preset mounts it behind an `isolate`
   * realm, which no host context resolves. Reading it from the root would
   * answer "absent" for a session whose composition mounts it — so the lookup
   * is keyed by the agent, and only a deployment composing it nowhere is
   * genuinely absent.
   */
  function goalServiceFor(agent: Agent): NonNullable<ReturnType<typeof ctx.get<'goals'>>> | { error: RpcError } {
    const presets = ctx.get('agentPresets')
    const goals = presets?.serviceFor(agent, 'goals') ?? ctx.get('goals')
    if (goals === undefined) {
      return { error: { code: 'internal', message: 'goal service is absent: neither this session\'s agent preset nor the host composition mounts @deepseek-ai/dsh-goal', details: {} } }
    }
    return goals
  }

  /** Map one goal-domain rejection to the wire error (stable GoalError codes ride in details). */
  function goalError(request: RpcRequest<unknown>, error: unknown): RpcResponse<never> {
    const details = error instanceof GoalError ? { goalCode: error.code } : {}
    return err(request, { code: 'internal', message: String(error), details })
  }

  /** Resolve a session's agent, apply one goal mutation, and acknowledge with the new CAS ref. */
  async function mutateGoal(
    request: RpcRequest<{ sessionId: SessionId }>,
    mutation: (goals: NonNullable<ReturnType<typeof ctx.get<'goals'>>>, agent: Agent) => CoreGoalRef,
  ): Promise<RpcResponse<{ ref: GoalRef }>> {
    const found = await agentFor(request.payload.sessionId)
    if ('error' in found) return err(request, found.error)
    const goals = goalServiceFor(found.agent)
    if ('error' in goals) return err(request, goals.error)
    try {
      const ref = mutation(goals, found.agent)
      return ok(request, { ref: { id: ref.id, revision: ref.revision } })
    } catch (error: unknown) {
      return goalError(request, error)
    }
  }

  /**
   * Whether an adapter currently serves this provider, and therefore whether
   * a session selecting it can start a turn. Catalog membership cannot answer
   * it: an adapter may serve a model its own catalog stopped advertising, so
   * a provider missing from the groups is not the same as one nothing serves.
   * A composition with no llm registry at all cannot judge and says yes —
   * the dispatch it would have refused fails on its own terms.
   */
  function routeServed(provider: string): boolean {
    const llm = ctx.get('llm')
    return llm === undefined || llm.listProviders().some(entry => entry.id === provider)
  }

  /**
   * Resolve the addressed agent for a turn-starting method and refuse when no
   * adapter serves its current selection: a provider nothing serves cannot start a
   * turn, and letting it try spends the whole pre-step path to fail inside
   * the adapter with a message about registration. Refusing here names the
   * model the session is pointed at while the draft is still in the composer.
   * This is `session.prompt`'s enforcement boundary: a client that disables
   * its input is an affordance, and the method stays callable regardless.
   */
  async function turnAgentFor<T>(
    request: RpcRequest<unknown>, sessionId: SessionId,
  ): Promise<{ agent: Agent } | { refused: RpcResponse<T> }> {
    const found = await agentFor(sessionId)
    if ('error' in found) return { refused: err(request, found.error) }
    const agent = found.agent
    const selection = selectionFor(agent).current
    if (!routeServed(selection.provider)) {
      return {
        refused: err(request, {
          code: 'model-unavailable',
          message: `no adapter serves provider "${selection.provider}"; select a model for this session`,
          details: { provider: selection.provider, model: selection.model },
        }),
      }
    }
    return { agent }
  }

  /** Missing-service report shared by the settings domain (skills-domain stance). */
  function settingsAbsent(): RpcError {
    return { code: 'internal', message: 'settings service is absent: this deployment does not mount a settings provider (e.g. @deepseek-ai/dsh-settings-file) in its composition', details: {} }
  }

  /** Open one Host-resolved target and map native failures onto the wire vocabulary. */
  async function openTarget(
    request: RpcRequest<unknown>, path: string, signal: AbortSignal,
    open: (path: string, signal: AbortSignal) => Promise<void>,
  ): Promise<RpcResponse<{ opened: true }>> {
    try {
      await open(path, signal)
      return ok(request, { opened: true as const })
    } catch (error: unknown) {
      if (signal.aborted) {
        return err(request, {
          code: 'cancelled',
          message: 'path open was aborted',
          details: {},
        })
      }
      return err(request, {
        code: 'internal',
        message: `path open failed: ${error instanceof Error ? error.message : String(error)}`,
        details: {},
      })
    }
  }

  /** Open one Host-resolved path with its default application. */
  function openPath(
    request: RpcRequest<unknown>, path: string, signal: AbortSignal,
  ): Promise<RpcResponse<{ opened: true }>> {
    const open = defaults.openPath
      ?? ((target: string, openSignal: AbortSignal) => openNativePath(target, openSignal))
    return openTarget(request, path, signal, open)
  }

  /** Open one Host-resolved text document in a native editor. */
  function openTextFile(
    request: RpcRequest<unknown>, path: string, signal: AbortSignal,
  ): Promise<RpcResponse<{ opened: true }>> {
    const open = defaults.openTextFile
      ?? ((target: string, openSignal: AbortSignal) => openNativeTextFile(target, openSignal))
    return openTarget(request, path, signal, open)
  }

  /** Whether this deployment can hand a path to a native opener at all. */
  function canOpenPaths(): boolean {
    if (defaults.canOpenPath !== undefined) return defaults.canOpenPath()
    // An injected opener is by definition usable; otherwise ask the platform.
    return defaults.openPath !== undefined || canOpenNativePath()
  }

  /** Missing-service report shared by the credentials domain. */
  function credentialsAbsent(): RpcError {
    return { code: 'internal', message: 'credentials service is absent: this deployment does not mount a credential provider (e.g. @deepseek-ai/dsh-credentials-local) in its composition', details: {} }
  }

  /** Map one redacted settings descriptor to its wire view. */
  function namespaceView(descriptor: SettingsDescriptor): SettingsNamespaceView {
    return {
      ns: String(descriptor.ns),
      schema: descriptor.schema,
      value: descriptor.value,
      ...descriptor.base === undefined ? {} : { base: descriptor.base },
      ...descriptor.user === undefined ? {} : { user: descriptor.user },
      applies: descriptor.applies,
      secrets: (descriptor.secrets ?? []).map(secret => ({ path: [...secret.path], set: secret.set })),
      revision: descriptor.revision,
    }
  }

  /**
   * Run one settings write (merge or wholesale replace) and acknowledge with
   * the namespace's new redacted view. Every seam refusal — unknown or invalid
   * namespace, read-only provider, schema validation, storage — becomes one
   * `settings-rejected` carrying the seam's own message.
   */
  async function settingsWrite(
    request: RpcRequest<unknown>,
    ns: string,
    mode: 'update' | 'replace' | 'mutate',
    section: object,
    expectedRevision?: number,
  ): Promise<RpcResponse<SettingsNamespaceView>> {
    const settings = ctx.get('settings')
    if (settings === undefined) return err(request, settingsAbsent())
    const rejected = (error: unknown): RpcResponse<SettingsNamespaceView> => {
      // A stale writer is its own outcome, not a malformed request: the client
      // must re-read and re-apply rather than treat the write as invalid.
      if (error instanceof SettingsConflictError) {
        return err(request, {
          code: 'settings-conflict',
          message: error.message,
          details: { ns, expected: error.expected, actual: error.actual },
        })
      }
      return err(request, {
        code: 'settings-rejected',
        message: error instanceof Error ? error.message : String(error),
        details: { ns },
      })
    }
    let branded: SettingsNamespace
    try {
      branded = settingsNamespace(ns)
    } catch (error: unknown) {
      // A malformed name can address no registration, so it fails exactly as
      // an unregistered one does.
      return rejected(error)
    }
    try {
      if (mode === 'update') await settings.update(branded, section, expectedRevision)
      else if (mode === 'replace') await settings.replace(branded, section, expectedRevision)
      else await settings.mutate(branded, section as SettingsPathOp[], expectedRevision)
    } catch (error: unknown) {
      return rejected(error)
    }
    const descriptor = settings.describe({ redactSecrets: true }).find(candidate => candidate.ns === branded)
    if (descriptor === undefined) {
      // The write committed but the namespace vanished before this read: only
      // a concurrent registrant disposal can produce it.
      return err(request, { code: 'internal', message: `settings namespace "${ns}" was disposed after the ${mode}`, details: {} })
    }
    return ok(request, namespaceView(descriptor))
  }

  return {
    sessions: {
      // Attached sessions summarize from memory; persisted-but-unattached (cold)
      // sessions merge in from the persistence store so history survives restarts.
      // Logs without a cwd are not served; every session records its project
      // at create time.
      async list(request) {
        return ok(request, { items: await listVisibleSessionSummaries() })
      },

      async search(request, signal) {
        const cancelled = () => err<{ items: SessionSearchItem[]; hasMore: boolean }>(request, {
          code: 'cancelled',
          message: 'session search was aborted',
          details: {},
        })
        if (isAborted(signal)) return cancelled()
        const sessionQuery = ctx.get('sessionQuery')
        if (sessionQuery === undefined) {
          return err(request, {
            code: 'internal',
            message: 'session search is unavailable: this deployment does not mount @deepseek-ai/dsh-session-query',
            details: {},
          })
        }
        try {
          const visible = await listVisibleSessionSummaries(signal)
          if (isAborted(signal)) return cancelled()
          if (visible.length === 0) return ok(request, { items: [], hasMore: false })
          const visibleIds = new Set(visible.map(item => item.sessionId))
          const authorized: SessionSearchItem[] = []
          const acceptedIds = new Set<SessionId>()
          const seenCursors = new Set<SessionSearchCursor>()
          let cursor: SessionSearchCursor | undefined
          let providerCallCount = 0
          let providerPageLimit = SESSION_SEARCH_RESULT_LIMIT
          while (authorized.length <= SESSION_SEARCH_RESULT_LIMIT) {
            if (isAborted(signal)) return cancelled()
            if (providerCallCount >= SESSION_SEARCH_PROVIDER_CALL_LIMIT) {
              throw new Error(
                `session search provider exceeded the ${SESSION_SEARCH_PROVIDER_CALL_LIMIT}-call work budget`,
              )
            }
            providerCallCount++
            const requestedCursor = cursor
            const requestedPageLimit = providerPageLimit
            let page
            try {
              page = await sessionQuery.searchSessions({
                query: request.payload.query,
                eventFilters: [
                  { kind: 'type', values: ['user/message', 'assistant/message'] },
                  { kind: 'surface', values: ['current'] },
                ],
                limit: requestedPageLimit,
                ...requestedCursor === undefined ? {} : { cursor: requestedCursor },
              }, { signal })
            } catch (error: unknown) {
              if (isAborted(signal)) return cancelled()
              if (
                requestedCursor === undefined
                && error instanceof SessionQueryError
                && error.code === 'SESSION_QUERY_INVALID_LIMIT'
                && requestedPageLimit > 1
              ) {
                providerPageLimit = Math.max(1, Math.floor(requestedPageLimit / 2))
                continue
              }
              if (
                requestedCursor !== undefined
                && error instanceof SessionQueryError
                && error.code === 'SESSION_QUERY_STALE_CURSOR'
              ) {
                authorized.length = 0
                acceptedIds.clear()
                seenCursors.clear()
                cursor = undefined
                continue
              }
              throw error
            }
            if (isAborted(signal)) return cancelled()
            const providerItemCount = page.items.length
            if (providerItemCount > requestedPageLimit) {
              throw new Error(
                `session search provider returned ${providerItemCount} items; maximum is ${requestedPageLimit}`,
              )
            }
            // Host visibility is the authorization boundary. Consume the
            // provider's globally ranked results rather than binding every
            // visible id into one SQLite statement, then require each hit to
            // name a visible session and a current message from that same
            // session before emitting its snippet.
            for (const hit of page.items) {
              if (authorized.length > SESSION_SEARCH_RESULT_LIMIT) continue
              if (
                !visibleIds.has(hit.header.id)
                || hit.bestMatch.sessionId !== hit.header.id
                || hit.bestMatch.surface !== 'current'
                || !MESSAGE_TYPES.has(hit.bestMatch.type)
                || acceptedIds.has(hit.header.id)
              ) continue
              const snippet = truncateUnicodeCodePoints(
                hit.bestMatch.snippet,
                SESSION_SEARCH_SNIPPET_MAX_CODE_POINTS,
              )
              acceptedIds.add(hit.header.id)
              authorized.push({
                sessionId: hit.header.id,
                snippet,
              })
            }
            const nextCursor = page.nextCursor
            if (nextCursor !== undefined) {
              if (seenCursors.has(nextCursor)) {
                throw new Error('session search provider repeated a continuation cursor')
              }
              seenCursors.add(nextCursor)
            }
            if (authorized.length > SESSION_SEARCH_RESULT_LIMIT || nextCursor === undefined) break
            cursor = nextCursor
          }
          return ok(request, {
            items: authorized.slice(0, SESSION_SEARCH_RESULT_LIMIT),
            hasMore: authorized.length > SESSION_SEARCH_RESULT_LIMIT,
          })
        } catch (error: unknown) {
          if (
            isAborted(signal)
            || (error instanceof SessionQueryError && error.code === 'SESSION_QUERY_ABORTED')
          ) return cancelled()
          // XXX: Redact provider details before exposing this gateway beyond
          // its current single-user local deployment.
          return err(request, {
            code: 'internal',
            message: `session search failed: ${String(error)}`,
            details: {},
          })
        }
      },

      async create(request) {
        const sessionId = request.payload.sessionId ?? `session-${randomUUID()}` as SessionId
        let workspace: Workspace | undefined
        if (request.payload.workspaceId !== undefined) {
          workspace = ctx.workspaceRegistry.get(brandWorkspaceId(request.payload.workspaceId))
          if (workspace === undefined) {
            return err(request, {
              code: 'workspace-not-found',
              message: `workspace "${request.payload.workspaceId}" not found`,
              details: { workspaceId: request.payload.workspaceId },
            })
          }
        }
        const cwd = workspace?.path ?? request.payload.cwd ?? defaults.cwd
        const requestedPreset = request.payload.agentPreset
        try {
          await ensureSession(sessionId, cwd, request.payload.sessionId !== undefined, requestedPreset)
        } catch (error: unknown) {
          if (error instanceof AgentPresetConflict) {
            return err(request, {
              code: 'agent-preset-conflict',
              message: error.message,
              details: {
                sessionId: error.sessionId,
                requestedPreset: error.requestedPreset,
                ...error.existingPreset === undefined ? {} : { existingPreset: error.existingPreset },
              },
            })
          }
          const refused = presetFailure(request, error)
          if (refused !== undefined) return refused
          if (error instanceof SessionCwdConflict) {
            return err(request, {
              code: 'session-conflict',
              message: error.message,
              details: {
                sessionId: error.sessionId,
                requestedCwd: error.requestedCwd,
                ...error.existingCwd === undefined ? {} : { existingCwd: error.existingCwd },
              },
            })
          }
          if (error instanceof SubagentSessionOwnership) {
            return err(request, subagentOwnershipError(error.sessionId))
          }
          return err(request, {
            code: 'internal',
            message: `failed to create session "${sessionId}": ${String(error)}`,
            details: {},
          })
        }
        if (workspace !== undefined) {
          try {
            await workspace.attachSession(sessionId)
          } catch (error: unknown) {
            return err(request, {
              code: 'workspace-attach-failed',
              message: `session "${sessionId}" was created but could not attach to workspace "${workspace.id}": ${String(error)}`,
              details: { sessionId, workspaceId: workspace.id },
            })
          }
        }
        // Echo the composition the session RUNS so a client can label it
        // without waiting for the next list refresh — the create is the commit
        // point that knows it (a caller that named none gets the default).
        // Resolved from the log for the same reason `sessionListFields()` is:
        // this handler also adopts an already-live session, and one that
        // switched while blank runs a preset its header no longer names, so
        // echoing the header would contradict both the adoption this call just
        // allowed and the row `session.list` serves for the same session.
        const created = ctx.agents.get(sessionId)
        const createdPreset = created === undefined ? undefined : resolveSessionPreset(created.session)
        return ok(request, { sessionId, ...createdPreset === undefined ? {} : { agentPreset: createdPreset } })
      },

      async history(request) {
        const { sessionId, beforeSeq, maxMessages } = request.payload
        try {
          const source = await historySourceFor(sessionId)
          // Both awaits happen BEFORE the cut. Ensuring the recorded
          // composition's standing mount is what registers its projection
          // units, so a first cold read would otherwise serve a baseline
          // missing every preset-owned key; and an attached session keeps
          // appending, so awaiting between the two reads would pair events cut
          // at N with a baseline folded to N+1.
          const scope = await presenterScopeFor(sessionId, sourceSession(source))
          const cut = historyCutOf(source, beforeSeq === undefined)
          const page = historyPage(ctx, cut.events, beforeSeq, maxMessages, scope)
          return ok(request, {
            events: page.events,
            hasMore: page.hasMore,
            ...cut.projections === undefined ? {} : { projections: cut.projections },
          })
        } catch (error: unknown) {
          if (error instanceof SessionNotFound) {
            return err(request, { code: 'session-not-found', message: error.message, details: { sessionId } })
          }
          return err(request, {
            code: 'internal',
            message: `history unavailable for session "${sessionId}": ${String(error)}`,
            details: {},
          })
        }
      },

      async models(request) {
        const { sessionId } = request.payload
        const found = await agentFor(sessionId)
        if ('error' in found) return err(request, found.error)
        const current = selectionFor(found.agent).current
        const { groups, failures } = await buildModelCatalog(ctx)
        const routable = routeServed(current.provider)
        return ok(request, { current: { ...current }, routable, groups, failures })
      },

      async selectModel(request) {
        const { sessionId, provider, model, reasoningEffort } = request.payload
        const found = await agentFor(sessionId)
        if ('error' in found) return err(request, found.error)
        return serializeImageAdmission(found.agent, async () => {
          try {
            const resolved = await ctx.llm.resolveCallConfig({
              provider,
              model,
              ...reasoningEffort === undefined
                ? {}
                : { reasoningEffort: ReasoningEffortId(reasoningEffort) },
            })
            const pendingImage = [...found.agent.inbox.nextTurn, ...found.agent.inbox.nextStep]
              .some(message => contentHasImage(message.content))
            if (pendingImage || messagesHaveImage(found.agent.session.deriveMessages())) {
              const info = await ctx.llm.resolveModelInfo(resolved.provider, resolved.model)
              if (info.inputModalities !== undefined && !info.inputModalities.includes('image')) {
                return err(request, {
                  code: 'model-unavailable',
                  message: `Model "${resolved.model}" does not accept image input, but this session already contains images; select an image-capable model.`,
                  details: { provider, model },
                })
              }
            }
            const selected: ModelSelection = {
              provider: resolved.provider,
              model: resolved.model,
              ...resolved.reasoningEffort === undefined
                ? {}
                : { reasoningEffort: resolved.reasoningEffort },
            }
            selectionFor(found.agent).current = selected
            try {
              await defaults.saveDefaultModelSelection?.(selected)
            } catch (error: unknown) {
              ctx.logger.warn(
                `api-proxy: the model switch applies to this session but was not saved as the default: ${String(error)}`,
              )
            }
            return ok(request, { selected: { ...selected } })
          } catch (error: unknown) {
            return err(request, {
              code: 'model-unavailable',
              message: error instanceof Error ? error.message : String(error),
              details: { provider, model },
            })
          }
        })
      },

      async rename(request) {
        const { sessionId, title } = request.payload
        const found = await agentFor(sessionId)
        if ('error' in found) return err(request, found.error)
        const titles = ctx.get('sessionTitle')
        if (titles === undefined) {
          return err(request, { code: 'internal', message: 'renaming is unavailable: this deployment mounts no session-title service', details: {} })
        }
        try {
          const accepted = titles.rename(found.agent.session, title)
          return ok(request, { title: accepted.title, seq: accepted.eventSeq })
        } catch (error: unknown) {
          // Only the input's fault maps to title-invalid (the message is
          // product-user-visible in the rename dialog); liveness and disposal
          // races are deployment trouble, not a bad title.
          if (error instanceof SessionTitleInvalidError) {
            return err(request, {
              code: 'title-invalid',
              message: error.message,
              details: { sessionId },
            })
          }
          return err(request, {
            code: 'internal',
            message: `failed to rename session "${sessionId}": ${String(error)}`,
            details: {},
          })
        }
      },

      async fork(request) {
        const { sessionId, atSeq } = request.payload
        let source: SessionReadState
        try {
          source = await readSessionState(sessionId)
        } catch (error: unknown) {
          if (error instanceof SessionNotFound) {
            return err(request, { code: 'session-not-found', message: error.message, details: { sessionId } })
          }
          return err(request, {
            code: 'internal',
            message: `fork source unavailable for session "${sessionId}": ${String(error)}`,
            details: {},
          })
        }
        const events = source.events
        // An in-log anchor belongs to the turn containing it and must never
        // clip backward to an earlier completed turn. Omitted and past-end
        // anchors retain the last-completed-turn shortcut.
        const lastSeq = events.at(-1)?.seq ?? -1
        const anchoredBoundary = atSeq === undefined
          ? undefined
          : events.find(e => e.type === 'turn/end' && e.seq >= atSeq)
        const boundary = anchoredBoundary
          ?? (atSeq === undefined || atSeq > lastSeq
            ? events.findLast(e => e.type === 'turn/end')
            : undefined)
        if (boundary === undefined) {
          return err(request, {
            code: 'fork-unavailable',
            message: atSeq !== undefined && atSeq <= lastSeq
              ? `session "${sessionId}" has not completed the turn containing event ${String(atSeq)}`
              : `session "${sessionId}" has no completed turn to fork from`,
            details: { sessionId },
          })
        }
        // Extend the cut through trailing out-of-band appends (session/title,
        // injections) up to the next turn/start: they are standalone events, so
        // the seed stays balanced, and the child inherits a title generated
        // right after the boundary turn.
        let cut = boundary.seq + 1
        while (cut < events.length && events[cut]?.type !== 'turn/start') cut++
        let workspace: Workspace | undefined
        try {
          workspace = await forkWorkspace(source)
        } catch (error: unknown) {
          return err(request, {
            code: 'internal',
            message: `failed to resolve fork workspace for session "${sessionId}": ${String(error)}`,
            details: {},
          })
        }
        const childId = `session-${randomUUID()}` as SessionId
        // An explicit agentPreset makes this a derived continuation: the seed
        // keeps the source's completed transcript — historical tool calls are
        // durable evidence, not an active tool contract — while the child is
        // composed under the requested preset and every later request
        // assembles only that composition's prompt and tool schemas. The
        // source's own composition stays what it was; resolveSessionPreset of
        // the child must land on the target even when the seed carries a
        // source selection event, so setup appends a child-owned selection
        // after the seed boundary (last event wins) and before publication —
        // host/session-added derives the preset synchronously at creation.
        const sourcePreset = resolveSessionPreset(source)
        const requestedPreset = request.payload.agentPreset
        let forkComposition: Awaited<ReturnType<typeof composeAgent>>
        try {
          forkComposition = await composeAgent(requestedPreset ?? sourcePreset)
        } catch (error: unknown) {
          const refused = presetFailure(request, error)
          if (refused !== undefined) return refused
          return err(request, {
            code: 'internal',
            message: `failed to fork session "${sessionId}": ${String(error)}`,
            details: {},
          })
        }
        const targetId = forkComposition.agentPreset
        const recordSelected = requestedPreset !== undefined && targetId !== undefined && targetId !== sourcePreset
        try {
          await ctx.agents.create({
            sessionId: childId,
            seed: events.slice(0, cut),
            meta: {
              ...source.header.cwd === undefined ? {} : { cwd: source.header.cwd },
              parentSession: source.id,
              seedLength: cut,
              ...targetId === undefined ? {} : { agentPreset: targetId },
            },
            agentOptions: agentOptions(),
            setup: async (agentCtx: Context) => {
              await forkComposition.setup(agentCtx)
              if (recordSelected) {
                const agent = agentCtx.agent
                if (agent === undefined) throw new Error('api-proxy: agent setup has no scoped agent')
                agent.session.append('agent-preset/selected', { agentPreset: targetId })
              }
            },
          })
        } catch (error: unknown) {
          return err(request, {
            code: 'internal',
            message: `failed to fork session "${sessionId}": ${String(error)}`,
            details: {},
          })
        }
        // An ordinary source keeps its direct Workspace. A subagent source is
        // not listed there, so its ordinary fork joins the nearest owning
        // ancestor instead. The child is already published if attach fails.
        if (workspace !== undefined) {
          try {
            await workspace.attachSession(childId)
          } catch (error: unknown) {
            return err(request, {
              code: 'workspace-attach-failed',
              message: `session "${childId}" was forked but could not attach to workspace "${workspace.id}": ${String(error)}`,
              details: { sessionId: childId, workspaceId: workspace.id },
            })
          }
        }
        return ok(request, {
          sessionId: childId,
          ...targetId === undefined ? {} : { agentPreset: targetId },
        })
      },

      async prompt(request) {
        const { sessionId, mode, content, clientTimeZone } = request.payload
        const canonicalTimeZone = clientTimeZone === undefined
          ? undefined
          : canonicalClientTimeZone(clientTimeZone)
        if (clientTimeZone !== undefined && canonicalTimeZone === undefined) {
          return err(request, {
            code: 'invalid-time-zone',
            message: 'clientTimeZone must be UTC or a valid IANA Area/Location name',
            details: { value: clientTimeZone },
          })
        }
        const resolved = await turnAgentFor<{ accepted: true }>(request, sessionId)
        if ('refused' in resolved) return resolved.refused
        const agent = resolved.agent
        // Request identity and optional browser zone ride the exact durable user message.
        const source: MessageSource = {
          kind: 'user',
          rpcId: request.rpcId,
          ...(canonicalTimeZone === undefined ? {} : { clientTimeZone: canonicalTimeZone }),
        }
        const hasImage = content.some(part => part.type === 'image')
        const admit = async (): Promise<RpcResponse<{ accepted: true }>> => {
          try {
            if (hasImage) {
              const current = selectionFor(agent).current
              const modelInfo = await ctx.llm.resolveModelInfo(current.provider, current.model)
              if (modelInfo.inputModalities !== undefined && !modelInfo.inputModalities.includes('image')) {
                return err(request, {
                  code: 'attachment-error',
                  message: `Model "${current.model}" does not support image input.`,
                  details: { reason: 'MODEL_DOES_NOT_SUPPORT_IMAGES' },
                })
              }
            }
            const durable = await durablePromptContent(ctx, content)
            const message: UserMessage = createUserMessage({ content: durable, source })
            if (mode === 'steer') agent.steer(message)
            else agent.followup(message)
          } catch (error: unknown) {
            if (error instanceof AttachmentError) {
              return err(request, {
                code: 'attachment-error',
                message: error.message,
                details: { reason: error.code },
              })
            }
            return err(request, {
              code: 'agent-busy',
              message: 'prompt rejected',
              details: { reason: String(error) },
            })
          }
          return ok(request, { accepted: true as const })
        }
        return hasImage ? serializeImageAdmission(agent, admit) : admit()
      },

      async attachment(request) {
        const { sessionId, attachmentId } = request.payload
        let state: SessionReadState
        try {
          state = await readSessionState(sessionId)
        } catch (error: unknown) {
          if (error instanceof SessionNotFound) {
            return err(request, {
              code: 'session-not-found',
              message: error.message,
              details: { sessionId },
            })
          }
          return err(request, {
            code: 'internal',
            message: `attachment authorization unavailable for session "${sessionId}": ${String(error)}`,
            details: {},
          })
        }
        const ref = referencedImage(state.events, String(attachmentId))
        if (ref === undefined) {
          return err(request, {
            code: 'attachment-error',
            message: 'Image is not referenced by this session.',
            details: { reason: 'ATTACHMENT_NOT_REFERENCED' },
          })
        }
        try {
          const stored = await ctx.attachments.readImage(ref)
          return ok(request, {
            attachment: stored.ref,
            data: Buffer.from(stored.data).toString('base64'),
          })
        } catch (error: unknown) {
          if (error instanceof AttachmentError) {
            return err(request, {
              code: 'attachment-error',
              message: error.message,
              details: { reason: error.code },
            })
          }
          return err(request, {
            code: 'internal',
            message: 'Unable to read image attachment.',
            details: {},
          })
        }
      },

      updateQueue(request) {
        const { sessionId, itemId, action } = request.payload
        if (action.kind === 'edit' && action.content.some(block => block.type !== 'text')) {
          return Promise.resolve(err(request, {
            code: 'attachment-error',
            message: 'queue edits accept text content only',
            details: { reason: 'QUEUE_EDIT_NON_TEXT' },
          }))
        }
        const agent = ctx.agents.get(sessionId)
        if (agent !== undefined && hasSubagentOwner(agent.session, agent)) {
          return Promise.resolve(err(request, subagentOwnershipError(sessionId)))
        }
        if (agent === undefined) {
          return Promise.resolve(err(request, {
            code: 'queue-item-not-found',
            message: 'queued item is no longer pending',
            details: { itemId },
          }))
        }
        const target = agent.inbox.nextTurn.some(message => message.id === itemId)
          ? 'next-turn'
          : agent.inbox.nextStep.some(message => message.id === itemId) ? 'next-step' : undefined
        const message = target === undefined
          ? undefined
          : (target === 'next-turn' ? agent.inbox.nextTurn : agent.inbox.nextStep)
            .find(candidate => candidate.id === itemId)
        if (target === undefined || message === undefined) {
          return Promise.resolve(err(request, {
            code: 'queue-item-not-found',
            message: 'queued item is no longer pending',
            details: { itemId },
          }))
        }
        if (action.kind === 'steer' && (target !== 'next-turn' || agent.status !== 'running')) {
          return Promise.resolve(err(request, {
            code: 'steer-unavailable',
            message: 'current turn no longer accepts steering',
            details: { itemId },
          }))
        }
        if (action.kind === 'edit') {
          agent.inbox.replace(itemId, freezeMessage({ ...message, content: action.content }))
        } else {
          agent.inbox.remove(itemId)
          if (action.kind === 'steer') agent.steer(message)
        }
        return Promise.resolve(ok(request, { accepted: true as const }))
      },

      cancel(request) {
        const { sessionId } = request.payload
        const agent = ctx.agents.get(sessionId)
        if (agent === undefined) {
          return Promise.resolve(err(request, {
            code: 'session-not-found',
            message: `session "${sessionId}" not found (not attached)`,
            details: { sessionId },
          }))
        }
        if (hasSubagentOwner(agent.session, agent)) {
          return Promise.resolve(err(request, subagentOwnershipError(sessionId)))
        }
        agent.cancel({ kind: 'user' }, { keepInbox: true })
        return Promise.resolve(ok(request, { accepted: true as const }))
      },
    },

    subagents: {
      async list(request, signal) {
        try {
          const entries = await ctx.subagents.listChildren(request.payload.parentSessionId, signal)
          return ok(request, {
            entries: entries.map(entry => entry.kind === 'child'
              ? {
                ...entry,
                activity: ctx.agents.get(entry.id)?.status === 'running' ? 'running' : 'inactive',
              }
              : entry),
            parentAvailable: ctx.agents.get(request.payload.parentSessionId) !== undefined,
          })
        } catch (error: unknown) {
          if (signal?.aborted || (error instanceof SubagentError && error.code === 'CANCELLED')) {
            return err(request, {
              code: 'cancelled',
              message: 'subagent catalog read was cancelled',
              details: {},
            })
          }
          if (error instanceof SubagentError && error.code === 'SUBAGENT_CONTROL_PROJECTIONS_UNAVAILABLE') {
            return err(request, projectionsUnavailableError())
          }
          return err(request, {
            code: 'internal',
            message: 'subagent catalog read failed',
            details: {},
          })
        }
      },

      async history(request, signal) {
        const {
          parentSessionId, childSessionId, mode, beforeSeq, maxMessages,
        } = request.payload
        const verified = await catalogChild(ctx, {
          parentSessionId, childSessionId, mode,
        }, signal)
        if (verified.error !== undefined) return err(request, verified.error)
        // The generic-history data plane: an attached child serves its
        // in-memory snapshot and the registry's live watermark projections; a
        // cold child is one persistence inspection plus a detached fold.
        let header: SessionHeader
        let events: SessionEvent[]
        let projections: SessionProjectionsBlock | undefined
        const attached = ctx.sessions.get(childSessionId)
        if (attached !== undefined) {
          header = attached.header
          events = [...attached.events]
          projections = beforeSeq === undefined
            ? subagentHistoryProjections(ctx, childSessionId, () => projectionsFor(ctx, attached))
            : undefined
        } else {
          try {
            const inspected = await inspectServable(childSessionId)
            header = inspected.meta
            events = inspected.events
            projections = beforeSeq === undefined
              ? subagentHistoryProjections(ctx, childSessionId, () => detachedProjectionsFor(ctx, inspected.events))
              : undefined
          } catch (error: unknown) {
            if (signal?.aborted) {
              return err(request, {
                code: 'cancelled',
                message: 'subagent history read was cancelled',
                details: {},
              })
            }
            if (error instanceof SessionNotFound) {
              return err(request, {
                code: 'subagent-not-found',
                message: 'subagent disappeared during history read',
                details: { parentSessionId, childSessionId },
              })
            }
            return err(request, {
              code: 'internal',
              message: 'subagent history read failed',
              details: {},
            })
          }
        }
        if (signal?.aborted) {
          return err(request, {
            code: 'cancelled',
            message: 'subagent history read was cancelled',
            details: {},
          })
        }
        if (header.parentSession !== parentSessionId) {
          return err(request, {
            code: 'subagent-unauthorized',
            message: 'subagent parent changed during history read',
            details: { childSessionId },
          })
        }
        const page = historyPage(ctx, events, beforeSeq, maxMessages)
        return ok(request, { ...page, ...projections === undefined ? {} : { projections } })
      },

      async prompt(request, signal) {
        const { parentSessionId, childSessionId, content, clientTimeZone } = request.payload
        const canonicalTimeZone = clientTimeZone === undefined
          ? undefined
          : canonicalClientTimeZone(clientTimeZone)
        if (clientTimeZone !== undefined && canonicalTimeZone === undefined) {
          return err(request, {
            code: 'invalid-time-zone',
            message: 'clientTimeZone must be UTC or a valid IANA Area/Location name',
            details: { value: clientTimeZone },
          })
        }
        const parent = ctx.agents.get(parentSessionId)
        if (parent === undefined) {
          return err(request, {
            code: 'subagent-parent-unavailable',
            message: `parent session "${parentSessionId}" is not live`,
            details: { parentSessionId },
          })
        }
        const verified = await catalogChild(ctx, {
          parentSessionId, childSessionId, mode: 'continuable',
        }, signal)
        if (verified.error !== undefined) return err(request, verified.error)
        try {
          const messageId = await ctx.subagents.followup(parent, childSessionId, content, {
            source: {
              kind: 'user',
              rpcId: request.rpcId,
              ...(canonicalTimeZone === undefined ? {} : { clientTimeZone: canonicalTimeZone }),
            },
            signal,
          })
          return ok(request, { messageId })
        } catch (error: unknown) {
          return subagentPromptError(request, error, signal)
        }
      },

      // Deliberately no catalog, history, persistence, or parent Agent lookup:
      // the core primitive alone authorizes the durable address against the
      // live Activation, which is what keeps a live child interruptible while
      // its parent Agent is offline. Absent targets are accepted no-ops there.
      interrupt(request) {
        const { parentSessionId, childSessionId } = request.payload
        try {
          ctx.subagents.interrupt(childSessionId, { kind: 'user', parentSessionId })
        } catch (error: unknown) {
          if (error instanceof SubagentError && error.code === 'UNAUTHORIZED') {
            return Promise.resolve(err(request, {
              code: 'subagent-unauthorized',
              message: 'subagent does not belong to this parent',
              details: { childSessionId },
            }))
          }
          return Promise.resolve(err(request, {
            code: 'internal',
            message: 'subagent interrupt failed',
            details: {},
          }))
        }
        return Promise.resolve(ok(request, { accepted: true as const }))
      },
    },

    workspace: {
      list(request) {
        return Promise.resolve(ok(request, {
          items: ctx.workspaceRegistry.list().map(workspaceView),
          archivedSessionIds: [...ctx.workspaceRegistry.archivedSessionIds],
        }))
      },

      async create(request) {
        const { path } = request.payload
        try {
          const { workspace, created } = await ensureWorkspace(path)
          return ok(request, { workspace: workspaceView(workspace), created })
        } catch (error: unknown) {
          // The registry rejects a path that does not resolve to an existing
          // directory (realpath ENOENT / not-a-directory) — the business
          // error of the typed-path flow, surfaced as a validation failure.
          return err(request, {
            code: 'workspace-invalid-path',
            message: `cannot create a workspace at "${path}": ${error instanceof Error ? error.message : String(error)}`,
            details: { path },
          })
        }
      },

      async rename(request) {
        const { payload } = request
        const workspace = ctx.workspaceRegistry.get(brandWorkspaceId(payload.workspaceId))
        if (workspace === undefined) return workspaceNotFound(request, payload.workspaceId)
        const title = payload.title.trim()
        // Uniqueness AND the same-title no-op both ride the create chain so
        // they observe the state left by earlier queued renames — checked
        // up front, a queued A→A could report success while an earlier A→B
        // still lands afterwards.
        const operation = workspaceCreationChain.then(async () => {
          if (title === workspace.title) return
          if (ctx.workspaceRegistry.list().some(other => other.id !== workspace.id && other.title === title)) {
            throw new WorkspaceNameConflictError(title)
          }
          await workspace.setTitle(title)
        })
        workspaceCreationChain = operation.then(() => undefined, () => undefined)
        try {
          await operation
        } catch (error: unknown) {
          if (error instanceof WorkspaceNameConflictError) {
            return err(request, {
              code: 'workspace-name-conflict',
              message: error.message,
              details: { name: error.workspaceName },
            })
          }
          throw error
        }
        return ok(request, { workspace: workspaceView(workspace) })
      },

      async delete(request) {
        const { workspaceId } = request.payload
        const operation = workspaceCreationChain.then(() =>
          ctx.workspaceRegistry.delete(brandWorkspaceId(workspaceId)))
        workspaceCreationChain = operation.then(() => undefined, () => undefined)
        if (!await operation) return workspaceNotFound(request, workspaceId)
        return ok(request, { deleted: true as const })
      },

      async insertBefore(request) {
        const { workspaceId, beforeWorkspaceId } = request.payload
        try {
          const workspaceIds = await ctx.workspaceRegistry.insertBefore(
            brandWorkspaceId(workspaceId),
            beforeWorkspaceId === undefined ? undefined : brandWorkspaceId(beforeWorkspaceId),
          )
          return ok(request, { workspaceIds: [...workspaceIds] })
        } catch (error: unknown) {
          if (!(error instanceof WorkspaceOrderInvalidError)) throw error
          return workspaceNotFound(request, error.workspaceId)
        }
      },

      async insertSessionBefore(request) {
        const { payload } = request
        const workspace = ctx.workspaceRegistry.get(brandWorkspaceId(payload.workspaceId))
        if (workspace === undefined) return workspaceNotFound(request, payload.workspaceId)
        try {
          await workspace.insertSessionBefore(payload.sessionId, payload.beforeSessionId)
        } catch (error: unknown) {
          // Only the entity's unaccounted-id rejection is the business code;
          // storage/durability failures propagate as internal errors.
          if (!(error instanceof WorkspaceMoveInvalidError)) throw error
          return err(request, {
            code: 'workspace-move-invalid',
            message: error.message,
            details: {
              workspaceId: payload.workspaceId,
              sessionId: payload.sessionId,
              ...payload.beforeSessionId === undefined ? {} : { beforeSessionId: payload.beforeSessionId },
            },
          })
        }
        return ok(request, { workspace: workspaceView(workspace) })
      },

      async archiveSession(request) {
        const { sessionId } = request.payload
        try {
          await ctx.workspaceRegistry.archiveSession(sessionId)
        } catch (error: unknown) {
          // Only the registry's unknown-session rejection is the business
          // code; storage/durability failures propagate as internal errors.
          if (!(error instanceof WorkspaceUnknownSessionError)) throw error
          return err(request, {
            code: 'session-not-found',
            message: error.message,
            details: { sessionId },
          })
        }
        return ok(request, { archivedSessionIds: [...ctx.workspaceRegistry.archivedSessionIds] })
      },
    },

    host: {
      describe(request) {
        // TODO: version should read apps/cli's package.json; placeholder for now.
        const selection = defaults.defaultModelSelection()
        return Promise.resolve(ok(request, {
          version: '0.0.1',
          // Same source as session.create's fallback: the UI's default project
          // must match where an unspecified-cwd session actually lands.
          cwd: defaults.cwd,
          // Read live for the same reason: this is what the NEXT session will
          // start from, so a saved default has to be what it reports.
          provider: selection.provider,
          model: selection.model,
          attachedSessions: ctx.agents.list().length,
          home: homedir(),
          canOpenPath: canOpenPaths(),
        }))
      },

      async pickDirectory(request, signal) {
        const capability = ctx.directoryPicker.capability()
        if (capability.kind !== 'native') {
          return err(request, {
            code: 'directory-picker-unavailable',
            message: `host.pickDirectory needs the native capability; the composed picker serves "${capability.kind}"`,
            details: { capability: capability.kind },
          })
        }
        try {
          const path = await capability.pick(signal)
          return ok(request, { path })
        } catch (error: unknown) {
          if (signal.aborted) {
            return err(request, {
              code: 'cancelled',
              message: 'directory picker was aborted',
              details: {},
            })
          }
          return err(request, {
            code: 'internal',
            message: `directory picker failed: ${error instanceof Error ? error.message : String(error)}`,
            details: {},
          })
        }
      },

      async listDirectory(request, signal) {
        const capability = ctx.directoryPicker.capability()
        if (capability.kind !== 'browse') {
          return err(request, {
            code: 'directory-picker-unavailable',
            message: `host.listDirectory needs the browse capability; the composed picker serves "${capability.kind}"`,
            details: { capability: capability.kind },
          })
        }
        try {
          // The carrier's signal follows the caller: a disconnect or timeout
          // stops the backend's directory scan instead of outliving it.
          return ok(request, await capability.list(request.payload.path, signal))
        } catch (error: unknown) {
          // An abort is the caller's own timeout/disconnect, not a server
          // failure — same code pickDirectory and command.execute report.
          if (signal.aborted) {
            return err(request, { code: 'cancelled', message: 'directory listing was aborted', details: {} })
          }
          return err(request, directoryError(error))
        }
      },

      async createDirectory(request) {
        const capability = ctx.directoryPicker.capability()
        if (capability.kind !== 'browse') {
          return err(request, {
            code: 'directory-picker-unavailable',
            message: `host.createDirectory needs the browse capability; the composed picker serves "${capability.kind}"`,
            details: { capability: capability.kind },
          })
        }
        try {
          return ok(request, { path: await capability.createDirectory(request.payload.path, request.payload.name) })
        } catch (error: unknown) {
          return err(request, directoryError(error))
        }
      },

      async openPath(request, signal) {
        return openPath(request, request.payload.path, signal)
      },
    },

    goals: {
      // Mutations only — the read side is the 'goal' session projection.
      // Every verb resolves the session's agent (agentFor: implicit cold
      // resume, the command.* precedent) and acknowledges with the new CAS
      // ref; the committed goal/change event carries the whole value to every
      // client through the projection frames.
      async create(request) {
        const { objective, maxGoalRounds } = request.payload
        return mutateGoal(request, (goals, agent) => goals.create(agent, {
          objective,
          ...(maxGoalRounds !== undefined ? { maxGoalRounds } : {}),
        }))
      },

      async edit(request) {
        const { ref, objective, maxGoalRounds } = request.payload
        return mutateGoal(request, (goals, agent) => goals.edit(agent, ref, {
          ...(objective !== undefined ? { objective } : {}),
          ...(maxGoalRounds !== undefined ? { maxGoalRounds } : {}),
        }))
      },

      async pause(request) {
        return mutateGoal(request, (goals, agent) => goals.pause(agent, request.payload.ref))
      },

      async resume(request) {
        return mutateGoal(request, (goals, agent) => goals.resume(agent, request.payload.ref))
      },

      async complete(request) {
        return mutateGoal(request, (goals, agent) => goals.complete(agent, request.payload.ref))
      },

      async clear(request) {
        const found = await agentFor(request.payload.sessionId)
        if ('error' in found) return err(request, found.error)
        const goals = goalServiceFor(found.agent)
        if ('error' in goals) return err(request, goals.error)
        try {
          goals.clear(found.agent, request.payload.ref)
          return ok(request, { cleared: true as const })
        } catch (error: unknown) {
          return goalError(request, error)
        }
      },
    },

    agentPresets: {
      // A deployment with no roster answers with an empty list rather than an
      // error: composing no presets is a valid deployment, and the browser
      // simply offers no choice.
      async list(request) {
        const presets = ctx.get('agentPresets')
        if (presets === undefined) return ok(request, { presets: [], authorable: false, hasDocument: false })
        const defaultId = presets.defaultId
        return ok(request, {
          presets: (await presets.list()).map(preset => ({
            id: preset.id,
            trust: preset.trust,
            isDefault: preset.id === defaultId,
            ...preset.name === undefined ? {} : { name: preset.name },
            ...preset.description === undefined ? {} : { description: preset.description },
            ...preset.broken === undefined ? {} : { broken: preset.broken },
          })),
          authorable: presets.authorable,
          hasDocument: canOpenPaths(),
        })
      },

      // Recomposing is limited to a blank session because a started
      // conversation's history was produced under its preset's tools; the
      // agent and the session survive, only the composition is swapped.
      async select(request) {
        const { sessionId, agentPreset } = request.payload
        const presets = ctx.get('agentPresets')
        if (presets === undefined) {
          return err(request, {
            code: 'agent-preset-not-found',
            message: 'this deployment composes no agent presets',
            details: { agentPreset, available: [] },
          })
        }
        const found = await agentFor(sessionId)
        if ('error' in found) return err(request, found.error)
        const { agent } = found
        const swap = async (): Promise<RpcResponse<{ agentPreset: string }>> => {
          // Re-read inside the queue: an earlier switch may have run since
          // this request arrived. A started conversation may recompose in
          // place: its completed history is durable evidence, and completed
          // tool call/result pairs stay valid provider history even when the
          // new composition no longer offers those tools — the next request
          // assembles only the new prompt and tool schemas. A running turn
          // is refused: swapping the toolset between a step's request and
          // its tool executions would strand work in flight.
          if (agent.status === 'running') {
            return err(request, {
              code: 'agent-preset-locked',
              message: `session "${sessionId}" is running a turn; switch its agent preset after the turn settles`,
              details: { sessionId, agentPreset },
            })
          }
          try {
            const preset = await presets.recompose(agent.ctx, agentPreset)
            // Recorded only after the swap committed: the log states what the
            // agent runs, and a rejected mount leaves the previous composition.
            agent.session.append('agent-preset/selected', { agentPreset: preset.id })
            return ok(request, { agentPreset: preset.id })
          } catch (error: unknown) {
            const refused = presetFailure(request, error)
            if (refused !== undefined) return refused
            return err(request, {
              code: 'internal',
              message: `failed to select agent preset "${agentPreset}": ${String(error)}`,
              details: {},
            })
          }
        }
        const queued = presetSwitches.get(sessionId) ?? Promise.resolve()
        const turn = queued.then(swap)
        presetSwitches.set(sessionId, turn.catch(() => undefined))
        try {
          return await turn
        } finally {
          if (presetSwitches.get(sessionId) === turn) presetSwitches.delete(sessionId)
        }
      },

      // Authoring is privileged (see PRIVILEGED_METHODS in dsh-client-connection):
      // a composition names the plugins a session runs, so reading one is
      // reconnaissance, and copy/remove/openDocument manage the roster and
      // drive the host desktop.
      async read(request) {
        const { agentPreset } = request.payload
        const presets = ctx.get('agentPresets')
        if (presets === undefined) return err(request, noRoster(agentPreset))
        try {
          const preset = await presets.resolve(agentPreset)
          return ok(request, {
            agentPreset: preset.id,
            trust: preset.trust,
            content: await presets.read(preset.id),
            ...preset.name === undefined ? {} : { name: preset.name },
            ...preset.description === undefined ? {} : { description: preset.description },
          })
        } catch (error: unknown) {
          return err(request, presetError(agentPreset, error))
        }
      },

      async copy(request) {
        const { from, agentPreset, name } = request.payload
        const presets = ctx.get('agentPresets')
        if (presets === undefined) return err(request, noRoster(agentPreset))
        try {
          await presets.copy(from, agentPreset, name)
          return ok(request, { agentPreset })
        } catch (error: unknown) {
          return err(request, presetError(agentPreset, error))
        }
      },

      async openDocument(request, signal) {
        const { agentPreset } = request.payload
        const presets = ctx.get('agentPresets')
        if (presets === undefined) return err(request, noRoster(agentPreset))
        try {
          const preset = await presets.resolve(agentPreset)
          // Same line as copy/remove draw: the shipped install is not the
          // user's to manage, and pointing an editor into it invites edits an
          // upgrade will silently overwrite.
          if (preset.trust !== 'user') {
            throw new PresetNotWritableError(preset.id, 'it ships with the deployment')
          }
          // The id resolved against the Host's own roots is what selects the
          // directory — no browser payload carries a path in either direction
          // unless the deployment has no opener to hand it to.
          const directory = dirname(preset.path)
          if (!canOpenPaths()) return ok(request, { opened: false as const, path: directory })
          return await openPath(request, directory, signal)
        } catch (error: unknown) {
          return err(request, presetError(agentPreset, error))
        }
      },

      async remove(request) {
        const { agentPreset } = request.payload
        const presets = ctx.get('agentPresets')
        if (presets === undefined) return err(request, noRoster(agentPreset))
        try {
          await presets.remove(agentPreset)
          return ok(request, {})
        } catch (error: unknown) {
          return err(request, presetError(agentPreset, error))
        }
      },
    },

    skills: {
      // Skill lookup never creates or resumes an agent: the session address
      // resolves to a canonical cwd from the host-resident session header, and
      // the view scope is the live agent or the preset's standing key.
      async list(request) {
        const { sessionId } = request.payload
        const session = ctx.sessions.get(sessionId)
        if (session === undefined) {
          return err(request, {
            code: 'session-not-found',
            message: `session "${sessionId}" not found (not attached)`,
            details: { sessionId },
          })
        }
        if (session.header.cwd === undefined) {
          // Every served session records its project at create time; a
          // cwd-less header is a pre-project legacy log (not served).
          return err(request, { code: 'internal', message: `session "${sessionId}" has no project cwd`, details: {} })
        }
        const cwd = session.header.cwd
        // The host registry is layered per scope and serves every session. A
        // composition may still realm-mount its own registry instead; that
        // instance is invisible to host contexts, so address it through the
        // live agent (`agents.get` keeps the no-side-effect stance above).
        const live = ctx.agents.get(sessionId)
        const presets = ctx.get('agentPresets')
        const scoped = live === undefined ? undefined : presets?.serviceFor(live, 'skills')
        // Same stance as the commands domain: a missing service means no
        // composition mounts dsh-skill, not an empty catalog. `ctx.get` also
        // keeps this handler independent of the gateway plugin's inject list
        // (an undeclared `ctx.skills` property read fails the reflect proxy).
        const skillRegistry = scoped ?? ctx.get('skills')
        if (skillRegistry === undefined) {
          return err(request, { code: 'internal', message: 'skill registry is absent: neither this session\'s agent preset nor the host composition mounts @deepseek-ai/dsh-skill', details: {} })
        }
        // The scope presenters resolve in — the live agent, else the recorded
        // preset's standing key, else the global layer — so a cold session's
        // '/' popup lists the catalog its composition actually serves.
        const scope = await presenterScopeFor(sessionId, session)
        try {
          const skills = (await skillRegistry.list({ cwd, scope })).filter(isUserInvocable)
          return ok(request, {
            skills: skills.map(skill => ({
              name: skill.name,
              description: skill.description,
              ...skill.whenToUse === undefined ? {} : { whenToUse: skill.whenToUse },
              modelInvocable: skill.invocation.modelInvocable,
              source: skill.source,
              provider: skill.provider,
              ...skill.path === undefined ? {} : { path: skill.path },
            })),
          })
        } catch (error: unknown) {
          return err(request, { code: 'internal', message: `skill listing failed: ${String(error)}`, details: {} })
        }
      },
    },

    editor: {
      // Every row resolves the path inside the session's workspace root first,
      // so a wire value can never address the wider filesystem, and reaches the
      // seam through `ctx.get('fs')` rather than an inject entry — the gateway
      // must not wait on a filesystem provider to serve its other domains.

      // Introspection over the LSP registry: no language server is contacted,
      // so this answers immediately, and a composition without the seam reports
      // an empty list rather than an error — absent language intelligence is a
      // state the editor renders, not a failure.
      languageServers(request) {
        const lsp = ctx.get('lsp')
        if (lsp === undefined) return Promise.resolve(ok(request, { servers: [] }))
        return Promise.resolve(ok(request, {
          servers: lsp.describeProviders().map(provider => ({
            id: String(provider.id),
            extensions: [...provider.extensions],
          })),
        }))
      },

      async listDir(request, signal) {
        const fs = ctx.get('fs')
        if (fs === undefined) return err(request, editorAbsent())
        const { sessionId, path } = request.payload
        try {
          const root = await editorRoot(ctx, fs, sessionId, signal)
          const target = path === undefined || path === ''
            ? root
            : await editorTarget(fs, root, path, signal)
          const children = await fs.listDir(target, signal)
          // Directories first, then files: a tree reads top-down, and mixing
          // the two by name alone buries folders among their siblings.
          const entries = children
            .filter(child => child.type === 'file' || child.type === 'directory')
            .map(child => ({
              name: child.name,
              path: child.target.displayPath,
              directory: child.type === 'directory',
            }))
            .sort((a, b) => a.directory === b.directory
              ? a.name.localeCompare(b.name)
              : (a.directory ? -1 : 1))
          return ok(request, { path: target.displayPath, root: root.displayPath, entries })
        } catch (error: unknown) {
          return err(request, editorError(error))
        }
      },

      async readFile(request, signal) {
        const fs = ctx.get('fs')
        if (fs === undefined) return err(request, editorAbsent())
        const { sessionId, path } = request.payload
        try {
          const root = await editorRoot(ctx, fs, sessionId, signal)
          const target = await editorTarget(fs, root, path, signal)
          const info = await fs.stat(target, signal)
          if (info === undefined) {
            return err(request, { code: 'editor-not-found', message: `"${path}" does not exist`, details: {} })
          }
          if (info.type !== 'file') {
            return err(request, { code: 'editor-not-found', message: `"${path}" is not a file`, details: {} })
          }
          if (info.size !== undefined && info.size > EDITOR_MAX_FILE_BYTES) {
            return err(request, {
              code: 'editor-too-large',
              message: `"${path}" is larger than this editor opens (${String(EDITOR_MAX_FILE_BYTES)} bytes)`,
              details: {},
            })
          }
          const content = await fs.readText(target, signal)
          return ok(request, { path: target.displayPath, content, version: String(info.version) })
        } catch (error: unknown) {
          return err(request, editorError(error))
        }
      },

      async writeFile(request, signal) {
        const fs = ctx.get('fs')
        if (fs === undefined) return err(request, editorAbsent())
        const { sessionId, path, content, version } = request.payload
        try {
          const root = await editorRoot(ctx, fs, sessionId, signal)
          const target = await editorTarget(fs, root, path, signal)
          // The version guard is the whole point: the agent edits the same
          // files, and an unconditional write would silently discard its work.
          const outcome = await fs.writeText(
            target,
            content,
            { kind: 'replaceIfVersion', version: version as FsVersion },
            signal,
            editorPolicy(ctx, sessionId),
          )
          return ok(request, { path: target.displayPath, version: String(outcome.version) })
        } catch (error: unknown) {
          return err(request, editorError(error))
        }
      },
    },

    treadmill: {
      // The installation is host-owned and outside every workspace, so the
      // service, not the sandboxed fs seam, reads and writes it; the service
      // refuses any path that leaves its root.
      async describe(request, signal) {
        const treadmill = ctx.get('treadmill')
        if (treadmill === undefined) return err(request, treadmillAbsent())
        const description = await treadmill.describe()
        const project = await projectTable(request.payload.sessionId, signal)
        if (project === undefined) return ok(request, { ...description, tableSource: 'global' })
        try {
          const { pipelineError: _global, ...rest } = description
          return ok(request, { ...rest, tableSource: 'project', stages: parsePipeline(project.text) })
        } catch (error: unknown) {
          return ok(request, {
            ...description, tableSource: 'project', stages: [],
            pipelineError: `${PROJECT_TABLE}: ${error instanceof Error ? error.message : String(error)}`,
          })
        }
      },
      async readFile(request) {
        const treadmill = ctx.get('treadmill')
        if (treadmill === undefined) return err(request, treadmillAbsent())
        try {
          return ok(request, { path: request.payload.path, content: await treadmill.readFile(request.payload.path) })
        } catch (error: unknown) {
          return err(request, treadmillError(error))
        }
      },
      async writeFile(request) {
        const treadmill = ctx.get('treadmill')
        if (treadmill === undefined) return err(request, treadmillAbsent())
        try {
          await treadmill.writeFile(request.payload.path, request.payload.content)
          return ok(request, { path: request.payload.path })
        } catch (error: unknown) {
          return err(request, treadmillError(error))
        }
      },
      async setStageEnabled(request, signal) {
        const treadmill = ctx.get('treadmill')
        if (treadmill === undefined) return err(request, treadmillAbsent())
        const { sessionId, id, enabled } = request.payload
        try {
          if (sessionId === undefined) {
            await treadmill.setStageEnabled(id, enabled)
            return ok(request, { id, enabled, tableSource: 'global' })
          }
          // The project's own table starts as a copy of the effective table,
          // so the first switch records every stage, not just the one flipped.
          const fs = ctx.get('fs')
          if (fs === undefined) return err(request, editorAbsent())
          const project = await projectTable(sessionId, signal)
          const text = project?.text ?? await treadmill.readFile(PIPELINE_FILE)
          const target = project?.target ?? await editorTarget(fs, await editorRoot(ctx, fs, sessionId, signal), PROJECT_TABLE, signal)
          await fs.writeText(target, setStageEnabledInTable(text, id, enabled), undefined, signal, editorPolicy(ctx, sessionId))
          return ok(request, { id, enabled, tableSource: 'project' })
        } catch (error: unknown) {
          return err(request, treadmillError(error))
        }
      },
      async saveToProject(request, signal) {
        const treadmill = ctx.get('treadmill')
        if (treadmill === undefined) return err(request, treadmillAbsent())
        const fs = ctx.get('fs')
        if (fs === undefined) return err(request, editorAbsent())
        const { sessionId, path, content } = request.payload
        const projectPath = projectSkillPath(path)
        if (projectPath === undefined) {
          return err(request, { code: 'treadmill-denied', message: `"${path}" is not a skill or command; only those can live in a project`, details: {} })
        }
        try {
          const target = await editorTarget(fs, await editorRoot(ctx, fs, sessionId, signal), projectPath, signal)
          await fs.writeText(target, content, undefined, signal, editorPolicy(ctx, sessionId))
          return ok(request, { path: projectPath })
        } catch (error: unknown) {
          return err(request, treadmillError(error))
        }
      },
    },

    git: {
      // Every row resolves the repository inside a registered workspace first,
      // so a wire value can never address an arbitrary repository, and reaches
      // the seam through `ctx.get('git')` rather than an inject entry — the
      // gateway must not wait on a Git provider to serve its other domains.
      //
      // The mutations here (stage, unstage, discard, commit) are gestures an
      // operator makes on the working tree they are looking at, the same
      // standing as `editor.writeFile`. Operations that rewrite shared history
      // or reach a remote stay out of this domain and go through the agent's
      // tools, where the session log records them.

      async listRepositories(request, signal) {
        const git = ctx.get('git')
        if (git === undefined) return err(request, gitAbsent())
        try {
          const workspaces = ctx.workspaceRegistry.list()
          const titles = new Map(workspaces.map(workspace => [workspace.path, workspace.title]))
          const found = await git.discover({
            roots: workspaces.map(workspace => workspace.path),
            maxDepth: GIT_DISCOVERY_MAX_DEPTH,
            limit: GIT_DISCOVERY_LIMIT,
          }, signal)
          return ok(request, {
            repositories: found.repositories.map(repository => ({
              root: repository.root,
              name: repository.name,
              workspacePath: repository.workspacePath,
              workspaceTitle: titles.get(repository.workspacePath) ?? repository.name,
              submodule: repository.submodule,
            })),
            truncated: found.truncated,
          })
        } catch (error: unknown) {
          return err(request, gitError(error))
        }
      },

      async status(request, signal) {
        const git = ctx.get('git')
        if (git === undefined) return err(request, gitAbsent())
        try {
          const root = await gitRoot(ctx, request.payload.root)
          return ok(request, gitStatusView(await git.status(root, signal)))
        } catch (error: unknown) {
          return err(request, gitError(error))
        }
      },

      async worktrees(request, signal) {
        const git = ctx.get('git')
        if (git === undefined) return err(request, gitAbsent())
        try {
          const root = await gitRoot(ctx, request.payload.root)
          const found = await git.worktrees(root, signal)
          // Each checkout's change count rides along, so this one call answers
          // what is in every worktree rather than forcing a request per row.
          const counted = await Promise.all(found.map(async (worktree) => {
            // A bare repository has no working tree, and a prunable checkout
            // has already lost its directory; neither has changes to count.
            if (worktree.bare || worktree.prunable !== undefined) return worktree
            try {
              const status = await git.status(worktree.path, signal)
              return { ...worktree, changes: status.changes.length }
            } catch {
              // Unreadable checkout: the row still belongs in the list, and an
              // absent count is the honest answer rather than a failed listing.
              return worktree
            }
          }))
          return ok(request, {
            worktrees: counted.map(worktree => ({
              path: worktree.path,
              name: worktree.name,
              ...worktree.branch === undefined ? {} : { branch: worktree.branch },
              ...worktree.head === undefined ? {} : { head: worktree.head },
              main: worktree.main,
              detached: worktree.detached,
              bare: worktree.bare,
              ...worktree.locked === undefined ? {} : { locked: worktree.locked },
              ...worktree.prunable === undefined ? {} : { prunable: worktree.prunable },
              ...'changes' in worktree ? { changes: worktree.changes } : {},
            })),
          })
        } catch (error: unknown) {
          return err(request, gitError(error))
        }
      },

      async compareBases(request, signal) {
        const git = ctx.get('git')
        if (git === undefined) return err(request, gitAbsent())
        const { bases } = request.payload
        try {
          const root = await gitRoot(ctx, request.payload.root)
          const comparisons = await git.compareBases({
            root,
            bases: bases ?? GIT_DEFAULT_BASES,
          }, signal)
          // Bases that do not exist here are dropped rather than shown as
          // empty rows: a repository with `main` should not be told about
          // `develop` it never had.
          return ok(request, { comparisons: comparisons.filter(entry => entry.exists) })
        } catch (error: unknown) {
          return err(request, gitError(error))
        }
      },

      async graph(request, signal) {
        const git = ctx.get('git')
        if (git === undefined) return err(request, gitAbsent())
        const { limit } = request.payload
        try {
          const root = await gitRoot(ctx, request.payload.root)
          const graph = await git.graph({
            root,
            limit: limit ?? GIT_GRAPH_DEFAULT_LIMIT,
          }, signal)
          return ok(request, {
            commits: graph.commits,
            branches: graph.branches,
            truncated: graph.truncated,
          })
        } catch (error: unknown) {
          return err(request, gitError(error))
        }
      },

      async diff(request, signal) {
        const git = ctx.get('git')
        if (git === undefined) return err(request, gitAbsent())
        const { path, side } = request.payload
        try {
          const root = await gitRoot(ctx, request.payload.root)
          return ok(request, await git.diff({ root, path, side }, signal))
        } catch (error: unknown) {
          return err(request, gitError(error))
        }
      },

      async log(request, signal) {
        const git = ctx.get('git')
        if (git === undefined) return err(request, gitAbsent())
        const { limit, path } = request.payload
        try {
          const root = await gitRoot(ctx, request.payload.root)
          const commits = await git.log({
            root,
            limit: limit ?? GIT_LOG_DEFAULT_LIMIT,
            ...path === undefined ? {} : { path },
          }, signal)
          return ok(request, { commits })
        } catch (error: unknown) {
          return err(request, gitError(error))
        }
      },

      async stage(request, signal) {
        const git = ctx.get('git')
        if (git === undefined) return err(request, gitAbsent())
        const { paths } = request.payload
        try {
          const root = await gitRoot(ctx, request.payload.root)
          await git.stage({ root, paths }, signal)
          // The settled status rides back on the mutation: the client would
          // request it immediately anyway, and deriving it here keeps the
          // panel from rendering a state the repository already left.
          return ok(request, gitStatusView(await git.status(root, signal)))
        } catch (error: unknown) {
          return err(request, gitError(error))
        }
      },

      async unstage(request, signal) {
        const git = ctx.get('git')
        if (git === undefined) return err(request, gitAbsent())
        const { paths } = request.payload
        try {
          const root = await gitRoot(ctx, request.payload.root)
          await git.unstage({ root, paths }, signal)
          return ok(request, gitStatusView(await git.status(root, signal)))
        } catch (error: unknown) {
          return err(request, gitError(error))
        }
      },

      async discard(request, signal) {
        const git = ctx.get('git')
        if (git === undefined) return err(request, gitAbsent())
        const { path, side } = request.payload
        try {
          const root = await gitRoot(ctx, request.payload.root)
          // The seam preserves the replaced content before restoring, and
          // `recoveredOid` is the handle that makes this discard undoable —
          // the reason a destructive gesture is allowed on this domain at all.
          const outcome = await git.discard({ root, path, side }, signal)
          return ok(request, {
            status: gitStatusView(await git.status(root, signal)),
            ...outcome.recoveredOid === undefined ? {} : { recoveredOid: outcome.recoveredOid },
          })
        } catch (error: unknown) {
          return err(request, gitError(error))
        }
      },

      async recover(request, signal) {
        const git = ctx.get('git')
        if (git === undefined) return err(request, gitAbsent())
        const { oid } = request.payload
        try {
          const root = await gitRoot(ctx, request.payload.root)
          return ok(request, { content: await git.readBlob(root, oid, signal) })
        } catch (error: unknown) {
          return err(request, gitError(error))
        }
      },

      async commit(request, signal) {
        const git = ctx.get('git')
        if (git === undefined) return err(request, gitAbsent())
        const { message } = request.payload
        try {
          const root = await gitRoot(ctx, request.payload.root)
          const commit = await git.commit({ root, message }, signal)
          return ok(request, {
            commit,
            status: gitStatusView(await git.status(root, signal)),
          })
        } catch (error: unknown) {
          return err(request, gitError(error))
        }
      },
    },

    docker: {
      // Read-only by design: every lifecycle operation belongs to the agent's
      // logged tool calls. `ctx.get` keeps the domain independent of the
      // gateway plugin's inject list — an undeclared `ctx.docker` property read
      // fails the reflect proxy — and a composition with no Docker seam answers
      // the same `docker-unavailable` empty state as an unreachable engine.
      // Engine management is the one exception to the read-only stance, and it
      // is not a container operation: it makes the engine reachable at all, so
      // there is no session in which a tool call could have run instead.
      async engineStatus(request, signal) {
        const docker = ctx.get('docker')
        if (docker === undefined) {
          return ok(request, {
            status: {
              running: false,
              startable: false,
              installable: false,
              detail: dockerAbsent().message,
            },
          })
        }
        try {
          return ok(request, { status: { ...await docker.engineStatus(signal) } })
        } catch (error: unknown) {
          return err(request, dockerError(error))
        }
      },

      async startEngine(request, signal) {
        const docker = ctx.get('docker')
        if (docker === undefined) return err(request, dockerAbsent())
        try {
          const result = await docker.startEngine(signal)
          return ok(request, { status: { ...result.status }, output: result.output })
        } catch (error: unknown) {
          return err(request, dockerError(error))
        }
      },

      async installEngine(request, signal) {
        const docker = ctx.get('docker')
        if (docker === undefined) return err(request, dockerAbsent())
        try {
          const result = await docker.installEngine(signal)
          return ok(request, { status: { ...result.status }, output: result.output })
        } catch (error: unknown) {
          return err(request, dockerError(error))
        }
      },

      async listContainers(request, signal) {
        const docker = ctx.get('docker')
        if (docker === undefined) return err(request, dockerAbsent())
        const { all, project } = request.payload
        try {
          const containers = await docker.list({
            ...all === undefined ? {} : { all },
            ...project === undefined ? {} : { project },
          }, signal)
          return ok(request, { containers: containers.map(dockerContainerEntry) })
        } catch (error: unknown) {
          return err(request, dockerError(error))
        }
      },

      // One container the operator can already see, acted on directly. Unlike
      // the agent's tool calls this needs no session: the gesture and its
      // subject are both on screen, and a whole project still goes through the
      // compose rows.
      async control(request, signal) {
        const docker = ctx.get('docker')
        if (docker === undefined) return err(request, dockerAbsent())
        const { container, action } = request.payload
        try {
          const settled = await docker.control({ container, action }, signal)
          return ok(request, { container: dockerContainerEntry(settled) })
        } catch (error: unknown) {
          return err(request, dockerComposeError(error))
        }
      },

      async listImages(request, signal) {
        const docker = ctx.get('docker')
        if (docker === undefined) return err(request, dockerAbsent())
        try {
          const images = await docker.images(signal)
          return ok(request, { images: images.map(dockerImageEntry) })
        } catch (error: unknown) {
          return err(request, dockerError(error))
        }
      },

      async logs(request, signal) {
        const docker = ctx.get('docker')
        if (docker === undefined) return err(request, dockerAbsent())
        const { container, tail } = request.payload
        try {
          const result = await docker.logs({
            container,
            ...tail === undefined ? {} : { tail },
          }, signal)
          // Keep the newest characters: the tail of a log explains a failure
          // that just happened. `truncated` stays true when the provider
          // already dropped entries under its own cap.
          const over = result.content.length > dockerLogMaxChars
          return ok(request, {
            container: result.container,
            content: over ? result.content.slice(result.content.length - dockerLogMaxChars) : result.content,
            truncated: over || result.truncated,
          })
        } catch (error: unknown) {
          return err(request, dockerError(error))
        }
      },

      // Compose selection is host-side because a browser `<input type="file">`
      // yields a sandboxed handle, never the host path the Docker CLI needs.
      // This row reads the host filesystem directly and needs no Docker engine,
      // so a stopped daemon still lets a person find their compose file.
      async browseCompose(request, signal) {
        const { path } = request.payload
        const target = path ?? homedir()
        try {
          const stats = await stat(target)
          if (!stats.isDirectory()) {
            return err(request, {
              code: 'directory-unreadable',
              message: `"${target}" is not a directory`,
              details: { path: target },
            })
          }
          const { entries, truncated } = await composeLevel(target, dockerComposeBrowseMaxEntries)
          if (signal.aborted) return err(request, { code: 'cancelled', message: 'browse cancelled', details: {} })
          return ok(request, {
            path: target,
            home: homedir(),
            crumbs: composeCrumbs(target),
            entries,
            truncated,
          })
        } catch (error: unknown) {
          return err(request, {
            code: 'directory-unreadable',
            message: `cannot read "${target}": ${error instanceof Error ? error.message : String(error)}`,
            details: { path: target },
          })
        }
      },

      // Compose lifecycle from the browser stays out of the read-only stance
      // for one reason: the operator picked the file, so this IS the user's
      // own action rather than the agent acting on their behalf.
      async composeUp(request, signal) {
        const docker = ctx.get('docker')
        if (docker === undefined) return err(request, dockerAbsent())
        const { file, project } = request.payload
        try {
          const result = await docker.composeUp({
            file,
            ...project === undefined ? {} : { project },
          }, signal)
          return ok(request, {
            project: result.project,
            // Keep the newest characters: Compose reports progress
            // chronologically, so the tail carries the outcome.
            output: result.output.length > dockerComposeOutputMaxChars
              ? result.output.slice(result.output.length - dockerComposeOutputMaxChars)
              : result.output,
            containers: result.containers.map(dockerContainerEntry),
          })
        } catch (error: unknown) {
          return err(request, dockerComposeError(error))
        }
      },

      async composeDown(request, signal) {
        const docker = ctx.get('docker')
        if (docker === undefined) return err(request, dockerAbsent())
        const { file, project } = request.payload
        try {
          const result = await docker.composeDown({
            file,
            ...project === undefined ? {} : { project },
          }, signal)
          return ok(request, {
            project: result.project,
            // Keep the newest characters: Compose reports progress
            // chronologically, so the tail carries the outcome.
            output: result.output.length > dockerComposeOutputMaxChars
              ? result.output.slice(result.output.length - dockerComposeOutputMaxChars)
              : result.output,
            containers: result.containers.map(dockerContainerEntry),
          })
        } catch (error: unknown) {
          return err(request, dockerComposeError(error))
        }
      },
    },

    settings: {
      describe(request) {
        const settings = ctx.get('settings')
        if (settings === undefined) return Promise.resolve(err(request, settingsAbsent()))
        return Promise.resolve(ok(request, {
          writable: settings.writable,
          hasDocument: settings.documentPath !== undefined,
          namespaces: settings.describe({ redactSecrets: true }).map(namespaceView),
        }))
      },
      async openDocument(request, signal) {
        const settings = ctx.get('settings')
        if (settings === undefined) return err(request, settingsAbsent())
        if (isAborted(signal)) {
          return err(request, {
            code: 'cancelled',
            message: 'settings document open was aborted',
            details: {},
          })
        }
        let path: string | undefined
        try {
          path = await settings.prepareDocument()
        } catch (error: unknown) {
          if (isAborted(signal)) {
            return err(request, {
              code: 'cancelled',
              message: 'settings document preparation was aborted',
              details: {},
            })
          }
          return err(request, {
            code: 'internal',
            message: `settings document preparation failed: ${error instanceof Error ? error.message : String(error)}`,
            details: {},
          })
        }
        if (path === undefined) {
          return err(request, {
            code: 'internal',
            message: 'settings provider has no local document to open',
            details: {},
          })
        }
        if (isAborted(signal)) {
          return err(request, {
            code: 'cancelled',
            message: 'settings document open was aborted',
            details: {},
          })
        }
        return openTextFile(request, path, signal)
      },
      update: request => settingsWrite(request, request.payload.ns, 'update', request.payload.patch, request.payload.expectedRevision),
      replace: request => settingsWrite(request, request.payload.ns, 'replace', request.payload.section, request.payload.expectedRevision),
      mutate: request => settingsWrite(request, request.payload.ns, 'mutate', request.payload.ops, request.payload.expectedRevision),
    },

    credentials: {
      async describe(request) {
        const credentials = ctx.get('credentials')
        if (credentials === undefined) return err(request, credentialsAbsent())
        const entries = await Promise.all(request.payload.refs.map(async (ref) => {
          const info = await credentials.describe(credentialRef(ref))
          const view: CredentialView = {
            configured: info.configured,
            ...info.source === undefined ? {} : { source: info.source },
            writable: info.writable,
          }
          return [ref, view] as const
        }))
        return ok(request, { credentials: Object.fromEntries(entries) })
      },

      async set(request) {
        const credentials = ctx.get('credentials')
        if (credentials === undefined) return err(request, credentialsAbsent())
        const { ref, value } = request.payload
        try {
          await credentials.set(credentialRef(ref), value)
        } catch (error: unknown) {
          return err(request, {
            code: 'credential-rejected',
            message: error instanceof Error ? error.message : String(error),
            details: { ref },
          })
        }
        return ok(request, {})
      },

      async unset(request) {
        const credentials = ctx.get('credentials')
        if (credentials === undefined) return err(request, credentialsAbsent())
        const { ref } = request.payload
        try {
          await credentials.unset(credentialRef(ref))
        } catch (error: unknown) {
          return err(request, {
            code: 'credential-rejected',
            message: error instanceof Error ? error.message : String(error),
            details: { ref },
          })
        }
        return ok(request, {})
      },
    },

    llm: {
      providers(request) {
        const registered = ctx.llm.listProviders()
        const active = new Set(registered.map(provider => provider.id))
        const directory = ctx.llm.listConfigurableProviders()
        const declared = new Set(directory.map(entry => entry.provider))
        const views: ConfigurableProviderView[] = directory.map(entry => ({
          provider: entry.provider,
          displayName: entry.displayName,
          settingsNs: entry.settingsNs,
          settingsPath: [...entry.settingsPath],
          active: active.has(entry.provider),
          ...entry.declared === undefined ? {} : { declared: entry.declared },
        }))
        // Routes registered without a directory declaration still appear —
        // they exist and serve models — just with no settings address. No
        // adapter claimed them, so nothing can say whether they are shipped.
        for (const provider of registered) {
          if (declared.has(provider.id)) continue
          views.push({
            provider: provider.id,
            displayName: provider.name,
            settingsNs: '',
            settingsPath: [],
            active: true,
          })
        }
        return Promise.resolve(ok(request, { providers: views }))
      },

      async models(request) {
        return ok(request, await buildModelCatalog(ctx))
      },

      async discoverModels(request, signal) {
        const { settingsNs, provider, baseURL, api, apiKey } = request.payload
        try {
          const models = await ctx.llm.discoverModels(settingsNs, {
            ...provider === undefined ? {} : { provider },
            ...baseURL === undefined ? {} : { baseURL },
            ...api === undefined ? {} : { api },
            ...apiKey === undefined ? {} : { apiKey },
            ...signal === undefined ? {} : { signal },
          })
          return ok(request, { models })
        } catch (error: unknown) {
          // Every failure here is the user's next move, not a transport fault:
          // a wrong endpoint, a rejected key, or a protocol with no listing all
          // end at the same place — fill the models in by hand. The details
          // repeat only what the caller already sent, never the credential.
          return err(request, {
            code: 'model-discovery-failed',
            message: error instanceof Error ? error.message : String(error),
            details: { settingsNs, ...baseURL === undefined ? {} : { baseURL } },
          })
        }
      },
    },

    events: {
      mux(_request, signal) {
        const queue = new FrameQueue<RpcRequest<MuxFrame>>()
        muxQueues.add(queue)
        for (const session of ctx.sessions.list()) {
          subscribeSession(queue, session)
        }
        for (const pending of pendingQuestions.values()) {
          queue.push({
            rpcId: pending.rpcId,
            payload: {
              type: 'question/requested', sessionId: pending.sessionId,
              questions: pending.questions,
            },
          })
        }
        // Refresh recovery: still-pending approval questions replay with their
        // stable rpcId so a reconnecting client can still answer them.
        for (const pending of pendingApprovals.values()) queue.push(requestedFrame(pending))
        // Queue snapshot baseline (pendingQuestions precedent): frames replayed
        // in arrival order per session; a reconnecting client rebuilds its
        // queue view from these alone.
        for (const session of ctx.sessions.list()) {
          const agent = ctx.agents.get(session.id)
          if (agent?.session === session && agent.inbox.hasPending) {
            queue.push(frame({ type: 'session/queue', sessionId: session.id, items: queueItems(agent) }))
          }
        }
        // Background-task baseline. `ctx.agents.get` is the non-resuming read:
        // a session with no live Agent owns no tasks, so it correctly sees only
        // the unowned ones, and listing never revives a cold session. An empty
        // set sends nothing — absence is how the client reads "no tasks".
        const jobs = ctx.get('jobs')
        if (jobs !== undefined) {
          for (const session of ctx.sessions.list()) {
            const views = jobViews(jobs.list(ctx.agents.get(session.id)))
            if (views.length > 0) {
              queue.push(frame({ type: 'session/jobs', sessionId: session.id, jobs: views }))
            }
          }
        }
        // Per-session open-call table for result-view pairing. Bounded by the
        // per-turn call count: entries clear on turn/end; a table miss (stream
        // opened mid-turn) backscans the session's in-memory events instead.
        const openCalls = new Map<SessionId, Map<string, { name: string; args: unknown }>>()
        const disposers = [
          ctx.on('session/event', (session: Session, event: SessionEvent) => {
            if (event.type === 'tool/call') {
              const data = event.data as ToolCallData
              try {
                let table = openCalls.get(session.id)
                if (table === undefined) openCalls.set(session.id, table = new Map<string, { name: string; args: unknown }>())
                table.set(data.callId, { name: data.name, args: JSON.parse(data.arguments) })
              } catch {
                // Unparseable model arguments: leave the table unset; the result view soft-falls.
              }
            } else if (event.type === 'turn/end') {
              openCalls.delete(session.id)
            }
            const view = viewFor(
              ctx, event,
              callId => openCalls.get(session.id)?.get(callId) ?? backscanArgs(session.events, callId),
              ctx.agents.get(session.id),
            )
            queue.push(frame({ type: 'session/event', sessionId: session.id, event, ...view === undefined ? {} : { view } }))
          }),
          ctx.on('session/created', (session: Session) => {
            subscribeSession(queue, session)
            // The subscribe frame clears the client's task mirror, and a
            // session born after the stream opened missed the baseline loop.
            // Unowned tasks are visible to it from birth, so without this it
            // would show none until the next registry change.
            const views = jobs === undefined ? [] : jobViews(jobs.list(ctx.agents.get(session.id)))
            if (views.length > 0) {
              queue.push(frame({ type: 'session/jobs', sessionId: session.id, jobs: views }))
            }
          }),
          ctx.on('session/disposed', (session: Session) => {
            openCalls.delete(session.id)
          }),
          ...jobs === undefined ? [] : [jobs.onJobsChanged((owner) => {
            if (owner !== undefined) {
              // The exact owner instance the fence compares against, so the
              // push stays correct even while that Agent's scope is tearing
              // down and a lookup by id would already miss.
              queue.push(frame({ type: 'session/jobs', sessionId: owner.id, jobs: jobViews(jobs.list(owner)) }))
              return
            }
            // An unowned task is visible to every caller, so every subscribed
            // session's set changed with it.
            for (const session of ctx.sessions.list()) {
              queue.push(frame({
                type: 'session/jobs',
                sessionId: session.id,
                jobs: jobViews(jobs.list(ctx.agents.get(session.id))),
              }))
            }
          })],
        ]
        return queue.iterate(signal, () => {
          muxQueues.delete(queue)
          for (const dispose of disposers) dispose()
        })
      },

      host(_request, signal) {
        const queue = new FrameQueue<RpcRequest<HostFrame>>()
        const committedWorkspaces = ctx.workspaceRegistry.list()
        const committedWorkspaceIds = new Set(
          committedWorkspaces.map(workspace => String(workspace.id)),
        )
        let committedWorkspaceOrder = committedWorkspaces.map(workspace => workspace.id)
        // Frame-dedup baseline, same posture as committedWorkspaceIds: the
        // stream opens against the current set; workspace.list re-baselines
        // reconnecting clients, so only later changes need frames.
        let archivedSessionIds = ctx.workspaceRegistry.archivedSessionIds
        const disposers = [
          ctx.on('session/created', (session: Session) => {
            queue.push(frame({
              type: 'host/session-added',
              sessionId: session.id,
              // Derived at frame time like summarize(); a just-created session
              // has run no turn yet, so this is constantly true in practice.
              blank: sessionBlank(session),
              // Including cwd lets the client group the new session without refreshing the list.
              ...sessionListFields(session.header, session.events),
            }))
          }),
          ctx.on('session/disposed', (session: Session) => {
            queue.push(frame({ type: 'host/session-removed', sessionId: session.id }))
          }),
          ctx.on('agent/status', ({ agent, status }: { agent: Agent; status: AgentStatus }) => {
            queue.push(frame({ type: 'host/session-status', sessionId: agent.id, running: status === 'running' }))
          }),
          ctx.on('agent/error', ({ agent, error }: { agent: Agent; error: unknown }) => {
            queue.push(frame({ type: 'host/agent-error', sessionId: agent.id, message: errorChain(error) }))
          }),
          ctx.on('domain/changed', (change) => {
            if (change.domain !== 'workspace') return
            if (change.table === '') {
              if (change.operation !== 'put') return
              const state = workspaceDomainState.parse(change.value)
              const orderChanged = state.workspaceIds.length === committedWorkspaceOrder.length
                && state.workspaceIds.every(workspaceId => committedWorkspaceIds.has(String(workspaceId)))
                && state.workspaceIds.some((workspaceId, index) => workspaceId !== committedWorkspaceOrder[index])
              for (const workspaceId of state.workspaceIds) {
                if (committedWorkspaceIds.has(workspaceId)) continue
                const workspace = ctx.workspaceRegistry.get(workspaceId)
                if (workspace === undefined) {
                  throw new Error(`committed workspace registry references missing workspace "${workspaceId}"`)
                }
                committedWorkspaceIds.add(workspaceId)
                queue.push(frame({ type: 'host/workspace-changed', workspace: workspaceView(workspace) }))
              }
              committedWorkspaceOrder = [...state.workspaceIds]
              if (orderChanged) {
                queue.push(frame({
                  type: 'host/workspace-order-changed',
                  workspaceIds: [...state.workspaceIds],
                }))
              }
              if (state.archivedSessionIds.length !== archivedSessionIds.length
                || state.archivedSessionIds.some((id, index) => id !== archivedSessionIds[index])) {
                archivedSessionIds = state.archivedSessionIds
                queue.push(frame({
                  type: 'host/archived-sessions-changed',
                  archivedSessionIds: [...state.archivedSessionIds],
                }))
              }
              return
            }
            if (change.table !== 'workspaces') return
            if (change.operation === 'deleted') {
              if (!committedWorkspaceIds.delete(change.key)) return
              queue.push(frame({
                type: 'host/workspace-removed',
                workspaceId: change.key as WorkspaceId,
              }))
              return
            }
            if (!committedWorkspaceIds.has(change.key)) return
            // Existing-entity table writes are complete attach/touch commits.
            // A new entity's first put waits for the global registry write above.
            queue.push(frame({
              type: 'host/workspace-changed',
              workspace: changedWorkspaceView(change.key, change.value),
            }))
          }),
          // Allowlisted host events ride one verbatim wrapper frame each. The
          // allowlist is api-remotes', and `ctx.remote.$on` is the consumer
          // face; nothing here projects, redacts, or renames.
          ...API_REMOTE_FORWARDED_EVENTS.map(name => ctx.on(
            name,
            // The allowlist's shape assertion proves each name is a real,
            // non-scoped, void-returning event, so the rest-parameter handler
            // satisfies every member of the union `on` accepts here;
            // assertJsonArgs proves the payload is JSON-safe before it queues.
            ((...args: unknown[]) => {
              queue.push(frame({
                type: 'host/remote-event',
                event: name,
                args: assertJsonArgs(name, args),
              }))
            }),
          )),
        ]
        return queue.iterate(signal, () => { for (const dispose of disposers) dispose() })
      },
    },

    downloads: {
      async sessionLog(request, signal) {
        // Clean error path first: missing services answer 500 and a missing
        // root artifact 404 before any zip byte is produced. The root content
        // read here is reused as the first zip entry, so nothing is read twice.
        const deps = sessionLogExportDeps(ctx)
        if (deps.sessionQuery === undefined || deps.sessionPersistence === undefined || deps.attachments === undefined) {
          return new Response(
            'session log export is unavailable: missing session-query, session-persistence, or attachments service',
            { status: 500 },
          )
        }
        if (!deps.sessionPersistence.supportsRawArtifacts) {
          return new Response(
            'session log export is unavailable: the persistence backend does not expose per-session raw artifacts',
            { status: 501 },
          )
        }
        const ready: SessionLogExportReady = {
          sessionQuery: deps.sessionQuery,
          sessionPersistence: deps.sessionPersistence,
          attachments: deps.attachments,
          sessions: deps.sessions,
        }
        let root: SessionRawArtifact | undefined
        try {
          await flushLiveSessionLog(deps, request.sessionId, signal)
          root = await deps.sessionPersistence.readRaw(request.sessionId, signal)
          signal.throwIfAborted()
        } catch {
          signal.throwIfAborted()
          // Root preparation failure: answer 500 without echoing the error,
          // which may carry absolute host paths into the browser error bar.
          return new Response('session log export failed to prepare the stored artifact', { status: 500 })
        }
        if (root === undefined) {
          return new Response('session not found', { status: 404 })
        }
        return new Response(
          streamSessionLogZip(
            ready,
            root,
            request.sessionId,
            request.includeDescendants === true,
            sessionExportCompressionLevel,
            signal,
          ),
          {
            headers: {
              'content-type': 'application/zip',
              'content-disposition': `attachment; filename="${sessionLogZipFilename(request.sessionId)}"`,
            },
          },
        )
      },
    },

    respond(message: ClientResponse): Promise<RpcReceipt> {
      // Route by the echoed rpcId (the wire correlation): approvals first,
      // then questions — the two registries share one id space of UUIDs.
      const approval = pendingApprovals.get(message.rpcId)
      if (approval !== undefined) {
        if (!message.result.ok) return Promise.resolve({ accepted: false, reason: 'bad-response' })
        const parsed = approvalResponsePayloadSchema.safeParse(message.result.value)
        // The payload's audit correlation must match the entry the rpcId routed
        // to — a mismatched answer is malformed, not merely late.
        if (!parsed.success || parsed.data.approvalId !== approval.approvalId || parsed.data.sessionId !== approval.sessionId) {
          return Promise.resolve({ accepted: false, reason: 'bad-response' })
        }
        approval.resolve(parsed.data.outcome)
        return Promise.resolve({ accepted: true })
      }
      const pending = pendingQuestions.get(message.rpcId)
      if (pending === undefined) return Promise.resolve({ accepted: false, reason: 'not-pending' })
      if (!message.result.ok) {
        if (message.result.error.code !== 'cancelled') {
          return Promise.resolve({ accepted: false, reason: 'bad-response' })
        }
        claimQuestion(pending, 'cancelled')
        pending.reject(new UserQuestionError(
          'the user cancelled ask_user_question', 'ASK_CANCELLED'))
        return Promise.resolve({ accepted: true })
      }
      const parsed = questionResponsePayloadSchema.safeParse(message.result.value)
      if (!parsed.success) {
        return Promise.resolve({ accepted: false, reason: 'bad-response' })
      }
      const payload: QuestionResponsePayload = {
        sessionId: parsed.data.sessionId,
        answer: {
          answers: parsed.data.answer.answers.map(answer => ({
            id: answer.id,
            selected: answer.selected,
            ...(answer.custom === undefined ? {} : { custom: answer.custom }),
          })),
        },
      }
      if (!matchesQuestions(payload, pending)) {
        return Promise.resolve({ accepted: false, reason: 'bad-response' })
      }
      claimQuestion(pending, 'answered')
      pending.resolve(payload.answer)
      return Promise.resolve({ accepted: true })
    },
  }
}
