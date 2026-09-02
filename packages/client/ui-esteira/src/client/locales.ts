/** Esteira view dictionaries. */
export const NS = 'esteira'
export const zh = {
  'view.esteira': '开发流水线',
  title: 'OpenNjord 开发流水线',
  overview: '概览', stages: '阶段', runs: '运行', usage: '用量', models: '模型', artifacts: '产物', config: '配置',
  absent: '此项目尚未安装 OpenNjord 流水线。需要 .opennjord/skills 和 .spec/esteira-state.yaml。',
  loadFailed: '无法读取流水线游标：{reason}', run: '运行当前阶段', running: '正在运行…',
  sprint: '当前 Sprint', stage: '当前阶段', attempt: '尝试', verdict: '结论', pending: '待处理', done: '已完成',
  tokens: '会话 Token', input: '输入', output: '输出', cacheRead: '缓存读取', cacheWrite: '缓存写入',
  costUnavailable: '未配置精确的 provider/model 价格，无法计算金额。',
  modelActivity: '模型活动', noModelActivity: '此会话尚无已完成的模型步骤。', tools: '工具调用',
  skillRoot: 'Skill 根目录', cursor: '权威游标', sourceNote: '阶段方法来自 .opennjord/skills；状态仅来自 .spec/esteira-state.yaml。',
} as const
export type EsteiraKey = keyof typeof zh
export const en: Record<EsteiraKey, string> = {
  'view.esteira': 'Esteira',
  title: 'OpenNjord development pipeline',
  overview: 'Overview', stages: 'Stages', runs: 'Runs', usage: 'Usage', models: 'Models', artifacts: 'Artifacts', config: 'Configuration',
  absent: 'This project has no OpenNjord pipeline installation. It needs .opennjord/skills and .spec/esteira-state.yaml.',
  loadFailed: 'The Esteira cursor could not be read: {reason}', run: 'Run current stage', running: 'Running…',
  sprint: 'Active sprint', stage: 'Current stage', attempt: 'Attempt', verdict: 'Verdict', pending: 'Pending', done: 'Done',
  tokens: 'Session tokens', input: 'Input', output: 'Output', cacheRead: 'Cache read', cacheWrite: 'Cache write',
  costUnavailable: 'Exact provider/model prices are not configured, so monetary cost is unavailable.',
  modelActivity: 'Model activity', noModelActivity: 'This session has no completed model steps yet.', tools: 'Tool calls',
  skillRoot: 'Skill root', cursor: 'Authoritative cursor', sourceNote: 'Stage methods come from .opennjord/skills; state comes only from .spec/esteira-state.yaml.',
}
