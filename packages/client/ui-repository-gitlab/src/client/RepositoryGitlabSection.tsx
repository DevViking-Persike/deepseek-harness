/**
 * GitLab repository section: shows honest status for the unconfigured host provider
 * and details planned remote integration features.
 */
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-repositories/client'
import css from './RepositoryGitlabSection.module.css'

/** Props passed to RepositoryGitlabSection. */
export type RepositoryGitlabProps =
  PropsRuntime<'conversation.view.repositories.section'>
  & PropsLocale<'repository-gitlab'>

export function RepositoryGitlabSection({ t }: RepositoryGitlabProps) {
  return (
    <div className={css.root}>
      <div className={css.header}>
        <div className={css.titleGroup}>
          <h3 className={css.title}>{t('header.title')}</h3>
          <p className={css.description}>{t('header.description')}</p>
        </div>
        <span className={css.statusBadge}>{t('status.unconfigured')}</span>
      </div>

      <div className={css.card}>
        <h4 className={css.cardTitle}>{t('notice.title')}</h4>
        <p className={css.cardDescription}>{t('notice.description')}</p>
      </div>

      <div className={css.card}>
        <h4 className={css.cardTitle}>{t('features.title')}</h4>
        <ul className={css.featureList}>
          <li>{t('features.clone')}</li>
          <li>{t('features.mr')}</li>
          <li>{t('features.ci')}</li>
          <li>{t('features.sync')}</li>
        </ul>
      </div>

      <div className={css.card}>
        <h4 className={css.cardTitle}>{t('guide.title')}</h4>
        <div className={css.guideSteps}>
          <div>{t('guide.step1')}</div>
          <div>{t('guide.step2')}</div>
          <div>{t('guide.step3')}</div>
        </div>
      </div>
    </div>
  )
}
