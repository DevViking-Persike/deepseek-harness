/**
 * editor domain zod schemas (names derived from map keys:
 * editorListDirRequestSchema / editorListDirValueSchema, and so on).
 */

import { z } from 'zod'
import type { RequestPayload, ResponseValue } from './rpc-map.ts'
import type { Wire } from './rpc.schema.ts'
import type { EditorDirEntry } from './editor.ts'

/** One child row of editor.listDir. */
export const editorDirEntrySchema = z.object({
  name: z.string(),
  path: z.string(),
  directory: z.boolean(),
}) satisfies z.ZodType<Wire<EditorDirEntry>>

/** editor.listDir request payload; an absent path lists the workspace root. */
export const editorListDirRequestSchema = z.object({
  sessionId: z.string().optional(),
  path: z.string().optional(),
}) satisfies z.ZodType<Wire<RequestPayload<'editor.listDir'>>>

/** editor.listDir response value. */
export const editorListDirValueSchema = z.object({
  path: z.string(),
  root: z.string(),
  entries: z.array(editorDirEntrySchema),
}) satisfies z.ZodType<Wire<ResponseValue<'editor.listDir'>>>

/** editor.readFile request payload. */
export const editorReadFileRequestSchema = z.object({
  sessionId: z.string().optional(),
  path: z.string().min(1),
}) satisfies z.ZodType<Wire<RequestPayload<'editor.readFile'>>>

/** editor.readFile response value. */
export const editorReadFileValueSchema = z.object({
  path: z.string(),
  content: z.string(),
  version: z.string(),
}) satisfies z.ZodType<Wire<ResponseValue<'editor.readFile'>>>

/** editor.writeFile request payload; `version` is the guard the read returned. */
export const editorWriteFileRequestSchema = z.object({
  sessionId: z.string().optional(),
  path: z.string().min(1),
  content: z.string(),
  version: z.string().min(1),
}) satisfies z.ZodType<Wire<RequestPayload<'editor.writeFile'>>>

/** editor.writeFile response value; `version` is the guard for the next save. */
export const editorWriteFileValueSchema = z.object({
  path: z.string(),
  version: z.string(),
}) satisfies z.ZodType<Wire<ResponseValue<'editor.writeFile'>>>

/** editor.languageServers request payload (empty; extend in place). */
export const editorLanguageServersRequestSchema = z.object({
}) satisfies z.ZodType<Wire<RequestPayload<'editor.languageServers'>>>

/** editor.languageServers response value. */
export const editorLanguageServersValueSchema = z.object({
  servers: z.array(z.object({
    id: z.string(),
    extensions: z.array(z.string()),
  })),
}) satisfies z.ZodType<Wire<ResponseValue<'editor.languageServers'>>>
