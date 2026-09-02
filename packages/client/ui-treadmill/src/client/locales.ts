/** Treadmill view dictionaries. */
/** Locale namespace of the Treadmill view. */
export const NS = 'treadmill'
/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'view.treadmill': '流水线',
  title: 'OpenNjord 流水线',
  absent: '此项目尚无流水线游标 .spec/esteira-state.yaml。安装会在项目中创建 .spec/ 和 docs/adrs/；方法本身由 harness 提供。',
  install: '在此项目安装流水线', installing: '安装中…', installFailed: '无法提交安装：{reason}',
  disabled: 'Treadmill 已停用。在 设置 → 知识库 → Skills-treadmill 中启用。', pipelineError: '阶段表无效：{reason}', unknownStage: '游标阶段 {stage} 不在阶段表中；进度已保留，请在阶段表中恢复该阶段或推进游标。',
  loadFailed: '无法读取流水线游标：{reason}',
  run: '运行当前阶段', runStage: '运行此阶段', running: '运行中…', runFailed: '无法提交阶段：{reason}',
  sprint: 'Sprint', runId: '运行', revision: '修订', updatedAt: '更新于', progress: '进度',
  'pipeline.running': '运行中', 'pipeline.awaiting-user': '等待你', 'pipeline.awaiting-gate': '等待关卡', 'pipeline.done': '已完成', 'pipeline.failed': '失败',
  'status.pending': '待处理', 'status.running': '运行中', 'status.awaiting-user': '等待你', 'status.awaiting-gate': '关卡中', 'status.done': '已完成', 'status.error': '错误',
  'section.discovery': '00 Discovery', 'section.sprint': 'Sprint', 'section.architecture': '10 架构', 'section.development': '20 开发',
  'section.review': '25 评审', 'section.qa': '30 QA', 'section.security': '40 安全', 'section.deploy': '部署',
  'stage.00-discovery': 'Discovery', 'stage.plano': 'Sprint 计划', 'stage.00s': 'Sprint Discovery', 'stage.10a': '设计关卡',
  'stage.20': '开发', 'stage.25': '代码评审', 'stage.10b': '架构评审', 'stage.30-qa-rpa': 'QA RPA', 'stage.30-qa': 'QA 关卡',
  'stage.40-redteam': '红队', 'stage.40-seguranca': '安全关卡', 'stage.deploy': '部署',
  panel: '阶段', close: '关闭', status: '状态', skill: 'Skill', gate: '关卡', gateManual: '人工', gateAuto: '自动',
  attempt: '尝试', notRun: '尚未执行', verdict: '结论', noVerdict: '尚无', produces: '产物目录', nothingProduced: '无',
  sprints: 'Sprints', sprintsCount: '{count} 个 sprint', noSprints: '游标没有 backlog。', backlogDone: '已完成', backlogPending: '待处理',
  usage: '会话用量', input: '输入', output: '输出', cacheRead: '缓存读取', cacheWrite: '缓存写入', tools: '工具调用',
  models: '模型活动', noModelActivity: '此会话尚无已完成的模型步骤。',
  sourceNote: '阶段方法由 harness 的 OpenNjord skills 提供；状态仅来自项目的 .spec/esteira-state.yaml。',
} as const
/** The Treadmill dictionary key set. */
export type TreadmillKey = keyof typeof zh
/** English dictionary. */
export const en: Record<TreadmillKey, string> = {
  'view.treadmill': 'Treadmill',
  title: 'OpenNjord Treadmill',
  absent: 'This project has no Treadmill cursor at .spec/esteira-state.yaml. Installing creates .spec/ and docs/adrs/ in the project; the method itself comes from the harness.',
  install: 'Install the Treadmill in this project', installing: 'Installing…', installFailed: 'The installation could not be submitted: {reason}',
  disabled: 'Treadmill is disabled. Enable it under Settings → Knowledge → Skills-treadmill.', pipelineError: 'The stage table is invalid: {reason}', unknownStage: 'The cursor stage {stage} is not in the stage table; progress is kept, restore the stage in the table or advance the cursor.',
  loadFailed: 'The Treadmill cursor could not be read: {reason}',
  run: 'Run current stage', runStage: 'Run this stage', running: 'Running…', runFailed: 'The stage could not be submitted: {reason}',
  sprint: 'Sprint', runId: 'Run', revision: 'Revision', updatedAt: 'Updated', progress: 'Progress',
  'pipeline.running': 'Running', 'pipeline.awaiting-user': 'Waiting for you', 'pipeline.awaiting-gate': 'Awaiting gate', 'pipeline.done': 'Done', 'pipeline.failed': 'Failed',
  'status.pending': 'Pending', 'status.running': 'Running', 'status.awaiting-user': 'Waiting for you', 'status.awaiting-gate': 'In gate', 'status.done': 'Done', 'status.error': 'Error',
  'section.discovery': '00 Discovery', 'section.sprint': 'Sprint', 'section.architecture': '10 Architecture', 'section.development': '20 Development',
  'section.review': '25 Review', 'section.qa': '30 QA', 'section.security': '40 Security', 'section.deploy': 'Deploy',
  'stage.00-discovery': 'Discovery', 'stage.plano': 'Sprint plan', 'stage.00s': 'Sprint discovery', 'stage.10a': 'Design gate',
  'stage.20': 'Development', 'stage.25': 'Code review', 'stage.10b': 'Architecture review', 'stage.30-qa-rpa': 'QA RPA', 'stage.30-qa': 'QA gate',
  'stage.40-redteam': 'Red team', 'stage.40-seguranca': 'Security gate', 'stage.deploy': 'Deploy',
  panel: 'Stage', close: 'Close', status: 'Status', skill: 'Skill', gate: 'Gate', gateManual: 'Manual', gateAuto: 'Automatic',
  attempt: 'Attempt', notRun: 'Not run yet', verdict: 'Verdict', noVerdict: 'None yet', produces: 'Writes to', nothingProduced: 'Nothing',
  sprints: 'Sprints', sprintsCount: '{count} sprints', noSprints: 'The cursor has no backlog.', backlogDone: 'done', backlogPending: 'pending',
  usage: 'Session usage', input: 'Input', output: 'Output', cacheRead: 'Cache read', cacheWrite: 'Cache write', tools: 'Tool calls',
  models: 'Model activity', noModelActivity: 'This session has no completed model steps yet.',
  sourceNote: 'Stage methods come from the OpenNjord skills the harness ships; state comes only from the project\'s .spec/esteira-state.yaml.',
}
