/** Dictionaries for the GitHub repository section. */

export const NS = 'repository-github'

/** The namespace key union. */
export type RepositoryGithubKey = keyof typeof zh

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'section.github': 'GitHub',
  'header.title': 'GitHub 代码托管',
  'header.description': '连接 GitHub 账号与组织，同步远程仓库、拉取请求与 Issues',
  'status.unconfigured': '未配置宿主 Provider',
  'notice.title': 'GitHub 宿主 Provider 待接入',
  'notice.description': '当前环境尚未安装或配置 @deepseek-ai/dsh-provider-github 宿主能力。',
  'features.title': '接入后支持的特性',
  'features.clone': '一键克隆与绑定远程 GitHub 仓库到当前工作区',
  'features.pr': '直接在界面中浏览、审查和讨论 Pull Requests',
  'features.issues': '查看关联 Issue 与自动化任务状态',
  'features.sync': '双向同步分支与实时状态更新',
  'guide.title': '如何开启',
  'guide.step1': '1. 在宿主配置 cordis.yml 中挂载 GitHub Provider 插件',
  'guide.step2': '2. 配置 Personal Access Token 或 GitHub App 认证凭据',
  'guide.step3': '3. 刷新页面以完成服务发现与初始化',
}

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'section.github': 'GitHub',
  'header.title': 'GitHub Hosting',
  'header.description': 'Connect GitHub accounts and organizations to sync remote repositories, pull requests, and issues',
  'status.unconfigured': 'Host Provider Not Configured',
  'notice.title': 'GitHub Host Provider Not Connected',
  'notice.description': 'The @deepseek-ai/dsh-provider-github host capability is not yet installed or configured in this environment.',
  'features.title': 'Planned Features Once Connected',
  'features.clone': 'One-click clone and bind remote GitHub repositories to workspace',
  'features.pr': 'Browse, review, and discuss Pull Requests directly in the interface',
  'features.issues': 'View linked Issues and automation task progress',
  'features.sync': 'Bidirectional branch sync and live status updates',
  'guide.title': 'How to Enable',
  'guide.step1': '1. Mount the GitHub Provider plugin in host configuration cordis.yml',
  'guide.step2': '2. Configure a Personal Access Token or GitHub App credentials',
  'guide.step3': '3. Reload the page to complete service discovery and initialization',
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** This repository panel's copy. */
    'repository-github': RepositoryGithubKey
  }
}
