/** `docker` namespace dictionaries (view tab label + container/image copy). */

/** Dictionary namespace owned by this plugin. */
export const NS = 'docker'

/** The docker dictionary key set (the source of truth for both locales). */
export type DockerKey =
  | 'view.docker'
  | 'refresh'
  | 'loading'
  | 'unavailable'
  | 'failed'
  | 'containers'
  | 'containers.empty'
  | 'containers.ports'
  | 'images'
  | 'images.empty'
  | 'images.untagged'
  | 'logs.loading'
  | 'logs.empty'
  | 'logs.truncated'
  | 'logs.failed'
  | 'size.bytes'
  | 'size.mb'
  | 'size.gb'
  | 'compose.open'
  | 'compose.title'
  | 'compose.close'
  | 'compose.crumbs'
  | 'compose.loading'
  | 'compose.browseFailed'
  | 'compose.empty'
  | 'compose.truncated'
  | 'compose.none'
  | 'compose.selected'
  | 'compose.up'
  | 'compose.down'
  | 'compose.starting'
  | 'compose.stopping'
  | 'compose.runFailed'
  | 'compose.sent.up'
  | 'compose.sent.down'
  | 'action.start'
  | 'action.stop'
  | 'action.restart'
  | 'action.logs'
  | 'action.shell'
  | 'action.shell.title'
  | 'action.failed'
  | 'engine.start'
  | 'engine.install'
  | 'engine.starting'
  | 'engine.installing'
  | 'engine.failed'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The Docker view tab label and its container/image copy. */
    'docker': DockerKey
  }
}

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh: Record<DockerKey, string> = {
  'view.docker': 'Docker',
  'refresh': '刷新',
  'loading': '加载中…',
  'unavailable': '未连接到 Docker 引擎。启动 Docker 后刷新即可查看容器。',
  'failed': '读取 Docker 信息失败：{reason}',
  'containers': '容器',
  'containers.empty': '没有容器',
  'containers.ports': '端口 {ports}',
  'images': '镜像',
  'images.empty': '没有镜像',
  'images.untagged': '<无标签>',
  'logs.loading': '正在读取日志…',
  'logs.empty': '该容器没有日志输出',
  'logs.truncated': '仅显示最新的日志片段。',
  'logs.failed': '读取日志失败：{reason}',
  'action.start': '启动',
  'action.stop': '停止',
  'action.restart': '重启',
  'action.logs': '日志',
  'action.shell': '终端',
  'action.shell.title': '让助手在该容器内打开一个 shell',
  'action.failed': '操作失败：{reason}',
  'engine.start': '启动 {runtime}',
  'engine.install': '安装 {runtime}',
  'engine.starting': '正在启动容器引擎，首次启动可能需要几分钟…',
  'engine.installing': '正在安装容器运行时，这可能需要较长时间…',
  'engine.failed': '操作失败：{reason}',
  'size.bytes': '{size} B',
  'size.mb': '{size} MB',
  'size.gb': '{size} GB',
  'compose.open': 'Compose',
  'compose.title': '选择 Compose 文件',
  'compose.close': '关闭',
  'compose.crumbs': '路径',
  'compose.loading': '正在读取目录…',
  'compose.browseFailed': '无法读取该目录：{reason}',
  'compose.empty': '该目录下没有子目录或 Compose 文件。',
  'compose.truncated': '条目过多，仅显示前一部分。请进入更具体的目录。',
  'compose.none': '尚未选择 Compose 文件。',
  'compose.selected': '已选择：{file}',
  'compose.up': '启动',
  'compose.down': '停止',
  'compose.starting': '正在请求启动…',
  'compose.stopping': '正在请求停止…',
  'compose.runFailed': '无法提交请求：{reason}',
  'compose.sent.up': '已请求当前会话的智能体启动该项目，运行过程与结果见对话。',
  'compose.sent.down': '已请求当前会话的智能体停止该项目，运行过程与结果见对话。',
}

/** English dictionary. */
export const en: Record<DockerKey, string> = {
  'view.docker': 'Docker',
  'refresh': 'Refresh',
  'loading': 'Loading…',
  'unavailable': 'No Docker engine is reachable. Start Docker and refresh to see containers.',
  'failed': 'Reading Docker state failed: {reason}',
  'containers': 'Containers',
  'containers.empty': 'No containers',
  'containers.ports': 'Ports {ports}',
  'images': 'Images',
  'images.empty': 'No images',
  'images.untagged': '<untagged>',
  'logs.loading': 'Reading logs…',
  'logs.empty': 'This container produced no log output',
  'logs.truncated': 'Only the most recent log output is shown.',
  'logs.failed': 'Reading logs failed: {reason}',
  'action.start': 'Start',
  'action.stop': 'Stop',
  'action.restart': 'Restart',
  'action.logs': 'Logs',
  'action.shell': 'Shell',
  'action.shell.title': 'Ask the agent to open a shell inside this container',
  'action.failed': 'The action failed: {reason}',
  'engine.start': 'Start {runtime}',
  'engine.install': 'Install {runtime}',
  'engine.starting': 'Starting the container engine. A first boot can take a few minutes…',
  'engine.installing': 'Installing the container runtime. This can take a while…',
  'engine.failed': 'The action failed: {reason}',
  'size.bytes': '{size} B',
  'size.mb': '{size} MB',
  'size.gb': '{size} GB',
  'compose.open': 'Compose',
  'compose.title': 'Choose a Compose file',
  'compose.close': 'Close',
  'compose.crumbs': 'Path',
  'compose.loading': 'Reading directory…',
  'compose.browseFailed': 'Cannot read that directory: {reason}',
  'compose.empty': 'No subdirectories or Compose files here.',
  'compose.truncated': 'Too many entries to show. Open a more specific directory.',
  'compose.none': 'No Compose file selected yet.',
  'compose.selected': 'Selected: {file}',
  'compose.up': 'Up',
  'compose.down': 'Down',
  'compose.starting': 'Requesting the start…',
  'compose.stopping': 'Requesting the stop…',
  'compose.runFailed': 'Could not submit the request: {reason}',
  'compose.sent.up': 'Asked this session\'s agent to start the project. Its run and result appear in Chat.',
  'compose.sent.down': 'Asked this session\'s agent to stop the project. Its run and result appear in Chat.',
}
