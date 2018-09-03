# gh-pages Hello World example

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/segmentio/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example gh-pages gh-pages-app
# or
yarn create next-app --example gh-pages gh-pages-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/master | tar -xz --strip=2 next.js-master/examples/gh-pages
cd gh-pages
```

Install it and run:

```bash
npm install
npm run dev
# or
yarn
yarn dev
```

### Deploy it to github

Edit `env-config.js` and replace `'Next-gh-page-example'` by your project name.

Edit `next.config.js` and replace `'Next-gh-page-example'` by your project name.

1.  Create repository.
2.  Link it to your github account.
3.  Publish your master branch.

```bash
npm run deploy
```

Test it:

Replace `<github-user-name>` and `<github-project-name>`

```bash
https://<github-user-name>.github.io/<github-project-name>/
```

Example:

```bash
https://github.com/thierryc/Next-gh-page-example/

https://thierryc.github.io/Next-gh-page-example/
```

## The idea behind the example

This example shows the most basic idea behind Next. We have 2 pages: `pages/index.js` and `pages/about.js`. The former responds to `/` requests and the latter to `/about`. Using `next/link` you can add hyperlinks between them with universal routing capabilities.
