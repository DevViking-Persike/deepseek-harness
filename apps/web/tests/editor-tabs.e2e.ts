// Web e2e scenario: the conversation view ring carries the Docker and Editor
// tabs beside Chat, and each renders its honest empty state rather than a
// crash when its host capability is absent.
//
// The ring is a slot registry, so a tab's presence is a composition fact and
// not a component fact: a unit spec can prove the register call runs, but only
// the assembled page proves the row reached the ring the shell renders, in the
// order the entries declare. That order is user-visible — the tabs read left to
// right — and it is decided by three separate `order` values in three packages,
// which nothing but the assembled page checks together.
//
// Both tabs are also the first views whose data comes from a host RPC domain
// rather than the session log. The empty state each shows when that domain
// answers nothing is the state most operators meet first: a machine with no
// Docker daemon, or a deployment with no filesystem seam. Committing it as a
// golden is what keeps a later refactor from turning "no engine" into a blank
// panel or an unhandled rejection.
//
// Zero model calls: a seeded cold session renders from its log, and switching
// tabs asks the host for nothing but its own domains. A stray stream would fail
// loud with NO_ADAPTER.
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import {
  compareOrRefreshGolden, launchWebScaffold, seedSession, watchConsole,
  webSnapshotMode, type WebScaffold,
} from './scaffold.ts'
import { newEnglishPage, saveFailureShot } from './support.ts'

const SNAPSHOT_DIR = fileURLToPath(new URL('./snapshots/editor-tabs', import.meta.url))

/** A committed closed recording: the ring renders from a log, not a stream. */
const FIXTURE = fileURLToPath(new URL('./snapshots/fresh-round-trip/session.jsonl', import.meta.url))
const SEED_ID = 'editor-tabs-seed'

/** Committed golden of the view ring's tab names, in their rendered order. */
const TABS_EXPECTED = join(SNAPSHOT_DIR, 'tabs.expected.md')

/** Committed golden of each tab's first-run empty state. */
const EMPTY_STATES_EXPECTED = join(SNAPSHOT_DIR, 'empty-states.expected.md')

/**
 * The controls each panel may offer. A closed list keeps the golden free of
 * machine state while still failing when a panel stops offering one.
 */
const KNOWN_CONTROLS = [
  'Compose', 'Refresh', 'Start', 'Stop', 'Restart', 'Logs', 'Shell',
  'Save', 'Languages', 'Reload',
  // The editor's panel switcher: `Files` is its own tree and `Source` is the
  // version-control panel registered by ui-git. Their presence is what proves
  // the panel ring reached the assembled page, which no unit spec can show.
  'Files', 'Source',
]

const MODE = webSnapshotMode()

describe('conversation view tabs', () => {
  let browser: Browser
  let scaffold: WebScaffold
  let page: Page

  beforeAll(async () => {
    scaffold = await launchWebScaffold({})
    await seedSession(scaffold, await readFile(FIXTURE, 'utf8'), SEED_ID)
    browser = await chromium.launch()
    page = await newEnglishPage(browser)
    watchConsole(page)
    await page.goto(scaffold.baseUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    // The ring belongs to an open session: the seeded row must be opened
    // through the sidebar, exactly as an operator reaches it.
    const groupRow = page.locator('[role="treeitem"]').first()
    await groupRow.waitFor({ timeout: 15_000 })
    await groupRow.click()
    const sessionRow = page.locator('[role="treeitem"]').nth(1)
    await sessionRow.waitFor({ timeout: 10_000 })
    await sessionRow.click()
    await page.getByRole('tab').first().waitFor({ timeout: 60_000 })
  }, 180_000)

  afterAll(async () => {
    await page?.close()
    await scaffold?.close()
    await browser?.close()
  })

  it('carries Chat, Docker, and Editor in the ring, in registration order', async () => {
    onTestFailed(async () => { await saveFailureShot(page, 'editor-tabs-order') })

    const names = await page.getByRole('tab').allInnerTexts()

    // The order is three `order` values in three packages; nothing but the
    // assembled page checks them against each other.
    await compareOrRefreshGolden(TABS_EXPECTED, names.join('\n'), MODE)
    expect(names.length).toBeGreaterThanOrEqual(3)
  }, 120_000)

  it('renders each tab\'s honest empty state instead of a blank panel', async () => {
    onTestFailed(async () => { await saveFailureShot(page, 'editor-tabs-empty') })

    const states: string[] = []
    for (const name of ['Docker', 'Editor']) {
      const tab = page.getByRole('tab', { name })
      if (await tab.count() === 0) continue
      await tab.click()
      // The panel settles on its own state: an unreachable engine, or a file
      // tree with nothing selected. Either is an answer; neither is a crash.
      await page.waitForTimeout(1_500)
      // Only the panel's fixed chrome is committed. Container rows and file
      // names are machine state: recording them would produce a golden that
      // has to be re-recorded per machine, so the assertion is which controls
      // the panel offers, drawn from a closed vocabulary.
      const view = page.locator('[data-slot="conversation.view"]').first()
      // Tabs as well as buttons: the editor's panel switcher is a tablist, and
      // whether the version-control panel reached the ring is exactly what
      // this golden exists to pin.
      const labels = [
        ...await view.getByRole('button').allInnerTexts(),
        ...await view.getByRole('tab').allInnerTexts(),
      ]
      const offered = KNOWN_CONTROLS.filter(control => labels.some(
        label => label.trim().toLowerCase() === control.toLowerCase(),
      ))
      states.push(`## ${name}\n\n${offered.join('\n')}`)
    }

    await compareOrRefreshGolden(EMPTY_STATES_EXPECTED, states.join('\n\n'), MODE)
    expect(states.length).toBeGreaterThan(0)
  }, 120_000)
})
