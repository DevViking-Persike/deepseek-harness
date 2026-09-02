import { spawn, type ChildProcessByStdio } from 'node:child_process'
import { homedir } from 'node:os'
import type { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, dialog, shell } from 'electron'
import { composeHostPath } from './host-environment.ts'
import { stopHost } from './host-process.ts'
import { classifyNavigation } from './navigation.ts'
import { parseReadyUrl } from './readiness.ts'

const STARTUP_TIMEOUT_MS = 60_000
const STOP_GRACE_MS = 5_000
type HostChild = ChildProcessByStdio<null, Readable, Readable>
let host: HostChild | undefined
let quitting = false

async function existingHostUrl(): Promise<URL | undefined> {
  const url = new URL('http://127.0.0.1:3080/')
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1_500) })
    return response.ok ? url : undefined
  } catch {
    // An absent loopback Host is expected; the desktop shell starts one below.
    return undefined
  }
}

function launchHost(): Promise<URL> {
  return new Promise((resolve, reject) => {
    const developmentRoot = fileURLToPath(new URL('../../../..', import.meta.url))
    const sourceRoot = process.env.DSH_DESKTOP_SOURCE_ROOT
      ?? (developmentRoot.endsWith('/apps/desktop')
        ? developmentRoot.slice(0, -'/apps/desktop'.length)
        : '/Volumes/HDX/Dev/deepseek-harness')
    const externalCommand = process.env.DSH_DESKTOP_COMMAND
    const nodeExecutable = process.env.DSH_DESKTOP_NODE
      ?? '/Users/persike/.nvm/versions/node/v24.16.0/bin/node'
    const command = externalCommand ?? nodeExecutable
    const pnpmLauncher = process.env.DSH_DESKTOP_PNPM
      ?? '/Users/persike/.nvm/versions/node/v24.16.0/lib/node_modules/corepack/dist/pnpm.js'
    const args = externalCommand === undefined
      ? [pnpmLauncher, 'dsh', 'web', '--no-open', '--port', '0']
      : ['web', '--no-open', '--port', '0']
    const path = composeHostPath({
      homeDirectory: homedir(),
      inheritedPath: process.env.PATH,
      nodeExecutable,
      sourceRoot,
    })
    const child = spawn(command, args, {
      cwd: process.env.DSH_DESKTOP_CWD ?? sourceRoot,
      env: { ...process.env, PATH: path },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    host = child
    let pending = ''
    let errors = ''
    const timeout = setTimeout(() => reject(new Error(`Harness Host did not become ready within ${STARTUP_TIMEOUT_MS}ms.`)), STARTUP_TIMEOUT_MS)
    const finish = (url: URL): void => {
      clearTimeout(timeout)
      resolve(url)
    }
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      pending += chunk
      const lines = pending.split(/\r?\n/u)
      pending = lines.pop() ?? ''
      for (const line of lines) {
        const url = parseReadyUrl(line)
        if (url !== undefined) finish(url)
      }
    })
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => {
      process.stderr.write(chunk)
      errors = `${errors}${chunk}`.slice(-4_000)
    })
    child.once('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })
    child.once('exit', (code, signal) => {
      if (!quitting) {
        const detail = errors.trim()
        reject(new Error(`Harness Host exited before readiness (code ${String(code)}, signal ${String(signal)}).${detail.length > 0 ? `\n\n${detail}` : ''}`))
      }
    })
  })
}

function createWindow(hostUrl: URL): BrowserWindow {
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 900,
    minHeight: 640,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  const origin = hostUrl.origin
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (classifyNavigation(url, origin) === 'external') void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    const decision = classifyNavigation(url, origin)
    if (decision === 'allow') return
    event.preventDefault()
    if (decision === 'external') void shell.openExternal(url)
  })
  void window.loadURL(hostUrl.href)
  return window
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const window = BrowserWindow.getAllWindows()[0]
    if (window === undefined) return
    if (window.isMinimized()) window.restore()
    window.focus()
  })
  app.whenReady().then(async () => {
    try {
      createWindow(await existingHostUrl() ?? await launchHost())
    } catch (error) {
      dialog.showErrorBox('DeepSeek Harness failed to start', error instanceof Error ? error.message : String(error))
      app.quit()
    }
  })
  app.on('before-quit', (event) => {
    if (quitting || host === undefined) return
    event.preventDefault()
    quitting = true
    void stopHost(host, STOP_GRACE_MS).finally(() => app.quit())
  })
}
