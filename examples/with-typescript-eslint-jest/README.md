# NextJS Typescript Boilerplate

Bootstrap a developer-friendly NextJS app configured with:

- Typescript support
- Linting with ESLint
- Formatting with Prettier
- Linting, typechecking and formatting on by default using [`husky`](https://github.com/typicode/husky) for commit hooks
- Testing with jest and [`react-testing-library`](https://testing-library.com/docs/react-testing-library/intro)
- Debug task (`yarn dev:debug`) with node auto-attachment

## Deploy your own

Deploy the example using [ZEIT Now](https://zeit.co/now):

[![Deploy with ZEIT Now](https://zeit.co/button)](https://zeit.co/import/project?template=https://github.com/zeit/next.js/tree/canary/examples/with-typescript-eslint-jest)

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-typescript-eslint-jest with-typescript-eslint-jest-app
# or
yarn create next-app --example with-typescript-eslint-jest with-typescript-eslint-jest-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-typescript-eslint-jest
cd with-typescript-eslint-jest
```

Install it and run:

```bash
npm install
npm run dev
# or
yarn
yarn dev
```

Deploy it to the cloud with [ZEIT Now](https://zeit.co/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

### Notes

#### NodeJS Version

This package has an .nvmrc version pinning NodeJS to 12.14.1. Feel free to remove or change it.

#### Bypassing git hooks

This app uses git hooks (via `husky`) on commit and push. You can temporarily bypass them (to ignore a typechecking error, for example) using the `--no-verify` flag, for example `git commit -am 'WIP: show user data on profile page' --no-verify`.

#### IDE Debugger integration (VS Code and other supporting editors)

This project has a special `dev:debug` task which enables certain code editors to attach to the NextJS node process. To accomplish this in VS Code, toggle on the "Debug: Auto Attach" option and run the `yarn dev:debug` task _from the vscode integrated console_. The footer of the editor window will change color, a small panel of debugger (play/pause/step) buttons will appear in the corner and a new debug panel will open in the sidebar. Now when your application hits a breakpoint (server or client) you can debug in your editor window!
