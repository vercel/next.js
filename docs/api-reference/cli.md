---
description: The Next.js CLI allows you to start, build, and export your application. Learn more about it here.
---

# Next.js CLI

The Next.js CLI allows you to start, build, and export your application.

To get a list of the available CLI commands, run the following command inside your project directory:

```bash
npx next -h
```

_([npx](https://medium.com/@maybekatz/introducing-npx-an-npm-package-runner-55f7d4bd282b) comes with npm 5.2+ and higher)_

The output should look like this:

```bash
Usage
  $ next <command>

Available commands
  build, start, export, dev, telemetry

Options
  --version, -v   Version number
  --inspect       Enable the Node.js inspector
  --help, -h      Displays this message

For more information run a command with the --help flag
  $ next build --help
```

You can pass any node arguments to `next` commands:

```bash
NODE_OPTIONS="--throw-deprecation" next
NODE_OPTIONS="-r esm" next
NODE_OPTIONS="--inspect" next
```
