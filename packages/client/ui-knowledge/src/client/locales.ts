/** `knowledge` namespace dictionaries (the settings section and its three panes). */

/** Dictionary namespace owned by this plugin. */
export const NS = 'knowledge'

/** The knowledge dictionary key set (the source of truth for both locales). */
export type KnowledgeKey =
  | 'section.label'
  | 'tab.skills'
  | 'tab.decisions'
  | 'tab.docs'
  | 'loading'
  | 'failed'
  | 'empty'
  | 'skills.count'
  | 'skills.modelInvocable'
  | 'skills.userOnly'
  | 'origin.project'
  | 'origin.user'
  | 'origin.composition'
  | 'origin.explain'
  | 'open'
  | 'edit'
  | 'back'
  | 'unavailable'
  | 'filter'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The knowledge settings section: skills, decision records, and docs. */
    'knowledge': KnowledgeKey
  }
}

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh: Record<KnowledgeKey, string> = {
  'section.label': '知识库',
  'tab.skills': '技能',
  'tab.decisions': '决策记录',
  'tab.docs': '文档',
  'loading': '正在加载…',
  'failed': '加载失败：{reason}',
  'empty': '这里还没有内容。',
  'skills.count': '共 {count} 项',
  'skills.modelInvocable': '模型可调用',
  'skills.userOnly': '仅用户可调用',
  'origin.project': '项目',
  'origin.user': '全局',
  'origin.composition': '内置',
  'origin.explain': '「项目」随仓库提交，「全局」只属于这台机器，「内置」来自当前组合。',
  'open': '查看',
  'edit': '编辑',
  'back': '返回',
  'unavailable': '此环境未挂载文件系统，无法读取文件。',
  'filter': '按名称筛选…',
}

/** English dictionary. */
export const en: Record<KnowledgeKey, string> = {
  'section.label': 'Knowledge',
  'tab.skills': 'Skills',
  'tab.decisions': 'Decision records',
  'tab.docs': 'Documentation',
  'loading': 'Loading…',
  'failed': 'Loading failed: {reason}',
  'empty': 'Nothing here yet.',
  'skills.count': '{count} in total',
  'skills.modelInvocable': 'model-invocable',
  'skills.userOnly': 'user-only',
  'origin.project': 'project',
  'origin.user': 'global',
  'origin.composition': 'built in',
  'origin.explain': 'A project skill is committed with the repository, a global one belongs to this machine alone, and a built-in one comes from the running composition.',
  'open': 'View',
  'edit': 'Edit',
  'back': 'Back',
  'unavailable': 'No filesystem is mounted here, so files cannot be read.',
  'filter': 'Filter by name…',
}
