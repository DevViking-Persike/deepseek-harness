/** Dictionaries for the GitLab repository section. */

export const NS = 'repository-gitlab'

export type RepositoryGitlabKey = keyof typeof zh

export const zh = {
  'section.gitlab': 'GitLab',
  'header.title': 'GitLab 代码托管',
  'header.description': '连接自建或云端 GitLab 实例，管理项目代码、Merge Requests 与 CI/CD 状态',
  'status.unconfigured': '未配置宿主 Provider',
  'notice.title': 'GitLab 宿主 Provider 待接入',
  'notice.description': '当前环境尚未安装或配置 @deepseek-ai/dsh-provider-gitlab 宿主能力。',
  'features.title': '接入后支持的特性',
  'features.clone': '接入 GitLab CE/EE 实例或 gitlab.com 项目并克隆至工作区',
  'features.mr': '查看与管理 Merge Requests、代码评审及流水线状态',
  'features.ci': '实时跟踪 CI/CD Pipeline 构建日志与产物',
  'features.sync': '团队权限同步与多分支协同开发',
  'guide.title': '如何开启',
  'guide.step1': '1. 在宿主配置 cordis.yml 中挂载 GitLab Provider 插件并指定实例 URL',
  'guide.step2': '2. 配置 GitLab Personal 或 Project Access Token 凭据',
  'guide.step3': '3. 刷新页面以完成服务发现与初始化',
}

export const en = {
  'section.gitlab': 'GitLab',
  'header.title': 'GitLab Hosting',
  'header.description': 'Connect self-hosted or cloud GitLab instances to manage projects, merge requests, and CI/CD pipelines',
  'status.unconfigured': 'Host Provider Not Configured',
  'notice.title': 'GitLab Host Provider Not Connected',
  'notice.description': 'The @deepseek-ai/dsh-provider-gitlab host capability is not yet installed or configured in this environment.',
  'features.title': 'Planned Features Once Connected',
  'features.clone': 'Connect GitLab CE/EE instances or gitlab.com projects to workspace',
  'features.mr': 'View and manage Merge Requests, code reviews, and pipeline statuses',
  'features.ci': 'Real-time CI/CD pipeline build tracking and artifacts',
  'features.sync': 'Team permission sync and multi-branch collaborative workflows',
  'guide.title': 'How to Enable',
  'guide.step1': '1. Mount the GitLab Provider plugin in host configuration cordis.yml with instance URL',
  'guide.step2': '2. Configure a GitLab Personal or Project Access Token',
  'guide.step3': '3. Reload the page to complete service discovery and initialization',
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** This repository panel's copy. */
    'repository-gitlab': RepositoryGitlabKey
  }
}
