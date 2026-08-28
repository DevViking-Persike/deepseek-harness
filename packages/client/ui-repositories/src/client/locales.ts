/** Dictionaries for the repositories conversation view. */

export const NS = 'repositories'

export type RepositoriesKey = keyof typeof zh

export const zh = {
  'view.repositories': '代码仓库',
  'header.title': '代码仓库管理',
  'header.description': '浏览与管理当前工作区关联的代码仓库及第三方代码托管平台集成',
  'sections.empty': '暂无已启用的代码仓库源',
  'tab.local': '本地仓库',
  'tab.github': 'GitHub',
  'tab.gitlab': 'GitLab',
}

export const en = {
  'view.repositories': 'Repositories',
  'header.title': 'Repository Management',
  'header.description': 'Browse and manage repositories associated with current workspaces and git hosting integrations',
  'sections.empty': 'No repository sources available',
  'tab.local': 'Local',
  'tab.github': 'GitHub',
  'tab.gitlab': 'GitLab',
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** This repository panel's copy. */
    'repositories': RepositoriesKey
  }
}
