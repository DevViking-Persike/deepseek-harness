/** `editor` namespace dictionaries (view tab label + file tree and buffer copy). */

/** Dictionary namespace owned by this plugin. */
export const NS = 'editor'

/** The editor dictionary key set (the source of truth for both locales). */
export type EditorKey =
  | 'view.editor'
  | 'tree.loading'
  | 'tree.empty'
  | 'tree.failed'
  | 'tree.root'
  | 'buffer.none'
  | 'buffer.loading'
  | 'buffer.failed'
  | 'buffer.tooLarge'
  | 'buffer.notText'
  | 'save'
  | 'save.saving'
  | 'save.saved'
  | 'save.failed'
  | 'save.denied'
  | 'save.stale'
  | 'save.reload'
  | 'save.dirty'
  | 'unavailable'
  | 'languages.open'
  | 'languages.title'
  | 'languages.close'
  | 'languages.explain'
  | 'languages.loading'
  | 'languages.failed'
  | 'languages.mounted'
  | 'languages.missing'
  | 'languages.capabilities'
  | 'languages.requires'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The code editor tab label and its file tree and buffer copy. */
    'editor': EditorKey
  }
}

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh: Record<EditorKey, string> = {
  'view.editor': '编辑器',
  'tree.loading': '正在加载文件…',
  'tree.empty': '该目录为空',
  'tree.failed': '读取目录失败：{reason}',
  'tree.root': '工作区',
  'buffer.none': '从左侧选择一个文件开始编辑。',
  'buffer.loading': '正在打开文件…',
  'buffer.failed': '打开文件失败：{reason}',
  'buffer.tooLarge': '该文件过大，编辑器无法打开。',
  'buffer.notText': '该文件不是文本，无法在编辑器中显示。',
  'save': '保存',
  'save.saving': '正在保存…',
  'save.saved': '已保存',
  'save.failed': '保存失败：{reason}',
  'save.denied': '沙箱拒绝了此次写入。',
  'save.stale': '该文件已被改动（通常是助手正在编辑）。重新加载后再保存，以免覆盖对方的修改。',
  'save.reload': '重新加载',
  'save.dirty': '未保存',
  'unavailable': '此环境未挂载文件系统，编辑器无法读取文件。',
  'languages.open': '语言支持',
  'languages.title': '语言支持',
  'languages.close': '关闭',
  'languages.explain': '语言服务器是本机上的普通程序。已挂载的可提供悬停与跳转定义；缺失的可用下列命令安装。',
  'languages.loading': '正在读取已挂载的语言服务器…',
  'languages.failed': '读取失败：{reason}',
  'languages.mounted': '已挂载',
  'languages.missing': '未安装',
  'languages.capabilities': '当前提供：悬停、跳转定义、查找引用、跳转实现。尚不提供自动补全与错误诊断。',
  'languages.requires': '需要{requirement}',
}

/** English dictionary. */
export const en: Record<EditorKey, string> = {
  'view.editor': 'Editor',
  'tree.loading': 'Loading files…',
  'tree.empty': 'This directory is empty',
  'tree.failed': 'Reading the directory failed: {reason}',
  'tree.root': 'Workspace',
  'buffer.none': 'Choose a file on the left to start editing.',
  'buffer.loading': 'Opening the file…',
  'buffer.failed': 'Opening the file failed: {reason}',
  'buffer.tooLarge': 'This file is larger than the editor opens.',
  'buffer.notText': 'This file is not text, so the editor cannot show it.',
  'save': 'Save',
  'save.saving': 'Saving…',
  'save.saved': 'Saved',
  'save.failed': 'Saving failed: {reason}',
  'save.denied': 'The sandbox refused this write.',
  'save.stale': 'This file changed on disk — usually the agent editing it. Reload before saving so its work is not overwritten.',
  'save.reload': 'Reload',
  'save.dirty': 'Unsaved',
  'unavailable': 'No filesystem is mounted here, so the editor cannot read files.',
  'languages.open': 'Languages',
  'languages.title': 'Language support',
  'languages.close': 'Close',
  'languages.explain': 'A language server is an ordinary program on this machine. Mounted ones provide hover and go-to-definition; install a missing one with the command shown.',
  'languages.loading': 'Reading the mounted language servers…',
  'languages.failed': 'Reading the language servers failed: {reason}',
  'languages.mounted': 'mounted',
  'languages.missing': 'not installed',
  'languages.capabilities': 'Available today: hover, go to definition, find references, go to implementation. Completion and error diagnostics are not available yet.',
  'languages.requires': 'needs {requirement}',
}
