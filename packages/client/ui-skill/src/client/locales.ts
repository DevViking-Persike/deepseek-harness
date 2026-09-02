/** `skill` namespace dictionaries for the dedicated tool row. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'skill'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'row.running': '正在加载 skill',
  'row.failed': 'skill 加载失败',
  'row.stopped': 'skill 加载已中止',
  'row.instructions': '说明',
  'menu.userOnly': '仅用户',
  'archify.action': '生成架构',
  'archify.running': '生成中…',
  'archify.hint': '使用 Archify 在 docs/architecture/generated 中生成可编辑的架构文件',
} satisfies Record<string, string>

/** The skill namespace key union. */
export type SkillKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'row.running': 'Loading skill',
  'row.failed': 'Skill load failed',
  'row.stopped': 'Skill load stopped',
  'row.instructions': 'Instructions',
  'menu.userOnly': 'user-only',
  'archify.action': 'Generate architecture',
  'archify.running': 'Generating…',
  'archify.hint': 'Use Archify to create editable architecture files under docs/architecture/generated',
} satisfies Record<SkillKey, string>
