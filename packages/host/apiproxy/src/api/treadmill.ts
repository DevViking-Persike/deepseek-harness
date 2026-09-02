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
  readonly stages: readonly TreadmillStageView[]
  /** Set when the stage table is unreadable or invalid; `stages` is then empty. */
  readonly pipelineError?: string
  readonly files: readonly TreadmillFileView[]
}

/** Treadmill API: describe the installation and edit its files. */
export interface TreadmillApi {
  /** Describe the installation: root, enabled state, stage table, and file inventory. */
  describe(request: RpcRequest<{}>, signal: AbortSignal): Promise<RpcResponse<TreadmillDescriptionView>>
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
}
