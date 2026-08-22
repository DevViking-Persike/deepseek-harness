/**
 * Registers indentation behavior with Monaco.
 *
 * Monaco's `autoIndent` already defaults to its fullest tier, but that tier
 * only engages when the language declares `indentationRules` — and Monaco 0.56
 * declares them for five languages, none of which this editor targets. Without
 * them Enter falls back to bracket matching alone, so a Go `case:`, a Rust
 * `match` arm, or a C# `switch` body stays at the wrong column.
 *
 * Registration is a plain data-to-RegExp conversion plus one call per
 * language, wrapped in the caller's effect so unload removes it.
 */

import { LANGUAGE_CONFIGS } from './language-configs.ts'
import type { RawLanguageConfig, RawOnEnterRule, RawPattern } from './language-configs.ts'

/** The Monaco surface this module needs; the loader's API type includes it. */
export interface MonacoLanguages {
  setLanguageConfiguration: (languageId: string, configuration: unknown) => { dispose: () => void }
  getLanguages: () => { id: string }[]
}

/** Monaco's numeric `IndentAction`, spelled here so no value import is needed. */
const INDENT_ACTION: Readonly<Record<string, number>> = {
  none: 0,
  indent: 1,
  indentOutdent: 2,
  outdent: 3,
}

/**
 * Convert a VS Code pattern to a RegExp. Monaco calls `.test()` directly, so a
 * string form would be silently ignored rather than throwing.
 *
 * @param raw - the pattern as written in the configuration.
 * @returns the compiled expression, or undefined when it cannot compile.
 */
export function toRegExp(raw: RawPattern | undefined): RegExp | undefined {
  if (raw === undefined) return undefined
  const source = typeof raw === 'string' ? raw : raw.pattern
  const flags = typeof raw === 'string' ? undefined : raw.flags
  try {
    return new RegExp(source, flags)
  } catch {
    // A pattern this engine cannot compile is dropped rather than allowed to
    // break registration for every other language.
    return undefined
  }
}

/**
 * Convert one Enter rule, dropping it when its required pattern cannot compile.
 *
 * @param rule - the rule as written in the configuration.
 * @returns the Monaco rule, or undefined when unusable.
 */
export function toOnEnterRule(rule: RawOnEnterRule): Record<string, unknown> | undefined {
  const beforeText = toRegExp(rule.beforeText)
  if (beforeText === undefined) return undefined
  const afterText = toRegExp(rule.afterText)
  const previousLineText = toRegExp(rule.previousLineText)
  return {
    beforeText,
    ...afterText === undefined ? {} : { afterText },
    ...previousLineText === undefined ? {} : { previousLineText },
    action: {
      indentAction: INDENT_ACTION[rule.action.indent] ?? INDENT_ACTION.none,
      ...rule.action.appendText === undefined ? {} : { appendText: rule.action.appendText },
      ...rule.action.removeText === undefined ? {} : { removeText: rule.action.removeText },
    },
  }
}

/**
 * Convert one language configuration into the object Monaco accepts.
 *
 * Only the fields this module owns are emitted: Monaco merges per field, so
 * omitting `brackets` and `autoClosingPairs` preserves the ones the language
 * already registered.
 *
 * @param config - the raw configuration.
 * @returns the Monaco configuration.
 */
export function toMonacoConfig(config: RawLanguageConfig): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  const rules = config.indentationRules
  if (rules !== undefined) {
    const increase = toRegExp(rules.increaseIndentPattern)
    const decrease = toRegExp(rules.decreaseIndentPattern)
    // Monaco requires both halves; one alone indents without ever outdenting.
    if (increase !== undefined && decrease !== undefined) {
      const indentNextLine = toRegExp(rules.indentNextLinePattern)
      const unIndentedLine = toRegExp(rules.unIndentedLinePattern)
      result.indentationRules = {
        increaseIndentPattern: increase,
        decreaseIndentPattern: decrease,
        ...indentNextLine === undefined ? {} : { indentNextLinePattern: indentNextLine },
        ...unIndentedLine === undefined ? {} : { unIndentedLinePattern: unIndentedLine },
      }
    }
  }
  const onEnter = (config.onEnterRules ?? []).map(toOnEnterRule).filter(rule => rule !== undefined)
  if (onEnter.length > 0) result.onEnterRules = onEnter
  return result
}

/**
 * Register every known language configuration.
 *
 * A language Monaco has not registered is skipped: `setLanguageConfiguration`
 * throws on an unknown id, and one missing language must not cost the rest.
 *
 * @param languages - Monaco's languages namespace.
 * @returns a disposer removing every registration.
 */
export function registerIndentation(languages: MonacoLanguages): () => void {
  const known = new Set(languages.getLanguages().map(entry => entry.id))
  const disposers: { dispose: () => void }[] = []
  for (const [languageId, config] of Object.entries(LANGUAGE_CONFIGS)) {
    if (!known.has(languageId)) continue
    const monacoConfig = toMonacoConfig(config)
    if (Object.keys(monacoConfig).length === 0) continue
    disposers.push(languages.setLanguageConfiguration(languageId, monacoConfig))
  }
  return () => {
    for (const disposer of disposers) disposer.dispose()
  }
}
