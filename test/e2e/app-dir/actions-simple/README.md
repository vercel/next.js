The main purpose of this end-to-end test app is to allow manual testing of
server action source mapping within the React DevTools.

Until we have properly implemented `findSourceMapURL` in Next.js, this demo only
works with Turbopack. This is because we can mock `findSourceMapURL` for the
test app, as Turbopack generates source map files, whereas Webpack uses
`eval-source-map`.

For client bundles, the source map files are served directly through
`/_next/static/chunks`, and for server bundles, the source map files are read
from disk and served through the `/source-maps-turbopack` route handler.

To check the source mapping of server actions, follow these steps:

1. Run `pnpm next dev --turbo test/e2e/app-dir/actions-simple`.
2. Go to [http://localhost:3000]() or [http://localhost:3000/client]().
3. Open the Components panel of the React DevTools.
4. Select the `Form` element.
5. In the props section, right-click on the `action` prop and select "Go to
   definition" (sometimes it needs two tries).
6. You should end up in the Chrome DevTools Sources panel with the `actions.ts`
   file open and the cursor at `foo()`.
