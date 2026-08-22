/**
 * editor domain contract: workspace file reading, writing, and directory
 * listing for the browser code editor, over the host's `ctx.fs` capability
 * seam.
 *
 * Every operation is fenced twice. The path must resolve inside the session's
 * workspace root, so a wire value can never address the wider filesystem, and
 * the write carries the version the editor loaded, so a save that would
 * overwrite a concurrent agent edit is refused instead of silently winning.
 */

import type { RpcRequest, RpcResponse } from './rpc.ts'

/** One child of a listed directory. */
export interface EditorDirEntry {
  /** Basename inside the listed directory. */
  readonly name: string
  /** Absolute host path — the client never joins path segments itself. */
  readonly path: string
  /** True for a directory the tree can expand. */
  readonly directory: boolean
}

/** docker-style listing of one directory level inside the workspace. */
export interface EditorListing {
  /** Absolute path of the listed directory. */
  readonly path: string
  /** Absolute path of the workspace root this listing is fenced by. */
  readonly root: string
  /** Directories first, then files, each group name-sorted. */
  readonly entries: readonly EditorDirEntry[]
}

/** One file's text plus the freshness token a later save must present. */
export interface EditorFile {
  /** Absolute path of the file that was read. */
  readonly path: string
  /** The file's full text. */
  readonly content: string
  /**
   * Opaque freshness token. The editor holds it and returns it on save; the
   * host refuses the write when the file moved on since this read.
   */
  readonly version: string
}

/** One language server the composition mounts, and whether it can be reached. */
export interface EditorLanguageServer {
  /** Provider id as the composition named it (`typescript`, `python`). */
  readonly id: string
  /** Extensions this server serves, sorted (`.py`, `.pyi`). */
  readonly extensions: readonly string[]
}

/** Editor-domain unary methods (the map keys editor.* of RpcMethodMap). */
export interface EditorApi {
  /**
   * Report the language servers this composition mounts. Introspection only:
   * no server is contacted, so the answer is immediate and costs no process.
   * A composition with no LSP seam answers an empty list rather than failing —
   * absence of language intelligence is a state the editor renders, not an
   * error.
   */
  languageServers(
    request: RpcRequest<{}>,
    signal: AbortSignal,
  ): Promise<RpcResponse<{ servers: readonly EditorLanguageServer[] }>>

  /**
   * List one directory level inside the session's workspace. An absent path
   * lists the workspace root itself. Fails with `editor-unavailable` when the
   * composition mounts no filesystem seam, and `editor-denied` for a path
   * outside the workspace.
   */
  listDir(
    request: RpcRequest<{ sessionId?: string; path?: string }>,
    signal: AbortSignal,
  ): Promise<RpcResponse<EditorListing>>

  /**
   * Read one workspace file as text. Fails with `editor-not-found` for a
   * missing path, `editor-not-text` for binary content, and `editor-too-large`
   * beyond the deployment's size cap.
   */
  readFile(
    request: RpcRequest<{ sessionId?: string; path: string }>,
    signal: AbortSignal,
  ): Promise<RpcResponse<EditorFile>>

  /**
   * Write one workspace file, guarded by the version the editor read. Fails
   * with `editor-stale` when the file changed since then — the agent editing
   * the same file is the case this protects — and `editor-denied` when the
   * sandbox refuses the write.
   */
  writeFile(
    request: RpcRequest<{ sessionId?: string; path: string; content: string; version: string }>,
    signal: AbortSignal,
  ): Promise<RpcResponse<{ path: string; version: string }>>
}
