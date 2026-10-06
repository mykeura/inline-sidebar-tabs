// SPDX-FileCopyrightText: 2026 Miguel (@mykeura)
//
// MIT License

/**
 * Inline Sidebar Tabs for Hermes Agent
 *
 * Keeps the Sessions / Bots tab strip in the same native titlebar row as the
 * left sidebar toggle whenever there is enough horizontal space. When the
 * sidebar becomes too narrow, Hermes' current two-row layout is preserved.
 *
 * This is a runtime-only DOM/CSS adaptation. It does not modify Hermes core.
 */

const PLUGIN_ID = 'inline-sidebar-tabs'
const MARKER = 'data-inline-sidebar-tabs'
const MIN_FREE_WIDTH = 120
const TITLEBAR_HEIGHT = 34
const TITLEBAR_DRAG_HANDLE_WIDTH = 48
// apps/desktop/src/app/shell/titlebar.ts — fired when the window-chrome
// clusters remount or move without resizing (route overlays, fullscreen).
const TITLEBAR_CHROME_CHANGED_EVENT = 'hermes:titlebar-chrome-changed'

const CSS = `
/* Collapse the sidebar header back to the native titlebar height. */
[${MARKER}] > [data-panel-header] {
  height: ${TITLEBAR_HEIGHT}px !important;
}

/* Hermes currently absolutely positions the Sessions/Bots strip on a second
   row. Put it back into the header's flex flow so the existing left/right
   titlebar reservations place it beside the sidebar toggle. */
[${MARKER}] [data-zone-tabstrip] {
  position: relative !important;
  inset: auto !important;
  height: 100% !important;
  min-height: 0 !important;
  flex: 1 1 0% !important;
  -webkit-app-region: drag !important;
}

/* Tabs and controls must remain interactive inside Electron's drag region. */
[${MARKER}] [data-zone-tabstrip] [data-tree-tab],
[${MARKER}] [data-zone-tabstrip] button,
[${MARKER}] [data-zone-tabstrip] a {
  -webkit-app-region: no-drag !important;
}

/* TreeGroup thinks the strip is still below the titlebar and therefore gives
   the free drag handle flex:1. Match the real titlebar layout instead. */
[${MARKER}] > [data-panel-header] [data-window-drag-handle] {
  flex: 0 0 ${TITLEBAR_DRAG_HANDLE_WIDTH}px !important;
  width: ${TITLEBAR_DRAG_HANDLE_WIDTH}px !important;
  min-width: ${TITLEBAR_DRAG_HANDLE_WIDTH}px !important;
}
`

function clearMarkers(except = null) {
  for (const element of document.querySelectorAll(`[${MARKER}]`)) {
    if (element !== except) {
      element.removeAttribute(MARKER)
    }
  }
}

function findSidebarGroup() {
  const sessionsTab = document.querySelector('[data-tree-tab="sessions"]')

  if (!sessionsTab) {
    return null
  }

  const group = sessionsTab.closest('[data-tree-group]')

  if (!(group instanceof HTMLElement)) {
    return null
  }

  // Only adapt the horizontal top-edge zone. A collapsed sidebar uses a
  // vertical restore rail and must keep Hermes' native behaviour.
  if (!group.hasAttribute('data-window-top')) {
    return null
  }

  const header = group.querySelector(':scope > [data-panel-header]')
  const strip = group.querySelector('[data-zone-tabstrip]')

  if (!(header instanceof HTMLElement) || !(strip instanceof HTMLElement)) {
    return null
  }

  return group
}

function hasEnoughTitlebarSpace(group) {
  const leftControls = document.querySelector('[data-titlebar-cluster="left"]')
  const rightControls = document.querySelector('[data-titlebar-cluster="right"]')

  if (!(leftControls instanceof HTMLElement) || !(rightControls instanceof HTMLElement)) {
    return false
  }

  const rect = group.getBoundingClientRect()
  const leftRect = leftControls.getBoundingClientRect()
  const rightRect = rightControls.getBoundingClientRect()

  if (!rect.width) {
    return false
  }

  // Mirrors Hermes' usePanelTitlebar() reservation math.
  const left = Math.min(rect.width, Math.max(0, leftRect.right + 12 - rect.left))
  const right = Math.min(rect.width - left, Math.max(0, rect.right - rightRect.left + 24))

  return rect.width - left - right >= MIN_FREE_WIDTH
}

export default {
  id: PLUGIN_ID,
  name: 'Inline Sidebar Tabs',
  description: 'Keeps Sessions and Bots beside the sidebar toggle when there is enough titlebar space.',

  register(ctx) {
    const style = document.createElement('style')
    style.dataset.plugin = PLUGIN_ID
    style.textContent = CSS
    document.head.appendChild(style)

    let frame = 0
    let disposed = false
    // The elements the last sync measured against. Mutations elsewhere in the
    // app (chat streaming touches the DOM constantly) must not force a layout
    // read per frame — only structural changes below re-schedule a sync.
    let observed = { group: null, left: null, right: null }

    const resizeObserver = new ResizeObserver(() => scheduleSync())

    const sync = () => {
      if (disposed) {
        return
      }

      const group = findSidebarGroup()

      resizeObserver.disconnect()

      if (!group) {
        observed = { group: null, left: null, right: null }
        clearMarkers()
        return
      }

      const leftControls = document.querySelector('[data-titlebar-cluster="left"]')
      const rightControls = document.querySelector('[data-titlebar-cluster="right"]')

      observed = { group, left: leftControls, right: rightControls }

      resizeObserver.observe(group)

      if (leftControls instanceof HTMLElement) {
        resizeObserver.observe(leftControls)
      }

      if (rightControls instanceof HTMLElement) {
        resizeObserver.observe(rightControls)
      }

      if (hasEnoughTitlebarSpace(group)) {
        clearMarkers(group)
        group.setAttribute(MARKER, '')
      } else {
        clearMarkers()
      }
    }

    const scheduleSync = () => {
      if (disposed) {
        return
      }

      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(sync)
    }

    const mutationObserver = new MutationObserver(() => {
      if (disposed) {
        return
      }

      // Structural check only — querySelector identity, no layout. A sync runs
      // when the sidebar group remounts, the sessions tab moves to another
      // group, or a titlebar cluster is replaced (route overlays swap the
      // whole cluster set, which also invalidates the ResizeObserver targets).
      const group = findSidebarGroup()

      if (group === observed.group &&
          document.querySelector('[data-titlebar-cluster="left"]') === observed.left &&
          document.querySelector('[data-titlebar-cluster="right"]') === observed.right) {
        return
      }

      scheduleSync()
    })
    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true
    })

    // `resize` is not redundant with the ResizeObserver: a fixed-width sidebar
    // changes its free space when the window grows without the group or the
    // clusters resizing (the right cluster only MOVES). The chrome event
    // covers the position-only moves `resize` also misses (fullscreen).
    window.addEventListener('resize', scheduleSync)
    window.addEventListener(TITLEBAR_CHROME_CHANGED_EVENT, scheduleSync)
    scheduleSync()

    ctx.onDispose(() => {
      disposed = true
      cancelAnimationFrame(frame)
      mutationObserver.disconnect()
      resizeObserver.disconnect()
      window.removeEventListener('resize', scheduleSync)
      window.removeEventListener(TITLEBAR_CHROME_CHANGED_EVENT, scheduleSync)
      clearMarkers()
      style.remove()
    })
  }
}
