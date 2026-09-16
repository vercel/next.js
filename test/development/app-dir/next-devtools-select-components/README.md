# Select Components

Open Next.js Dev Tools and choose **Select Components**. Click page elements to
add or remove selections. Each element gets a stable number for the lifetime of
the page. The compact picker button or Escape returns control to the page and
keeps the selection available. Right-click the picker button, or focus it and
press Shift+F10, to open selection actions: remove individual components,
**Copy context**, or **Clear selection** to stop sharing them. Escape dismisses
the actions menu and returns focus to the picker button.

The frontend uses the upstream React Grab renderer: its compact toolbar, canvas
highlights, numbered labels, and context menu. Next.js owns hit testing, the
selection store, React Fiber inspection, source mapping, and WebMCP registration.
The renderer's colors, typography, and borders use Next.js Dev Tools styling.
The renderer receives display information and callbacks; it does not inspect
React or generate the context sent to agents.

The dev overlay registers the read-only WebMCP tool
`nextjs_get_selected_components` only while there are selected elements. Its
result includes the page URL and title, component numbers, names, visible text,
DOM locators, React owners, and original file/line/column locations. Source
locations come from React's development Fiber metadata and Next.js source maps;
missing metadata returns `source: null`. Tool calls read the live page, and
disconnected elements are removed. Props, form values, and URL query strings or
fragments are not included.

Current experimental Chrome uses `document.modelContext.registerTool` with an
abort signal for removal. Browsers without WebMCP can still select components
and use **Copy context**. Selections are local to one browser document; an agent
must use the same browser session. Reloading clears the selection.

## Run the demo

From the Next.js repository root, after dependency installation and bootstrap:

```sh
pnpm --filter=next build
node packages/next/dist/bin/next dev \
  test/development/app-dir/next-devtools-select-components \
  --hostname 127.0.0.1 --port 3217
```

## Automated regression tests

```sh
pnpm test-dev-turbo test/development/app-dir/next-devtools-select-components/next-devtools-select-components.test.ts
pnpm test-dev-webpack test/development/app-dir/next-devtools-select-components/next-devtools-select-components.test.ts
```

These tests cover client and Server Component sources, multiple selections,
stable IDs, intercepted clicks, live context, explicit removal, unmounts,
navigation, and the browser fallback. They also check the upstream renderer's
compact toolbar and that its controls do not become selected page elements.
Keyboard checks cover Shift+F10 menu access and focus restoration after Escape.
They model the browser's tool registry.

## Native WebMCP verification

The separate verifier uses real headless Chrome through
[agent-browser](https://github.com/vercel-labs/agent-browser). It checks source
coordinates against the fixture files, selection changes, automatic tool
discovery and removal, and the real React Grab frontend. It writes a screenshot
and JSON evidence. Use agent-browser **0.38.0 or newer**, which reports WebMCP
catalog changes in ordinary browser responses. With this fixture's dev server
running:

```sh
AGENT_BROWSER_BINARY=/path/to/agent-browser \
AGENT_BROWSER_SOCKET_DIR=/tmp/next-select-components-native-e2e \
SELECTION_TEST_URL=http://127.0.0.1:3217 \
SELECTION_TEST_REPORT=/tmp/next-select-components-native-e2e.json \
SELECTION_TEST_SCREENSHOT=/tmp/next-select-components-final.png \
node test/development/app-dir/next-devtools-select-components/verify-webmcp.mjs --leave-open
```

Set the binary path for your installation. Omit `--leave-open` for a
self-contained run that closes its browser. With it, the session named
`selection` retains two selected components for an agent to inspect.

An agent using this session can discover the selection tool from a normal
snapshot, fetch its schema, and read the selected component context. Afterward,
close the same session and socket directory with `agent-browser --session
selection close`.
