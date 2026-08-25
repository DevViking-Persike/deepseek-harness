/**
 * The editor tab's own composition contract: the panel slot it declares and
 * the owner share it passes there.
 *
 * The editor tab is a workspace surface, not only a file buffer. A sibling
 * panel (version control is the first) needs the same file tree, the same open
 * buffer, and the same session — so it takes a seat INSIDE this tab rather
 * than becoming another `conversation.view` entry, which would duplicate all
 * three and split one workflow across two tabs.
 * @module @deepseek-ai/dsh-client-ui-editor/client/contract
 */

/**
 * What the editor tab hands a panel that takes its seat.
 *
 * Every member is plain data or a callback over plain data: the panel is a
 * separate package, and the slot system carries nothing else across that
 * boundary.
 */
export interface EditorPanelOwnerProps {
  /**
   * Absolute path of the file open in the buffer, or undefined when none is.
   * A panel highlights the row matching it rather than tracking selection
   * itself.
   */
  readonly openPath?: string
  /**
   * Open a file in this tab's buffer. The panel calls it to hand a changed
   * file to the editor, which is what keeps reviewing and editing one gesture
   * apart instead of two tabs apart.
   */
  readonly openFile: (path: string) => void
  /**
   * Reload the open buffer from disk. A panel calls it after an operation
   * that rewrote the file the buffer holds — a discard is the case — so the
   * editor never shows content the working tree has already left.
   */
  readonly reloadBuffer: () => void
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /**
     * One panel beside the editor's file tree and buffer, selected by the
     * tab's own panel switcher. Entries render by ascending `order`; the
     * editor's own Files panel is not an entry here — it is what the tab shows
     * when no other panel is chosen, so an empty ring leaves a working editor
     * rather than a blank pane.
     *
     * Session scope: a panel reads the addressed session through the standard
     * kit, the same way the tab itself does.
     */
    'conversation.view.editor.panel': {
      kind: 'list'
      scope: 'session'
      owner: EditorPanelOwnerProps
    }
  }
}
