# Instant Nav Panel — 3-State Machine

## Context

The current "Instant Navigation Mode" menu item in the dev tools is a simple on/off toggle. We're upgrading it to a full panel called "Instant Navs" with a 3-state machine: **Waiting** (prompts user to navigate or refresh), **Client Nav** (shows From/To URLs after SPA navigation), and **Initial Page Load** (shows To URL after refresh). Each result screen has a Share button that copies a URL with query params. The cookie persistence for the refresh flow is temporary — a colleague will provide the final mechanism later.

## Files to Modify

### 1. `packages/next/src/next-devtools/dev-overlay/menu/context.tsx`
Add `'instant-nav'` to `PanelStateKind` union type.

### 2. `packages/next/src/next-devtools/dev-overlay/shared.ts`
- Add `instantNavPanel` to `OverlayState`:
  ```ts
  readonly instantNavPanel: {
    phase: 'waiting' | 'client-nav' | 'initial-load'
    fromUrl: string | null
    toUrl: string | null
  }
  ```
- Add action constants: `ACTION_INSTANT_NAV_SET_PHASE`, `ACTION_INSTANT_NAV_RESET`
- Add action interfaces and include them in the `DispatcherEvent` union
- Add reducer cases for both actions
- Update `INITIAL_OVERLAY_STATE` with default `instantNavPanel` state
- Extend the cookie-value parsing at init: if cookie value is `initial-load`, set `phase: 'initial-load'` and `toUrl: window.location.pathname`; set `cacheOnly: true`

### 3. `packages/next/src/next-devtools/dev-overlay/menu/panel-router.tsx`
- **Menu item**: Replace current "Instant Navigation Mode" item (lines 108-132) with:
  - Label: `"Instant Navs"`
  - Value: `<ChevronRight />` (already imported)
  - onClick: `() => setPanel('instant-nav')`
  - Attribute: `data-instant-nav: true` (replaces `data-cache-only`)
- **New PanelRoute**: Add `<PanelRoute name="instant-nav">` with `<DynamicPanel>`:
  - `closeOnClickOutside={false}` (prevent accidental closure that bypasses cleanup)
  - Fixed size: ~300h x 400w (divided by `state.scale`)
  - Header: `<DevToolsHeader title="Instant Nav" />` (X button returns to main menu)
  - Content: `<InstantNavPanel />`
- **Auto-open on refresh**: Add a `useEffect` in `PanelRouter` that checks if `state.instantNavPanel.phase === 'initial-load'` on mount and calls `setPanel('instant-nav')` to auto-open the panel after a refresh

### 4. New file: `packages/next/src/next-devtools/dev-overlay/components/instant-nav/instant-nav-panel.tsx`

The panel component with the 3-state UI. Key behaviors:

**On mount (entering waiting state):**
- Set cookie `next-instant-navigation-testing=1`
- Enable `cacheOnly` state if not already on
- Capture `window.location.pathname` as the `fromUrl`

**Navigation detection (waiting → client-nav):**
- Watch `state.page` (already updated by `dispatcher.segmentExplorerUpdateRouteState` on navigations)
- When `state.page` changes from the initial value while in `waiting` phase, dispatch `ACTION_INSTANT_NAV_SET_PHASE` with `phase: 'client-nav'`, `fromUrl`, and `toUrl: window.location.pathname`

**Refresh button (waiting → initial-load):**
- Set cookie to `next-instant-navigation-testing=initial-load`
- Call `window.location.reload()`
- After reload, `shared.ts` init reads the cookie value and sets `phase: 'initial-load'`; the auto-open effect in `PanelRouter` opens the panel

**Cleanup (on unmount / panel close):**
- Clear cookie `next-instant-navigation-testing` (max-age=0)
- Turn off `cacheOnly` via `ACTION_CACHE_ONLY_TOGGLE`
- Reset panel state via `ACTION_INSTANT_NAV_RESET`
- If phase was `client-nav` or `initial-load`, call `window.location.reload()` to restore dynamic content

**Share button:**
- Uses existing `CopyButton` component from `components/copy-button/index.tsx`
- Builds URL: `${window.location.origin}${toUrl}?__instant_nav=1&from=${fromUrl}` (for client-nav) or `${window.location.origin}${toUrl}?__instant_nav=1` (for initial-load)

**UI for each phase:**
- **Waiting**: Text "Navigate to a page..." + "or" + "Refresh" button + "to capture initial page load"
- **Client Nav**: "Client nav" heading, "From: /path", "To: /path", Share button
- **Initial Page Load**: "Initial Page load" heading, "To: /path", Share button

### 5. New file: `packages/next/src/next-devtools/dev-overlay/components/instant-nav/instant-nav-panel.css`
Styles for the panel content, following existing `.panel-content` patterns from `panel-router.css`.

### 6. `test/development/app-dir/cache-only-toggle/cache-only-toggle.test.ts`
- Update `clickInstantModeMenuItem` helper: selector changes from `[data-cache-only]` to `[data-instant-nav]`
- Update/rewrite tests to work with the new panel flow instead of direct toggle
- Add new tests: panel opens in waiting state, client-nav detection with From/To URLs, refresh flow (initial-load persistence), share button copies correct URL, close behavior clears cookie

## Implementation Order

1. **State foundation**: `context.tsx` (add type) → `shared.ts` (add state + actions + reducer + cookie parsing)
2. **Panel component**: Create `instant-nav-panel.tsx` + `instant-nav-panel.css`
3. **Wire into router**: Update `panel-router.tsx` (menu item + PanelRoute + auto-open effect)
4. **Update tests**: Rewrite existing tests + add new ones for the 3-state flow

## Verification

1. `pnpm --filter=next dev` (watch mode) for fast rebuilds
2. Run existing test: `NEXT_SKIP_ISOLATE=1 NEXT_TEST_MODE=dev pnpm testheadless test/development/app-dir/cache-only-toggle/cache-only-toggle.test.ts`
3. Manual verification in a test app: open devtools → click "Instant Navs" → verify waiting state → navigate → verify client-nav screen with correct URLs → click Share → verify clipboard → close panel → verify cookie cleared
4. Test refresh flow: open panel → click Refresh → verify page reloads and panel auto-opens in "Initial Page Load" state
