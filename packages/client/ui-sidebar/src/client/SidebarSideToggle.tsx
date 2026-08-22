/**
 * The sidebar-footer control that mirrors the frame: swaps the sidebar
 * between the left and right outer columns. Placement lives in ui-layout's
 * store; this entry only calls the cross-plugin ctx.layout face.
 */

import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './SidebarSideToggle.module.css'

/** Registration-side business face for the side toggle. */
export interface SidebarSideToggleInjected {
  /** Mirror the frame: swap the sidebar to the opposite outer column. */
  toggle: () => void
}

/** Full component props. */
export type SidebarSideToggleProps =
  PropsRuntime<'sidebar.footer.action'>
  & PropsLocale<'sidebar'>
  & InjectFace<SidebarSideToggleInjected>

/**
 * Render the sidebar-side switch button.
 * @param props - composed slot props (the foot's wide flag sizes the control).
 * @returns the toggle button.
 */
export function SidebarSideToggle({ wide, toggle, t }: SidebarSideToggleProps) {
  return (
    <button
      type="button"
      className={css.toggle}
      data-wide={wide}
      aria-label={t('side.toggle')}
      title={t('side.toggle')}
      onClick={toggle}
    >
      <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden>
        <rect x="1.2" y="2.5" width="13.6" height="11" rx="1.6" stroke="currentColor" strokeWidth="1.2" />
        <rect x="10.6" y="3.7" width="2.8" height="8.6" rx="1" fill="currentColor" opacity="0.45" />
        <path d="M6.6 5.6L4.6 8L6.6 10.4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M4.6 8H8.6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    </button>
  )
}
