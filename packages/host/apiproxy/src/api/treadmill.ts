/**
 * Treadmill domain: the OpenNjord installation the harness owns, editable in
 * place. Every method reaches the `treadmill` service through `ctx.get`, so a
 * composition without it answers `treadmill-unavailable`.
 */

import type { RpcRequest, RpcResponse } from './rpc.ts'

/** One stage of the Treadmill as `esteira/pipeline.yaml` declares it. */
export interface TreadmillStageView {
  readonly id: string
  readonly label: string
  readonly section: string
  readonly skill: string
  readonly args?: string
  readonly gate: 'manual' | 'auto'
  readonly verdict: boolean
  readonly produces: readonly string[]
  /** A disabled stage stays listed and is skipped. */
  readonly enabled: boolean
}

/** One file of the installation, relative to its root. */
export interface TreadmillFileView {
  readonly path: string
  readonly category: string
  readonly size: number
}

/** The installation as a client sees it. */
export interface TreadmillDescriptionView {
  readonly root: string
  readonly enabled: boolean
  /** Where `stages` came from: the addressed project's `.spec/treadmill.yaml`, or the harness default table. */
  readonly tableSource: 'project' | 'global'
  readonly stages: readonly TreadmillStageView[]
  /** Set when the stage table is unreadable or invalid; `stages` is then empty. */
  readonly pipelineError?: string
  readonly files: readonly TreadmillFileView[]
}

/** Treadmill API: describe the installation and edit its files. */
export interface TreadmillApi {
  /**
   * Describe the installation: root, enabled state, stage table, and file
   * inventory. With a `sessionId`, the stage table is the session's project
   * table (`.spec/treadmill.yaml`) when that file exists.
   */
  describe(request: RpcRequest<{ sessionId?: string }>, signal: AbortSignal): Promise<RpcResponse<TreadmillDescriptionView>>
  /**
   * Read one installation file. Fails with `treadmill-denied` for a path
   * outside the root and `treadmill-not-found` for a missing file.
   */
  readFile(request: RpcRequest<{ path: string }>, signal: AbortSignal): Promise<RpcResponse<{ path: string; content: string }>>
  /**
   * Write one installation file, creating parent directories. Fails with
   * `treadmill-denied` for a path outside the root. A saved stage table or
   * skill reaches the next request without a restart.
   */
  writeFile(request: RpcRequest<{ path: string; content: string }>, signal: AbortSignal): Promise<RpcResponse<{ path: string }>>
  /**
   * Switch one stage on or off, keeping the table's comments. With a
   * `sessionId`, the session's project table is edited and created from the
   * effective table when absent; without one, the harness default table is.
   * Fails with `treadmill-not-found` for an id the table does not list.
   */
  setStageEnabled(
    request: RpcRequest<{ sessionId?: string; id: string; enabled: boolean }>,
    signal: AbortSignal,
  ): Promise<RpcResponse<{ id: string; enabled: boolean; tableSource: 'project' | 'global' }>>
  /**
   * Save one skill or command into the session's project under `.dsh/skills`,
   * where it outranks the harness copy for that project alone. Fails with
   * `treadmill-denied` for any other installation path.
   */
  saveToProject(
    request: RpcRequest<{ sessionId: string; path: string; content: string }>,
    signal: AbortSignal,
  ): Promise<RpcResponse<{ path: string }>>
}
