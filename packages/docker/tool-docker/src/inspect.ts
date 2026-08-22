/**
 * The model-facing read-only Docker tools: `docker_ps`, `docker_images`, and
 * `docker_logs`. Execution goes through `ctx.docker` — this module owns only
 * the model-facing schemas, argument validation, output caps, and formatting,
 * never provider selection or process execution.
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { GenericCallView } from '@deepseek-ai/dsh-tools'
import type { DockerContainer, DockerImage } from '@deepseek-ai/dsh-docker'
import type {} from '@deepseek-ai/dsh-system-prompt'

/** Model-facing `docker_ps` arguments. */
interface DockerPsArgs {
  all?: boolean
  project?: string
}

/** Model-facing `docker_logs` arguments. */
interface DockerLogsArgs {
  container: string
  tail?: number
  since?: string
}

/**
 * One container as the tool's JSON output carries it. The seam's own type
 * narrows `state` to a union and marks fields readonly; the model-facing
 * output schema is plain mutable JSON, so the projection below is where the
 * two meet.
 */
export interface ContainerRow {
  id: string
  name: string
  image: string
  state: string
  status: string
  project?: string
  service?: string
  ports: string[]
  createdAt: string
}

/** One image as the tool's JSON output carries it. */
export interface ImageRow {
  id: string
  tags: string[]
  size: number
  createdAt: string
}

/**
 * Project one seam container onto its model-facing JSON row, omitting each
 * absent optional field.
 * @param container - one container from `ctx.docker`.
 * @returns the plain JSON row the output schema declares.
 */
export function containerRow(container: DockerContainer): ContainerRow {
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

/** Render one container as a single model-facing line. */
function containerLine(container: ContainerRow): string {
  const scope = container.project === undefined
    ? ''
    : ` [${container.project}${container.service === undefined ? '' : `/${container.service}`}]`
  const published = container.ports.length === 0 ? '' : ` ports=${container.ports.join(' ')}`
  return `${container.name}${scope} ${container.state} (${container.status}) image=${container.image}${published}`
}

/**
 * Format a container listing as model-facing text.
 * @param containers - the seam's containers, in engine order.
 * @returns one line per container, or an explicit empty-listing note.
 */
export function formatContainers(containers: readonly ContainerRow[]): string {
  if (containers.length === 0) return 'No containers matched.'
  return containers.map(containerLine).join('\n')
}

/**
 * Project one seam image onto its model-facing JSON row.
 * @param image - one image from `ctx.docker`.
 * @returns the plain JSON row the output schema declares.
 */
export function imageRow(image: DockerImage): ImageRow {
  return { id: image.id, tags: [...image.tags], size: image.size, createdAt: image.createdAt }
}

/** Render a byte count in the units a human reads in `docker images`. */
function humanSize(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)}GB`
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)}MB`
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(1)}kB`
  return `${String(bytes)}B`
}

/**
 * Format an image listing as model-facing text.
 * @param images - the seam's local images.
 * @returns one line per image, or an explicit empty-listing note.
 */
export function formatImages(images: readonly ImageRow[]): string {
  if (images.length === 0) return 'No images found.'
  return images
    .map(image => `${image.tags.length === 0 ? '<untagged>' : image.tags.join(' ')} ${humanSize(image.size)} id=${image.id}`)
    .join('\n')
}

/**
 * Cap log text to the deployment's character budget, keeping the newest
 * entries: the tail is what explains a failure that just happened.
 * @param content - the collected log text.
 * @param maxChars - the deployment's cap on emitted characters.
 * @returns the capped text and whether anything was dropped here.
 */
export function capLogs(content: string, maxChars: number): { text: string; dropped: boolean } {
  if (content.length <= maxChars) return { text: content, dropped: false }
  return { text: content.slice(content.length - maxChars), dropped: true }
}

/** Pending-call presentation for a container or image listing. */
function presentListCall(title: string): GenericCallView {
  return { card: 'generic', title, kind: 'search', rawInput: title }
}

/**
 * Register the read-only Docker tools and their prompt guidance.
 * @param ctx - context carrying the docker, tools, and systemPrompt services.
 * @param timeoutMs - cooperative tool-call budget for each read.
 * @param maxLogChars - cap on characters one `docker_logs` call emits.
 */
export function applyDockerInspectTools(ctx: Context, timeoutMs: number, maxLogChars: number): void {
  ctx.systemPrompt.section({
    name: 'tool:docker_inspect',
    order: 112,
    text: 'Use docker_ps to see which containers exist and whether they are running, docker_images to see locally available images, and docker_logs to read a container\'s recent output when diagnosing a failure. These tools only observe; they never start or stop anything.',
  })

  ctx.tools.register(defineTool({
    name: 'docker_ps',
    description: 'List Docker containers. Running containers only by default; set all to include stopped ones.',
    parameters: {
      all: { type: 'boolean', description: 'Include stopped containers. Defaults to false.' },
      project: { type: 'string', description: 'Restrict to one Docker Compose project name.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          containers: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: { type: 'string', required: true },
                name: { type: 'string', required: true },
                image: { type: 'string', required: true },
                state: { type: 'string', required: true },
                status: { type: 'string', required: true },
                project: { type: 'string' },
                service: { type: 'string' },
                ports: { type: 'array', required: true, items: { type: 'string' } },
                createdAt: { type: 'string', required: true },
              },
            },
          },
        },
      },
      render: (_args, value) => [{ type: 'text', text: formatContainers(value.containers) }],
    },
    timeoutMs,
    // Reads do not mutate parent-agent state.
    isConcurrencySafe: () => true,
    async execute(args: DockerPsArgs, exec) {
      const containers = await ctx.docker.list({
        ...args.all === undefined ? {} : { all: args.all },
        ...args.project === undefined ? {} : { project: args.project },
      }, exec.signal)
      return { containers: containers.map(containerRow) }
    },
    presentCall: (args: DockerPsArgs) =>
      presentListCall(args.project === undefined ? 'docker ps' : `docker ps — ${args.project}`),
  }))

  ctx.tools.register(defineTool({
    name: 'docker_images',
    description: 'List locally available Docker images with their tags and sizes.',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          images: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: { type: 'string', required: true },
                tags: { type: 'array', required: true, items: { type: 'string' } },
                size: { type: 'number', required: true },
                createdAt: { type: 'string', required: true },
              },
            },
          },
        },
      },
      render: (_args, value) => [{ type: 'text', text: formatImages(value.images) }],
    },
    timeoutMs,
    isConcurrencySafe: () => true,
    async execute(_args, exec) {
      const images = await ctx.docker.images(exec.signal)
      return { images: images.map(imageRow) }
    },
    presentCall: () => presentListCall('docker images'),
  }))

  ctx.tools.register(defineTool({
    name: 'docker_logs',
    description: `Read a container's recent log output. Returns at most ${String(maxLogChars)} characters, keeping the newest entries.`,
    parameters: {
      container: { type: 'string', required: true, description: 'Container name or id.' },
      tail: { type: 'number', description: 'Number of trailing lines to read.' },
      since: { type: 'string', description: 'Only entries at or after this ISO-8601 timestamp.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          container: { type: 'string', required: true },
          content: { type: 'string', required: true },
          truncated: { type: 'boolean', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.content.length === 0
          ? 'The container produced no log output in this range.'
          : value.truncated ? `(older entries dropped)\n${value.content}` : value.content,
      }],
    },
    timeoutMs,
    isConcurrencySafe: () => true,
    async execute(args: DockerLogsArgs, exec) {
      if (args.container.trim().length === 0) throw new Error('container must be a non-empty string')
      if (args.tail !== undefined && (!Number.isInteger(args.tail) || args.tail < 1)) {
        throw new Error('tail must be a positive integer')
      }
      const result = await ctx.docker.logs({
        container: args.container,
        ...args.tail === undefined ? {} : { tail: args.tail },
        ...args.since === undefined ? {} : { since: args.since },
      }, exec.signal)
      const capped = capLogs(result.content, maxLogChars)
      return {
        container: result.container,
        content: capped.text,
        truncated: result.truncated || capped.dropped,
      }
    },
    presentCall: (args: DockerLogsArgs) => presentListCall(`docker logs ${args.container}`),
  }))
}
