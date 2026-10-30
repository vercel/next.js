This end-to-end test app covers Server Component and Server Action source mapping
in DevTools.

## Automated tests

Run the tests with both bundlers:

```sh
pnpm test-dev-turbo test/development/app-dir/source-mapping/source-mapping.test.ts
pnpm test-dev-webpack test/development/app-dir/source-mapping/source-mapping.test.ts
```

The Chromium tests use the Chrome DevTools Protocol to resolve replayed warning
frames and the function locations of `Form` action props through their advertised
source maps. They check the original filenames, source positions, and source
content, including every action function form in the fixture. The action props
are captured from committed components through a minimal React DevTools hook.

These checks do not automate the DevTools UI or install the React DevTools
extension. Use the manual steps below to check panel navigation and extension
integration.

## Server Components

To check the source mapping of server components, follow these steps:

1. Run `pnpm next dev test/development/app-dir/source-mapping`.
2. Go to [http://localhost:3000](http://localhost:3000).
3. Open the Console panel of the Chrome DevTools.
4. Look at the component stack of the replayed console warning. It should
   contain the server source filenames.
5. Clicking on any filename for a component stack frame should open the actual
   server sources in the DevTools Sources panel.

## Server Actions

To check the source mapping of server actions, follow these steps:

1. Run `pnpm next dev test/development/app-dir/source-mapping`.
2. Go to [http://localhost:3000](http://localhost:3000) or
   [http://localhost:3000/client](http://localhost:3000/client).
3. Open the Components panel of the React DevTools.
4. Select the `Form` element.
5. In the props section, right-click on the `action` prop and select "Go to
   definition" (sometimes it needs two tries).
6. You should end up in the Chrome DevTools Sources panel at the action's original
   definition in `actions1.ts`, `actions2.ts`, or `actions3.ts`. On `/`, the last
   five forms use actions defined in `page.tsx`, so their definitions should open
   there instead.
