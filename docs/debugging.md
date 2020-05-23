---
description: Debug your Next.js app.
---

# Debugging

This documentation explains how you can debug your Next.js frontend and backend code with full source maps support using either the [Chrome DevTools](https://developers.google.com/web/tools/chrome-devtools) or the [VSCode debug panel](https://code.visualstudio.com/docs/editor/debugging).

This documentation requires you to first launch your Next.js application in debugger mode in one terminal and then connect an inspector (Chrome DevTools or VS Code) to it.

There might be more ways to debug Next.js application since all it requires is to expose the Node.js debugger and start an inspector client, you can find more details in the [Node.js documentation](https://nodejs.org/en/docs/guides/debugging-getting-started/).

## Step 1: Start Next.js in debug mode

Next.js being a Node.js application, all we have to do is to pass down the [`--inspect`](https://nodejs.org/api/cli.html#cli_node_options_options) flag to the underlying Node.js process for it to start in debugger mode.

First, start Next.js with the inspect flag:

```bash
NODE_OPTIONS='--inspect' next
```

If you're using `npm run dev` or `yarn run dev` from the [getting started](/docs/getting-started) and `create-next-app` then you could also change your `package.json` this way:

```json
"scripts": {
  "dev": "NODE_OPTIONS='--inspect' next"
}
```

So that in development mode, you're always able to debug your application without having to restart your process.

The result of launching Next.js with the inspect flag looks like this:

```bash
Debugger listening on ws://127.0.0.1:9229/0cf90313-350d-4466-a748-cd60f4e47c95
For help, see: https://nodejs.org/en/docs/inspector
[ wait ]  starting the development server ...
[ info ]  waiting on http://localhost:3000 ...
[ ready ] compiled successfully - ready on http://localhost:3000
```

_Be aware that using `NODE_OPTIONS='--inspect' npm run dev` or `NODE_OPTIONS='--inspect' yarn run dev` won't work. This would try to start multiple debuggers on the same port: one for the npm/yarn process and one for Next.js. You would then get an error like `Starting inspector on 127.0.0.1:9229 failed: address already in use` in your console_.

## Step 2: Connect to the debugger

### Using the Chrome DevTools

Open a new tab in Google Chrome and go to `chrome://inspect`, you should see your Next.js application inside the "Remote Target" section. Now click "inspect" to open a screen that will be your debugging environement from now on.

### Using the Visual Studio Code debug panel

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

Now hit `F5` or go to the VS Code debug panel and click on "Launch program" (it will really just attach VS Code to the running debugger) and you can start your debugging session.

## Step 3: Put breakpoints and see what happens

Now you can use the [`debugger`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/debugger) statement to pause your backend or frontend code anytime you want to observe and debug your code more precisely.

Then if you trigger the underlying code by refreshing the current page, clicking on a page link or fetching an API route then your code will be paused and the debugger window will popup.

To know more on how to use a JavaScript debugger, follow the relevant documentation:

- [VS Code Node.js debugging: Breakpoints](https://code.visualstudio.com/docs/nodejs/nodejs-debugging#_breakpoints)
- [Get Started with Debugging JavaScript in Chrome DevTools](https://developers.google.com/web/tools/chrome-devtools/javascript)
