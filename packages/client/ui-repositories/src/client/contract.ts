/**
 * The repositories tab's composition contract: the section slot it declares
 * and the owner share it passes there.
 * @module @deepseek-ai/dsh-client-ui-repositories/client/contract
 */

/**
 * What the repositories tab hands a section that takes a seat.
 */
export interface RepositoriesSectionOwnerProps {}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /**
     * One section inside the repositories view (e.g. Local, GitHub, GitLab),
     * selected by the view's top navigation tab bar. Entries render by
     * ascending `order`.
     *
     * Session scope: a section reads the addressed session through the
     * standard kit.
     */
    'conversation.view.repositories.section': {
      kind: 'list'
      scope: 'session'
      owner: RepositoriesSectionOwnerProps
    }
  }
}
