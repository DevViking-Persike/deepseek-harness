// @vitest-environment jsdom
/**
 * The engine panel offers exactly the remedies the host reported, runs the one
 * the operator chose, and reports a refused attempt without losing the panel.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { DockerEngineStatusView } from '@deepseek-ai/dsh-api-remotes/client'
import { EnginePanel } from '../src/client/EnginePanel.tsx'
import type { EnginePanelProps } from '../src/client/EnginePanel.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

/** Interpolate `{name}` placeholders the way the locale service does. */
function makeTranslate(dict: Record<string, string>) {
  return (key: string, params?: Record<string, string>) => {
    const template = dict[key] ?? key
    return params === undefined
      ? template
      : template.replace(/\{(\w+)\}/g, (_m, name: string) => params[name] ?? '')
  }
}

/** Render the panel with a reported status and the two engine actions. */
function mount(status: DockerEngineStatusView | undefined, overrides: Partial<EnginePanelProps> = {}) {
  const props = {
    status,
    startEngine: overrides.startEngine ?? (() => Promise.resolve()),
    installEngine: overrides.installEngine ?? (() => Promise.resolve()),
    t: makeTranslate(zh),
  } as unknown as EnginePanelProps
  return render(<EnginePanel {...props} />)
}

describe('EnginePanel offers', () => {
  it('offers a start naming the runtime when the host reported one', () => {
    mount({ running: false, startable: true, installable: false, runtime: 'colima' })

    expect(screen.getByText(zh['engine.start'].replace('{runtime}', 'colima'))).toBeTruthy()
    expect(screen.queryByText(zh['engine.install'].replace('{runtime}', 'colima'))).toBeNull()
  })

  it('offers an install when no runtime is present and the deployment allows it', () => {
    mount({ running: false, startable: false, installable: true, runtime: 'colima' })

    expect(screen.getByText(zh['engine.install'].replace('{runtime}', 'colima'))).toBeTruthy()
    expect(screen.queryByText(zh['engine.start'].replace('{runtime}', 'colima'))).toBeNull()
  })

  it('offers nothing when the host can neither start nor install', () => {
    mount({ running: false, startable: false, installable: false, detail: 'no backend manages an engine' })

    expect(screen.getByText(zh.unavailable)).toBeTruthy()
    expect(screen.getByText('no backend manages an engine')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('offers nothing while the status is still being read', () => {
    mount(undefined)

    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('EnginePanel actions', () => {
  it('starts the engine and reports progress while the attempt runs', async () => {
    const startEngine = vi.fn(() => new Promise<void>(() => {}))
    mount({ running: false, startable: true, installable: false, runtime: 'colima' }, { startEngine })

    fireEvent.click(screen.getByText(zh['engine.start'].replace('{runtime}', 'colima')))

    expect(startEngine).toHaveBeenCalledTimes(1)
    expect(await screen.findByText(zh['engine.starting'])).toBeTruthy()
    // A second click during a running attempt would start the runtime twice.
    expect(screen.getByText(zh['engine.start'].replace('{runtime}', 'colima')).closest('button')!.disabled).toBe(true)
  })

  it('installs the runtime and reports progress while the attempt runs', async () => {
    const installEngine = vi.fn(() => new Promise<void>(() => {}))
    mount({ running: false, startable: false, installable: true, runtime: 'colima' }, { installEngine })

    fireEvent.click(screen.getByText(zh['engine.install'].replace('{runtime}', 'colima')))

    expect(installEngine).toHaveBeenCalledTimes(1)
    expect(await screen.findByText(zh['engine.installing'])).toBeTruthy()
  })

  it('reports a refused attempt and leaves the offer in place to retry', async () => {
    const startEngine = () => Promise.reject(new Error('colima start failed'))
    mount({ running: false, startable: true, installable: false, runtime: 'colima' }, { startEngine })

    fireEvent.click(screen.getByText(zh['engine.start'].replace('{runtime}', 'colima')))

    expect(await screen.findByText(zh['engine.failed'].replace('{reason}', 'colima start failed'))).toBeTruthy()
    expect(screen.getByText(zh['engine.start'].replace('{runtime}', 'colima')).closest('button')!.disabled).toBe(false)
  })

  it('reports a non-Error rejection by its string form', async () => {
    // A rejection that is not an Error can cross the wire boundary, and the
    // panel must render it rather than showing "[object Object]".
    // eslint-disable-next-line prefer-promise-reject-errors -- the non-Error rejection IS this test's subject.
    const startEngine = () => Promise.reject('daemon refused')
    mount({ running: false, startable: true, installable: false, runtime: 'colima' }, { startEngine })

    fireEvent.click(screen.getByText(zh['engine.start'].replace('{runtime}', 'colima')))

    expect(await screen.findByText(zh['engine.failed'].replace('{reason}', 'daemon refused'))).toBeTruthy()
  })
})
