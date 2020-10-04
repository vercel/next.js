---
description: Debug your Next.js app.
---

# Debugging

This documentation explains how you can debug your Next.js frontend and backend code with full source maps support using either the [Chrome DevTools](https://developers.google.com/web/tools/chrome-devtools) or the [VSCode debugger](https://code.visualstudio.com/docs/editor/debugging).

It requires you to first launch your Next.js application in debug mode in one terminal and then connect an inspector (Chrome DevTools or VS Code) to it.

There might be more ways to debug a Next.js application since all it requires is to expose the Node.js debugger and start an inspector client. You can find more details in the [Node.js documentation](https://nodejs.org/en/docs/guides/debugging-getting-started/).

## Step 1: Start Next.js in debug mode

Next.js being a Node.js application, all we have to do is to pass down the [`--inspect`](https://nodejs.org/api/cli.html#cli_node_options_options) flag to the underlying Node.js process for it to start in debug mode.

First, start Next.js with the inspect flag:

```bash
NODE_OPTIONS='--inspect' next dev
```

If you're using `npm run dev` or `yarn dev` (See: [Getting Started](/docs/getting-started.md)) then you should update the `dev` script on your `package.json`:

```json
"dev": "NODE_OPTIONS='--inspect' next dev"
```

The result of launching Next.js with the inspect flag looks like this:

```bash
Debugger listening on ws://127.0.0.1:9229/0cf90313-350d-4466-a748-cd60f4e47c95
For help, see: https://nodejs.org/en/docs/inspector
ready - started server on http://localhost:3000
```

> Be aware that using `NODE_OPTIONS='--inspect' npm run dev` or `NODE_OPTIONS='--inspect' yarn dev` won't work. This would try to start multiple debuggers on the same port: one for the npm/yarn process and one for Next.js. You would then get an error like `Starting inspector on 127.0.0.1:9229 failed: address already in use` in your console.

## Step 2: Connect to the debugger

### Using Chrome DevTools

Once you open a new tab in Google Chrome and go to `chrome://inspect`, you should see your Next.js application inside the "Remote Target" section. Now click "inspect" to open a screen that will be your debugging environment from now on.

### Using the Debugger in Visual Studio Code

We will be using the [attach mode](https://code.visualstudio.com/docs/nodejs/nodejs-debugging#_setting-up-an-attach-configuration) of VS Code to attach the VS Code inspector to our running debugger started in step 1.

Create a file named `.vscode/launch.json` at the root of your project with this content:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "attach",
      "name": "Launch Program",
      "skipFiles": ["<node_internals>/**"],
      "port": 9229
    }
  ]
}
```

Now hit <kdb>F5</kbd> or select **Debug: Start Debugging** from the Command Palette and you can start your debugging session.

## Step 3: Put breakpoints and see what happens

Now you can use the [`debugger`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/debugger) statement to pause your backend or frontend code anytime you want to observe and debug your code more precisely.

If you trigger the underlying code by refreshing the current page, clicking on a page link or fetching an API route, your code will be paused and the debugger window will pop up.

To learn more on how to use a JavaScript debugger, take a look at the following documentation:

- [VS Code Node.js debugging: Breakpoints](https://code.visualstudio.com/docs/nodejs/nodejs-debugging#_breakpoints)
- [Get Started with Debugging JavaScript in Chrome DevTools](https://developers.google.com/web/tools/chrome-devtools/javascript)
