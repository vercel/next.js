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
  build, start, export, dev, lint, telemetry

Options
  --version, -v   Version number
  --help, -h      Displays this message

For more information run a command with the --help flag
  $ next build --help
```

You can pass any [node arguments](https://nodejs.org/api/cli.html#cli_node_options_options) to `next` commands:

```bash
NODE_OPTIONS='--throw-deprecation' next
NODE_OPTIONS='-r esm' next
NODE_OPTIONS='--inspect' next
```

## Build

`next build` creates an optimized production build of your application. The output displays information about each route.

- **Size** – The number of assets downloaded when navigating to the page client-side. The size for each route only includes its dependencies.
- **First Load JS** – The number of assets downloaded when visiting the page from the server. The amount of JS shared by all is shown as a separate metric.

The first load is colored green, yellow, or red. Aim for green for performant applications.

You can enable production profiling for React with the `--profile` flag in `next build`. This requires [Next.js 9.5](https://nextjs.org/blog/next-9-5):

```bash
next build --profile
```

After that, you can use the profiler in the same way as you would in development.

You can enable more verbose build output with the `--debug` flag in `next build`. This requires Next.js 9.5.3:

```bash
next build --debug
```

With this flag enabled additional build output like rewrites, redirects, and headers will be shown.

## Development

`next dev` starts the application in development mode with hot-code reloading, error reporting, and more:

The application will start at `http://localhost:3000` by default. The default port can be changed with `-p`, like so:

```bash
npx next dev -p 4000
```

## Production

`next start` starts the application in production mode. The application should be compiled with [`next build`](#build) first.

The application will start at `http://localhost:3000` by default. The default port can be changed with `-p`, like so:

```bash
npx next start -p 4000
```

## Lint

`next lint` runs ESLint for all files in the `pages` directory and provides a guided setup to install any required dependencies if ESLint is not already configured in your application.

You can also run ESLint on other directories with the `--dir` flag:

```bash
next lint --dir components
```

## Telemetry

Next.js collects **completely anonymous** telemetry data about general usage.
Participation in this anonymous program is optional, and you may opt-out if you'd not like to share any information.

To learn more about Telemetry, [please read this document](https://nextjs.org/telemetry/).
