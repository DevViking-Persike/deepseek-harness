/** `git` namespace dictionaries (panel label, change list, and commit copy). */

/** Dictionary namespace owned by this plugin. */
export const NS = 'git'

/** The git dictionary key set (the source of truth for both locales). */
export type GitKey =
  | 'panel.git'
  | 'repos.loading'
  | 'repos.empty'
  | 'repos.failed'
  | 'repos.label'
  | 'branch.detached'
  | 'worktrees.count'
  | 'worktrees.main'
  | 'worktrees.locked'
  | 'worktrees.prunable'
  | 'worktrees.bare'
  | 'worktrees.changes'
  | 'worktrees.clean'
  | 'branch.divergence'
  | 'status.loading'
  | 'status.failed'
  | 'status.clean'
  | 'status.truncated'
  | 'action.stage'
  | 'action.unstage'
  | 'action.discard'
  | 'action.open'
  | 'diff.loading'
  | 'diff.binary'
  | 'diff.failed'
  | 'recovery.kept'
  | 'recovery.dismiss'
  | 'commit.placeholder'
  | 'commit.now'
  | 'commit.viaAgent'
  | 'commit.viaAgentHint'
  | 'base.behind'
  | 'base.conflicts'
  | 'view.changes'
  | 'view.graph'
  | 'graph.empty'
  | 'graph.truncated'
  | 'unavailable'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The version-control panel's label and its change-list and commit copy. */
    'git': GitKey
  }
}

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh: Record<GitKey, string> = {
  'panel.git': '版本',
  'repos.loading': '正在查找仓库…',
  'repos.empty': '工作区中没有 Git 仓库。',
  'repos.failed': '查找仓库失败：{reason}',
  'repos.label': '选择仓库',
  'branch.detached': '（游离 HEAD）',
  'worktrees.count': '{count} 个工作树',
  'worktrees.main': '主',
  'worktrees.locked': '已锁定',
  'worktrees.prunable': '目录已丢失',
  'worktrees.bare': '裸仓库',
  'worktrees.changes': '{count} 项改动',
  'worktrees.clean': '无改动',
  'branch.divergence': '领先 {ahead}，落后 {behind}',
  'status.loading': '正在读取改动…',
  'status.failed': '读取改动失败：{reason}',
  'status.clean': '工作区没有改动。',
  'status.truncated': '改动过多，仅显示其中一部分。',
  'action.stage': '暂存',
  'action.unstage': '取消暂存',
  'action.discard': '丢弃',
  'action.open': '打开',
  'diff.loading': '正在读取改动内容…',
  'diff.binary': '该文件是二进制，无法按文本比较。',
  'diff.failed': '读取改动内容失败：{reason}',
  'recovery.kept': '已丢弃 {path}，其内容仍可通过 {id} 找回。',
  'recovery.dismiss': '知道了',
  'commit.placeholder': '提交说明',
  'commit.now': '提交 {count} 项',
  'commit.viaAgent': '交给助手提交',
  'commit.viaAgentHint': '由助手执行，提交过程会记录在会话记录中。',
  'base.behind': '{base} 已前进 {behind} 个提交，推送前请先同步。',
  'base.conflicts': '{base} 已前进 {behind} 个提交，且合并会产生冲突。',
  'view.changes': '改动',
  'view.graph': '图谱',
  'graph.empty': '暂无提交记录。',
  'graph.truncated': '历史较长，仅显示最近部分。',
  'unavailable': '此环境未挂载 Git，无法读取仓库。',
}

/** English dictionary. */
export const en: Record<GitKey, string> = {
  'panel.git': 'Source',
  'repos.loading': 'Looking for repositories…',
  'repos.empty': 'No Git repository in your workspaces.',
  'repos.failed': 'Looking for repositories failed: {reason}',
  'repos.label': 'Choose a repository',
  'branch.detached': '(detached HEAD)',
  'worktrees.count': '{count} worktrees',
  'worktrees.main': 'main',
  'worktrees.locked': 'locked',
  'worktrees.prunable': 'directory gone',
  'worktrees.bare': 'bare repository',
  'worktrees.changes': '{count} changed',
  'worktrees.clean': 'clean',
  'branch.divergence': 'ahead {ahead}, behind {behind}',
  'status.loading': 'Reading changes…',
  'status.failed': 'Reading changes failed: {reason}',
  'status.clean': 'No changes in this working tree.',
  'status.truncated': 'Too many changes to list; showing the first of them.',
  'action.stage': 'Stage',
  'action.unstage': 'Unstage',
  'action.discard': 'Discard',
  'action.open': 'Open',
  'diff.loading': 'Reading the change…',
  'diff.binary': 'This file is binary, so it has no text to compare.',
  'diff.failed': 'Reading the change failed: {reason}',
  'recovery.kept': 'Discarded {path}; its content is still recoverable as {id}.',
  'recovery.dismiss': 'Got it',
  'commit.placeholder': 'Commit message',
  'commit.now': 'Commit {count}',
  'commit.viaAgent': 'Commit via agent',
  'commit.viaAgentHint': 'The agent runs it, so the commit is recorded in the session log.',
  'base.behind': '{base} moved ahead by {behind} — rebase before pushing.',
  'base.conflicts': '{base} moved ahead by {behind} and merging would conflict.',
  'view.changes': 'Changes',
  'view.graph': 'Graph',
  'graph.empty': 'No commits yet.',
  'graph.truncated': 'History is longer than shown.',
  'unavailable': 'No Git is mounted here, so repositories cannot be read.',
}
