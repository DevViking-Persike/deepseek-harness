/**
 * treadmill domain zod schemas (names derived from map keys:
 * treadmillDescribeRequestSchema / treadmillDescribeValueSchema, and so on).
 */

import { z } from 'zod'
import type { RequestPayload, ResponseValue } from './rpc-map.ts'
import type { Wire } from './rpc.schema.ts'

/** treadmill.describe request payload (empty; extend in place). */
export const treadmillDescribeRequestSchema = z.object({
}) satisfies z.ZodType<Wire<RequestPayload<'treadmill.describe'>>>

/** treadmill.describe response value. */
export const treadmillDescribeValueSchema = z.object({
  root: z.string(),
  enabled: z.boolean(),
  stages: z.array(z.object({
    id: z.string(),
    label: z.string(),
    section: z.string(),
    skill: z.string(),
    args: z.string().optional(),
    gate: z.union([z.literal('manual'), z.literal('auto')]),
    verdict: z.boolean(),
    produces: z.array(z.string()),
  })),
  pipelineError: z.string().optional(),
  files: z.array(z.object({ path: z.string(), category: z.string(), size: z.number() })),
}) satisfies z.ZodType<Wire<ResponseValue<'treadmill.describe'>>>

/** treadmill.readFile request payload. */
export const treadmillReadFileRequestSchema = z.object({
  path: z.string().min(1),
}) satisfies z.ZodType<Wire<RequestPayload<'treadmill.readFile'>>>

/** treadmill.readFile response value. */
export const treadmillReadFileValueSchema = z.object({
  path: z.string(),
  content: z.string(),
}) satisfies z.ZodType<Wire<ResponseValue<'treadmill.readFile'>>>

/** treadmill.writeFile request payload. */
export const treadmillWriteFileRequestSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
}) satisfies z.ZodType<Wire<RequestPayload<'treadmill.writeFile'>>>

/** treadmill.writeFile response value. */
export const treadmillWriteFileValueSchema = z.object({
  path: z.string(),
}) satisfies z.ZodType<Wire<ResponseValue<'treadmill.writeFile'>>>
