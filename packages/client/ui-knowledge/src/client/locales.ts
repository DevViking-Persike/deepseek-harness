/** `knowledge` namespace dictionaries (the settings section and its three panes). */

/** Dictionary namespace owned by this plugin. */
export const NS = 'knowledge'

/** The knowledge dictionary key set (the source of truth for both locales). */
export type KnowledgeKey =
  | 'section.label'
  | 'tab.skills'
  | 'tab.decisions'
  | 'tab.docs'
  | 'tab.treadmill'
  | 'treadmill.explain'
  | 'treadmill.enabled'
  | 'treadmill.disabled'
  | 'treadmill.root'
  | 'treadmill.pipelineError'
  | 'treadmill.save'
  | 'treadmill.saved'
  | 'treadmill.cancel'
  | 'treadmill.category.skills'
  | 'treadmill.category.commands'
  | 'treadmill.category.rules'
  | 'treadmill.category.agents'
  | 'treadmill.category.tools'
  | 'treadmill.category.integrations'
  | 'treadmill.category.esteira'
  | 'treadmill.category.other'
  | 'treadmill.new'
  | 'treadmill.newName'
  | 'treadmill.create'
  | 'treadmill.invalidName'
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
  'tab.treadmill': 'Skills-treadmill',
  'treadmill.explain': 'Treadmill 安装由 harness 提供，位于 {root}。在此编辑 skills、rules、commands、agents、tools 和阶段表（esteira/pipeline.yaml）；保存后立即生效，项目进度不受影响。',
  'treadmill.enabled': 'Treadmill 已启用：其 skills 和规则对每个项目可用。',
  'treadmill.disabled': 'Treadmill 已停用：不提供任何 skill，也不注入规则。',
  'treadmill.root': '安装目录',
  'treadmill.pipelineError': '阶段表无效：{reason}',
  'treadmill.save': '保存',
  'treadmill.saved': '已保存',
  'treadmill.cancel': '取消',
  'treadmill.category.skills': 'Skills',
  'treadmill.category.commands': 'Commands',
  'treadmill.category.rules': 'Rules',
  'treadmill.category.agents': 'Agents',
  'treadmill.category.tools': 'Tools',
  'treadmill.category.integrations': 'Integrations',
  'treadmill.category.esteira': '阶段表',
  'treadmill.category.other': '其他',
  'treadmill.new': '+ 新建',
  'treadmill.newName': '名称（小写字母、数字和连字符）',
  'treadmill.create': '创建',
  'treadmill.invalidName': '名称只能包含小写字母、数字和连字符。',
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
  'tab.treadmill': 'Skills-treadmill',
  'treadmill.explain': 'The Treadmill installation ships with the harness and lives at {root}. Edit its skills, rules, commands, agents, tools, and stage table (esteira/pipeline.yaml) here; a save applies immediately and never touches a project\'s progress.',
  'treadmill.enabled': 'Treadmill is enabled: its skills and rules reach every project.',
  'treadmill.disabled': 'Treadmill is disabled: no skill is served and no rule is injected.',
  'treadmill.root': 'Installation root',
  'treadmill.pipelineError': 'The stage table is invalid: {reason}',
  'treadmill.save': 'Save',
  'treadmill.saved': 'Saved',
  'treadmill.cancel': 'Cancel',
  'treadmill.category.skills': 'Skills',
  'treadmill.category.commands': 'Commands',
  'treadmill.category.rules': 'Rules',
  'treadmill.category.agents': 'Agents',
  'treadmill.category.tools': 'Tools',
  'treadmill.category.integrations': 'Integrations',
  'treadmill.category.esteira': 'Stage table',
  'treadmill.category.other': 'Other',
  'treadmill.new': '+ New',
  'treadmill.newName': 'Name (lowercase letters, digits, and hyphens)',
  'treadmill.create': 'Create',
  'treadmill.invalidName': 'A name uses only lowercase letters, digits, and hyphens.',
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
