The main purpose of this end-to-end test app is to allow manual testing of
server component and server action source mapping in DevTools.

## Server Components

To check the source mapping of server components, follow these steps:

1. Run `pnpm next dev test/development/app-dir/source-mapping`.
2. Go to [http://localhost:3000]().
3. Open the Console panel of the Chrome DevTools.
4. Look at the component stack of the replayed console warning. It should
   contain the server source filenames.
5. Clicking on any filename for a component stack frame should open the actual
   server sources in the DevTools Sources panel.

## Server Actions

To check the source mapping of server actions, follow these steps:

1. Run `pnpm next dev test/development/app-dir/source-mapping`.
2. Go to [http://localhost:3000]() or [http://localhost:3000/client]().
3. Open the Components panel of the React DevTools.
4. Select the `Form` element.
5. In the props section, right-click on the `action` prop and select "Go to
   definition" (sometimes it needs two tries).
6. You should end up in the Chrome DevTools Sources panel with the `actions.ts`
   file open and the cursor either at `foo()` (for `/`), or `bar()` (for
   `/client`).
