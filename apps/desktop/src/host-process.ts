import type { ChildProcess } from 'node:child_process'

export interface StopResult {
  exited: boolean
  forced: boolean
}

/**
 * Stops one supervised Host and waits for process quiescence.
 *
 * @param child - Running Host child process.
 * @param graceMs - Time allowed after SIGTERM before SIGKILL.
 * @returns Whether an exit was observed and whether force was required.
 */
export async function stopHost(child: ChildProcess, graceMs: number): Promise<StopResult> {
  if (child.exitCode !== null || child.signalCode !== null) return { exited: true, forced: false }
  const exited = new Promise<boolean>(resolve => child.once('exit', () => resolve(true)))
  child.kill('SIGTERM')
  const graceful = await Promise.race([
    exited,
    new Promise<false>(resolve => setTimeout(() => resolve(false), graceMs)),
  ])
  if (graceful) return { exited: true, forced: false }
  child.kill('SIGKILL')
  await exited
  return { exited: true, forced: true }
}
