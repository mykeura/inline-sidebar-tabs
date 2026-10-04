# Inline Sidebar Tabs for Hermes Agent

A compact layout plugin for Hermes Desktop that keeps your **Sessions** and **Bots** tabs on the same row as the **Hide sidebar** button — reclaiming the vertical space Hermes currently wastes on a second titlebar row.

![Preview: without and with the plugin](image/preview.jpg)

## What you get

- **Less wasted space.** The tab strip sits beside the sidebar toggle instead of below it, giving your sidebar more room.
- **Fully automatic.** The plugin detects available space and only applies the compact layout when it fits. Narrow sidebars keep Hermes' native two-row layout.
- **Zero configuration.** Install, reload, and forget.

## Installation

1. Copy the `inline-sidebar-tabs` folder so that `plugin.js` ends up at:

   ```
   ~/.hermes/desktop-plugins/inline-sidebar-tabs/plugin.js
   ```

2. In Hermes Desktop, run **Reload desktop plugins** (or restart the app).

That's it. The plugin activates immediately.

## Disabling

Disable **Inline Sidebar Tabs** from Hermes' Plugins panel, or delete the folder:

```
~/.hermes/desktop-plugins/inline-sidebar-tabs/
```

Reload plugins and Hermes returns to its default layout.

## Requirements

- Hermes Desktop (built against the October 2026 layout).

## License

[MIT](LICENSE)
