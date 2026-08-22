/**
 * The model-facing Docker Compose lifecycle tools: `docker_compose_up` and
 * `docker_compose_down`. Execution goes through `ctx.docker` — this module owns
 * only the model-facing schemas, argument validation, output caps, and
 * formatting, never provider selection or process execution.
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { TerminalCallView, ToolResult, ToolResultView } from '@deepseek-ai/dsh-tools'
import type { DockerComposeResult } from '@deepseek-ai/dsh-docker'
import { containerRow } from './inspect.ts'
import type { ContainerRow } from './inspect.ts'
import type {} from '@deepseek-ai/dsh-system-prompt'

/** Model-facing arguments shared by both Compose tools. */
interface ComposeArgs {
  file: string
  project?: string
  services?: string[]
}

/**
 * Validate what the schema DSL cannot express: a non-blank compose file and,
 * when present, a non-empty list of non-blank service names.
 * @param args - the schema-validated Compose arguments.
 * @returns the accepted services in first-occurrence order, or undefined for the whole project.
 */
export function parseComposeArgs(args: ComposeArgs): readonly string[] | undefined {
  if (args.file.trim().length === 0) throw new Error('file must be a non-empty compose file path')
  if (args.services === undefined) return undefined
  if (args.services.length === 0) throw new Error('services must contain at least one service when provided')
  if (args.services.some(service => service.trim().length === 0)) {
    throw new Error('each service must be a non-empty string')
  }
  return [...new Set(args.services)]
}

/**
 * Format a settled Compose operation as model-facing text: the project state
 * first, because that is what the model must reason about, and the CLI output
 * after it as the diagnostic detail.
 * @param result - the seam's Compose outcome, already capped.
 * @returns the project summary followed by the backend output.
 */
export function formatComposeOutput(result: ComposeValue): string {
  const header = result.project.length === 0 ? 'Project settled.' : `Project ${result.project} settled.`
  const containers = result.containers.length === 0
    ? 'No containers remain.'
    : result.containers.map(c => `- ${c.name} ${c.state}${c.ports.length === 0 ? '' : ` (${c.ports.join(' ')})`}`).join('\n')
  const output = result.output.trim()
  return output.length === 0 ? `${header}\n${containers}` : `${header}\n${containers}\n\n${output}`
}

/** A settled Compose operation as the tool's JSON output carries it. */
export interface ComposeValue {
  project: string
  output: string
  containers: ContainerRow[]
}

/**
 * Cap backend output, keeping the newest lines: Compose reports progress
 * chronologically, so the tail carries the outcome and any failure.
 * @param output - the backend's combined output.
 * @param maxChars - the deployment's cap on emitted characters.
 * @returns the capped output.
 */
export function capOutput(output: string, maxChars: number): string {
  return output.length <= maxChars ? output : output.slice(output.length - maxChars)
}

/** Pending-call presentation: the equivalent command line as a terminal card. */
function presentComposeCall(verb: string, args: ComposeArgs): TerminalCallView {
  const project = args.project === undefined ? '' : ` --project-name ${args.project}`
  const services = args.services === undefined || args.services.length === 0 ? '' : ` ${args.services.join(' ')}`
  return {
    card: 'terminal',
    title: `docker compose --file ${args.file}${project} ${verb}${services}`,
    description: `Docker Compose ${verb}`,
  }
}

/** Completed-call presentation: the backend output as terminal output. */
function presentComposeResult(result: ToolResult): ToolResultView | undefined {
  const block = result.content.length === 1 ? result.content[0] : undefined
  if (block === undefined || block.type !== 'text' || result.isError) return undefined
  return { card: 'terminal', output: block.text }
}

/** The output schema both Compose tools return. */
const COMPOSE_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    project: { type: 'string', required: true },
    output: { type: 'string', required: true },
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
} as const

/**
 * Project a settled Compose result onto the tool's output value.
 * @param result - the seam's Compose outcome.
 * @param maxChars - the deployment's cap on emitted output characters.
 * @returns the plain JSON value the output schema declares.
 */
function composeValue(result: DockerComposeResult, maxChars: number): ComposeValue {
  return {
    project: result.project,
    output: capOutput(result.output, maxChars),
    containers: result.containers.map(containerRow),
  }
}

/**
 * Register the Compose lifecycle tools and their prompt guidance.
 * @param ctx - context carrying the docker, tools, and systemPrompt services.
 * @param timeoutMs - cooperative tool-call budget for each lifecycle call.
 * @param maxOutputChars - cap on characters one call emits.
 */
export function applyDockerComposeTools(ctx: Context, timeoutMs: number, maxOutputChars: number): void {
  ctx.systemPrompt.section({
    name: 'tool:docker_compose',
    order: 113,
    text: 'Use docker_compose_up to start a Compose project and docker_compose_down to stop and remove its containers. These tools change machine state: name the compose file the user asked about, and confirm with docker_ps rather than assuming the result.',
  })

  ctx.tools.register(defineTool({
    name: 'docker_compose_up',
    description: 'Start a Docker Compose project in the background and wait for its containers to become ready.',
    parameters: {
      file: { type: 'string', required: true, description: 'Path to the compose file.' },
      project: { type: 'string', description: 'Explicit project name; defaults to the compose file\'s directory name.' },
      services: {
        type: 'array',
        items: { type: 'string' },
        description: 'Start only these services. Omit to start every service.',
      },
    },
    output: {
      schema: COMPOSE_OUTPUT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: formatComposeOutput(value) }],
    },
    timeoutMs,
    // Compose mutates machine state; concurrent lifecycle calls on one project
    // race inside the engine.
    isConcurrencySafe: () => false,
    async execute(args: ComposeArgs, exec) {
      const services = parseComposeArgs(args)
      const result = await ctx.docker.composeUp({
        file: args.file,
        ...args.project === undefined ? {} : { project: args.project },
        ...services === undefined ? {} : { services },
      }, exec.signal)
      return composeValue(result, maxOutputChars)
    },
    presentCall: (args: ComposeArgs) => presentComposeCall('up', args),
    presentResult: (_args, result) => presentComposeResult(result),
  }))

  ctx.tools.register(defineTool({
    name: 'docker_compose_down',
    description: 'Stop and remove a Docker Compose project\'s containers.',
    parameters: {
      file: { type: 'string', required: true, description: 'Path to the compose file.' },
      project: { type: 'string', description: 'Explicit project name; defaults to the compose file\'s directory name.' },
    },
    output: {
      schema: COMPOSE_OUTPUT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: formatComposeOutput(value) }],
    },
    timeoutMs,
    isConcurrencySafe: () => false,
    async execute(args: ComposeArgs, exec) {
      parseComposeArgs({ file: args.file })
      const result = await ctx.docker.composeDown({
        file: args.file,
        ...args.project === undefined ? {} : { project: args.project },
      }, exec.signal)
      return composeValue(result, maxOutputChars)
    },
    presentCall: (args: ComposeArgs) => presentComposeCall('down', args),
    presentResult: (_args, result) => presentComposeResult(result),
  }))
}
