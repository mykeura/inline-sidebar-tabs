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
const TITLEBAR_HEIGHT_VAR = '--inline-sidebar-tabs-titlebar-height'
const TITLEBAR_DRAG_HANDLE_WIDTH = 48
// apps/desktop/src/app/shell/titlebar.ts — fired when the window-chrome
// clusters remount or move without resizing (route overlays, fullscreen).
const TITLEBAR_CHROME_CHANGED_EVENT = 'hermes:titlebar-chrome-changed'

const CSS = `
/* Collapse the sidebar header back to the native titlebar height. The var is
   fed the band height measured off the live header (touch hosts use 44px,
   not 34); TITLEBAR_HEIGHT is only the pre-measurement fallback. */
[${MARKER}] > [data-panel-header] {
  height: var(${TITLEBAR_HEIGHT_VAR}, ${TITLEBAR_HEIGHT}px) !important;
}

/* Hermes currently absolutely positions the Sessions/Bots strip on a second
   row. Put it back into the header's flex flow so the existing left/right
   titlebar reservations place it beside the sidebar toggle. Scoped under the
   header: a strip ever living outside it must fail safe, not be restyled. */
[${MARKER}] > [data-panel-header] [data-zone-tabstrip] {
  position: relative !important;
  inset: auto !important;
  height: 100% !important;
  min-height: 0 !important;
  flex: 1 1 0% !important;
  -webkit-app-region: drag !important;
}

/* Tabs and controls must remain interactive inside Electron's drag region. */
[${MARKER}] > [data-panel-header] [data-zone-tabstrip] [data-tree-tab],
[${MARKER}] > [data-panel-header] [data-zone-tabstrip] button,
[${MARKER}] > [data-panel-header] [data-zone-tabstrip] a {
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
  let fallback = null

  for (const group of document.querySelectorAll('[data-tree-group][data-window-top]')) {
    if (!(group instanceof HTMLElement)) {
      continue
    }

    // Hermes' sidebarGroup is any zone holding no main chrome (workspace or
    // placement==='main' panes); a mixed group's strip already sits in the
    // titlebar natively. The sessions tab is only the anchor when visible —
    // hiding it must not silently disengage the rest of the strip.
    if (group.querySelector('[data-tree-tab="workspace"]')) {
      continue
    }

    // Only the horizontal top-edge zone is a candidate: the data-window-top
    // selector above already excluded a collapsed sidebar's restore rail.
    const header = group.querySelector(':scope > [data-panel-header]')
    const strip = group.querySelector('[data-zone-tabstrip]')

    if (!(header instanceof HTMLElement) || !(strip instanceof HTMLElement) || !header.contains(strip)) {
      continue
    }

    const candidate = { group, header, strip }

    if (group.querySelector('[data-tree-tab="sessions"]')) {
      return candidate
    }

    if (!fallback) {
      fallback = candidate
    }
  }

  return fallback
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

  // Mirrors Hermes' usePanelTitlebar() reservation math — the 48px drag
  // handle already supplies the right-hand clearance.
  const left = Math.min(rect.width, Math.max(0, leftRect.right + 12 - rect.left))
  const right = Math.min(rect.width - left, Math.max(0, rect.right - rightRect.left))

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

    let frame = 0
    let disposed = false
    // The elements the last sync measured against — plus the group's DOM
    // neighbourhood, so a same-node move (pane flips reorder siblings without
    // resizing anything) still reads as a structural change. Mutations
    // elsewhere in the app (chat streaming touches the DOM constantly) must
    // not force a layout read per frame — only those changes re-schedule a
    // sync.
    let observed = { group: null, left: null, right: null, parent: null, prev: null, next: null }

    const sync = () => {
      if (disposed) {
        return
      }

      const found = findSidebarGroup()
      const group = found?.group ?? null
      const leftControls = document.querySelector('[data-titlebar-cluster="left"]')
      const rightControls = document.querySelector('[data-titlebar-cluster="right"]')

      // Diff the target set instead of disconnect()+observe(): every fresh
      // observe() queues an initial notification, so re-observing unchanged
      // targets rescheduled sync forever — a ~60fps layout-read loop.
      for (const el of [observed.group, observed.left, observed.right]) {
        if (el instanceof HTMLElement && el !== group && el !== leftControls && el !== rightControls) {
          resizeObserver.unobserve(el)
        }
      }

      for (const el of [group, leftControls, rightControls]) {
        if (el instanceof HTMLElement && el !== observed.group && el !== observed.left && el !== observed.right) {
          resizeObserver.observe(el)
        }
      }

      observed = {
        group,
        left: leftControls,
        right: rightControls,
        parent: group?.parentElement ?? null,
        prev: group?.previousElementSibling ?? null,
        next: group?.nextElementSibling ?? null
      }

      if (!found) {
        clearMarkers()
        return
      }

      if (hasEnoughTitlebarSpace(group)) {
        // The band height is only measurable while the override is off — the
        // native header is band + strip. Touch hosts run a 44px band, not 34.
        if (!group.hasAttribute(MARKER)) {
          const bandHeight = found.header.getBoundingClientRect().height - found.strip.getBoundingClientRect().height
          if (bandHeight > 0) {
            group.style.setProperty(TITLEBAR_HEIGHT_VAR, `${bandHeight}px`)
          }
        }
        clearMarkers(group)
        if (!group.hasAttribute(MARKER)) {
          group.setAttribute(MARKER, '')
        }
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

    const resizeObserver = new ResizeObserver(() => scheduleSync())

    const mutationObserver = new MutationObserver(() => {
      if (disposed) {
        return
      }

      // Structural check only — querySelector identity, no layout. A sync runs
      // when the sidebar group remounts or moves, the sessions tab moves to
      // another group, or a titlebar cluster is replaced (route overlays swap
      // the whole cluster set, which also invalidates the ResizeObserver
      // targets).
      const group = findSidebarGroup()?.group ?? null

      if (group === observed.group &&
          document.querySelector('[data-titlebar-cluster="left"]') === observed.left &&
          document.querySelector('[data-titlebar-cluster="right"]') === observed.right &&
          (!group ||
            (group.parentElement === observed.parent &&
             group.previousElementSibling === observed.prev &&
             group.nextElementSibling === observed.next))) {
        return
      }

      scheduleSync()
    })

    // Register the disposer before touching the DOM: if any setup line below
    // throws, the loader's rollback still unwinds every side effect.
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

    document.head.appendChild(style)
    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      // Eligibility attributes flip in place on stable elements (React renders
      // data-window-top conditionally) — childList alone misses those commits.
      attributes: true,
      attributeFilter: [
        'data-window-top',
        'data-tree-tab',
        'data-panel-header',
        'data-zone-tabstrip',
        'data-titlebar-cluster'
      ]
    })

    // `resize` is not redundant with the ResizeObserver: a fixed-width sidebar
    // changes its free space when the window grows without the group or the
    // clusters resizing (the right cluster only MOVES). The chrome event
    // covers the position-only moves `resize` also misses (fullscreen).
    window.addEventListener('resize', scheduleSync)
    window.addEventListener(TITLEBAR_CHROME_CHANGED_EVENT, scheduleSync)
    scheduleSync()
  }
}
