# Using the VS Code Debugger

## Debug configurations

The Next.js monorepo provides configurations in the [`.vscode/launch.json`](../../.vscode/launch.json) file to help you [debug Next.js from VS Code](https://code.visualstudio.com/docs/editor/debugging).

The common configurations are:

- **Launch app**: Run `next dev`, `next build`, or `next start` in a directory of your choice, with an attached debugger.
- **Launch current directory**: Run `next dev`, `next build`, or `next start` in the directory of the currently active file, with an attached debugger.
- **Run e2e test**: Run an e2e test using the currently active file, with an attached debugger.

### Run a specific app

Any Next.js app inside the monorepo can be debugged with these configurations.

1. Use the status bar, or the "Run and Debug" item in the Activity Bar, to select the "Launch app" launch configuration.
2. Enter the app dirname, e.g. `examples/hello-world` or `test/e2e/app-dir/app`.
3. Select the `next` command from the presented options (`dev`, `build`, or `start`).

To see the changes you make to the Next.js codebase during development, you can run `pnpm dev` in the root directory, which will watch for file changes in `packages/next` and recompile the Next.js source code on any file saves.

## Breakpoints

When developing/debugging Next.js, you can set breakpoints anywhere in the `packages/next` source code that will stop the debugger at certain locations so you can examine the behavior. Read more about [breakpoints in the VS Code documentation](https://code.visualstudio.com/docs/nodejs/nodejs-debugging#_breakpoints).

To ensure that the original names are displayed in the "Variables" section, build the Next.js source code with `NEXT_SERVER_NO_MANGLE=1`. This is automatically applied when using `pnpm dev`.
