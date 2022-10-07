# Using the VS Code Debugger

## Debug configurations

The Next.js monorepo provides configurations in the [`.vscode/launch.json`](../../.vscode/launch.json) file to help you [debug Next.js from VS Code](https://code.visualstudio.com/docs/editor/debugging).

The common configurations are:

- Launch app development: Run `next dev` with an attached debugger
- Launch app build: Run `next build` with an attached debugger
- Launch app production: Run `next start` with an attached debugger

### Run a specific app

Any Next.js app inside the monorepo can be debugged with these configurations. For example to run "Launch app development" against `examples/hello-world`:

1. Open the [`.vscode/launch.json`](../../.vscode/launch.json) file.
2. Find the configuration "Launch app development".
3. Edit the `runtimeArgs` array's last item to be `"examples/hello-world"`.
4. Save the file.
5. Now you can start the debugger and it will run against the `examples/hello-world` app!

To see the changes you make to the Next.js codebase during development, you can run `pnpm dev` in the root directory, which will watch for file changes in `packages/next` and recompile the Next.js source code on any file saves.

## Breakpoints

When developing/debugging Next.js, you can set breakpoints anywhere in the `packages/next` source code that will stop the debugger at certain locations so you can examine the behavior. Read more about [breakpoints in the VS Code documentation](https://code.visualstudio.com/docs/nodejs/nodejs-debugging#_breakpoints).
