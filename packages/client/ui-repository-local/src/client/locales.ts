/** Dictionaries for the local repository section. */

export const NS = 'repository-local'

/** The namespace key union. */
export type RepositoryLocalKey = keyof typeof zh

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'section.local': '本地仓库',
  'header.title': '本地 Git 仓库',
  'header.description': '检测当前所有已打开工作区中的 Git 仓库与工作区状态',
  'actions.refresh': '刷新',
  'repo.workspace': '所属工作区',
  'repo.submodule': '子模块',
  'repo.root': '路径',
  'status.clean': '工作区干净',
  'status.dirty': '有未提交更改',
  'status.branch': '当前分支',
  'status.upstream': '上游分支',
  'status.ahead': '领先',
  'status.behind': '落后',
  'status.commits': '个提交',
  'status.changes': '处更改',
  'status.staged': '暂存区',
  'status.unstaged': '未暂存',
  'status.untracked': '未跟踪',
  'status.detached': '头指针分离',
  'empty.title': '未发现本地 Git 仓库',
  'empty.description': '当前工作区目录下未检测到任何 Git 版本库。',
  'unavailable.title': 'Git 服务不可用',
  'unavailable.description': '宿主未加载 Git RPC 域或当前环境不支持 Git 操作。',
  'error.title': '加载本地仓库失败',
  'error.retry': '重试',
  'details.title': '仓库状态摘要',
  'details.selectHint': '选择左侧仓库以查看详细状态',
}

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'section.local': 'Local Repositories',
  'header.title': 'Local Git Repositories',
  'header.description': 'Detects Git repositories and working tree statuses in all open workspaces',
  'actions.refresh': 'Refresh',
  'repo.workspace': 'Workspace',
  'repo.submodule': 'Submodule',
  'repo.root': 'Path',
  'status.clean': 'Working tree clean',
  'status.dirty': 'Uncommitted changes',
  'status.branch': 'Branch',
  'status.upstream': 'Upstream',
  'status.ahead': 'Ahead',
  'status.behind': 'Behind',
  'status.commits': 'commits',
  'status.changes': 'changes',
  'status.staged': 'Staged',
  'status.unstaged': 'Unstaged',
  'status.untracked': 'Untracked',
  'status.detached': 'Detached HEAD',
  'empty.title': 'No local Git repositories found',
  'empty.description': 'No Git repositories detected under the current workspace directories.',
  'unavailable.title': 'Git service unavailable',
  'unavailable.description': 'The host does not mount the Git RPC domain or the current environment does not support Git operations.',
  'error.title': 'Failed to load local repositories',
  'error.retry': 'Retry',
  'details.title': 'Repository Status Summary',
  'details.selectHint': 'Select a repository to view status details',
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** This repository panel's copy. */
    'repository-local': RepositoryLocalKey
  }
}
