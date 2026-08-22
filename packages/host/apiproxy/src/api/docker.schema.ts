/**
 * docker domain zod schemas (names derived from map keys:
 * dockerListContainersRequestSchema / dockerListContainersValueSchema, and so on).
 */

import { z } from 'zod'
import type { RequestPayload, ResponseValue } from './rpc-map.ts'
import type { Wire } from './rpc.schema.ts'
import type { DockerComposeBrowseEntry, DockerContainerEntry, DockerImageEntry } from './docker.ts'

/** Container row of docker.listContainers. */
export const dockerContainerEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  image: z.string(),
  state: z.string(),
  status: z.string(),
  project: z.string().optional(),
  service: z.string().optional(),
  ports: z.array(z.string()),
  createdAt: z.string(),
}) satisfies z.ZodType<Wire<DockerContainerEntry>>

/** Image row of docker.listImages. */
export const dockerImageEntrySchema = z.object({
  id: z.string().min(1),
  tags: z.array(z.string()),
  size: z.number(),
  createdAt: z.string(),
}) satisfies z.ZodType<Wire<DockerImageEntry>>

/** docker.listContainers request payload. */
export const dockerListContainersRequestSchema = z.object({
  all: z.boolean().optional(),
  project: z.string().optional(),
}) satisfies z.ZodType<Wire<RequestPayload<'docker.listContainers'>>>

/** docker.listContainers response value. */
export const dockerListContainersValueSchema = z.object({
  containers: z.array(dockerContainerEntrySchema),
}) satisfies z.ZodType<Wire<ResponseValue<'docker.listContainers'>>>

/** docker.listImages request payload (empty; extend in place when fields arrive). */
export const dockerListImagesRequestSchema = z.object({
}) satisfies z.ZodType<Wire<RequestPayload<'docker.listImages'>>>

/** docker.listImages response value. */
export const dockerListImagesValueSchema = z.object({
  images: z.array(dockerImageEntrySchema),
}) satisfies z.ZodType<Wire<ResponseValue<'docker.listImages'>>>

/** docker.logs request payload. */
export const dockerLogsRequestSchema = z.object({
  container: z.string().min(1),
  tail: z.number().int().positive().optional(),
}) satisfies z.ZodType<Wire<RequestPayload<'docker.logs'>>>

/** docker.logs response value. */
export const dockerLogsValueSchema = z.object({
  container: z.string(),
  content: z.string(),
  truncated: z.boolean(),
}) satisfies z.ZodType<Wire<ResponseValue<'docker.logs'>>>

/** Browse row of docker.browseCompose. */
export const dockerComposeBrowseEntrySchema = z.object({
  name: z.string(),
  path: z.string().min(1),
  directory: z.boolean(),
  hidden: z.boolean(),
}) satisfies z.ZodType<Wire<DockerComposeBrowseEntry>>

/** docker.browseCompose request payload; an absent path lists the home directory. */
export const dockerBrowseComposeRequestSchema = z.object({
  path: z.string().min(1).optional(),
}) satisfies z.ZodType<Wire<RequestPayload<'docker.browseCompose'>>>

/** docker.browseCompose response value. */
export const dockerBrowseComposeValueSchema = z.object({
  path: z.string(),
  home: z.string(),
  crumbs: z.array(dockerComposeBrowseEntrySchema),
  entries: z.array(dockerComposeBrowseEntrySchema),
  truncated: z.boolean(),
}) satisfies z.ZodType<Wire<ResponseValue<'docker.browseCompose'>>>

/** Request payload shared by docker.composeUp and docker.composeDown. */
const composeLifecycleRequestSchema = z.object({
  file: z.string().min(1),
  project: z.string().min(1).optional(),
})

/** Response value shared by docker.composeUp and docker.composeDown. */
const composeLifecycleValueSchema = z.object({
  project: z.string(),
  output: z.string(),
  containers: z.array(dockerContainerEntrySchema),
})

/** docker.composeUp request payload. */
export const dockerComposeUpRequestSchema: z.ZodType<Wire<RequestPayload<'docker.composeUp'>>>
  = composeLifecycleRequestSchema

/** docker.composeUp response value. */
export const dockerComposeUpValueSchema: z.ZodType<Wire<ResponseValue<'docker.composeUp'>>>
  = composeLifecycleValueSchema

/** docker.composeDown request payload. */
export const dockerComposeDownRequestSchema: z.ZodType<Wire<RequestPayload<'docker.composeDown'>>>
  = composeLifecycleRequestSchema

/** docker.composeDown response value. */
export const dockerComposeDownValueSchema: z.ZodType<Wire<ResponseValue<'docker.composeDown'>>>
  = composeLifecycleValueSchema

/** Engine status shared by every engine-domain response. */
const engineStatusSchema = z.object({
  running: z.boolean(),
  startable: z.boolean(),
  installable: z.boolean(),
  runtime: z.string().optional(),
  detail: z.string().optional(),
})

/** Request payload shared by every engine-domain method (empty; extend in place). */
const engineRequestSchema = z.object({})

/** Response value shared by docker.startEngine and docker.installEngine. */
const engineActionValueSchema = z.object({
  status: engineStatusSchema,
  output: z.string(),
})

/** docker.engineStatus request payload. */
export const dockerEngineStatusRequestSchema: z.ZodType<Wire<RequestPayload<'docker.engineStatus'>>>
  = engineRequestSchema

/** docker.engineStatus response value. */
export const dockerEngineStatusValueSchema = z.object({
  status: engineStatusSchema,
}) satisfies z.ZodType<Wire<ResponseValue<'docker.engineStatus'>>>

/** docker.startEngine request payload. */
export const dockerStartEngineRequestSchema: z.ZodType<Wire<RequestPayload<'docker.startEngine'>>>
  = engineRequestSchema

/** docker.startEngine response value. */
export const dockerStartEngineValueSchema: z.ZodType<Wire<ResponseValue<'docker.startEngine'>>>
  = engineActionValueSchema

/** docker.installEngine request payload. */
export const dockerInstallEngineRequestSchema: z.ZodType<Wire<RequestPayload<'docker.installEngine'>>>
  = engineRequestSchema

/** docker.installEngine response value. */
export const dockerInstallEngineValueSchema: z.ZodType<Wire<ResponseValue<'docker.installEngine'>>>
  = engineActionValueSchema

/** docker.control request payload. */
export const dockerControlRequestSchema = z.object({
  container: z.string().min(1),
  action: z.enum(['start', 'stop', 'restart']),
}) satisfies z.ZodType<Wire<RequestPayload<'docker.control'>>>

/** docker.control response value. */
export const dockerControlValueSchema = z.object({
  container: dockerContainerEntrySchema,
}) satisfies z.ZodType<Wire<ResponseValue<'docker.control'>>>
