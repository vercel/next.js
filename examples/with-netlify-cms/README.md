# Example app using Netlify CMS

[Netlify CMS](https://www.netlifycms.org/) is an open source content management system for your Git workflow that enables you to provide editors with a friendly UI and intuitive workflows. You can use it with any static site generator to create faster, more flexible web projects. Content is stored in your Git repository alongside your code for easier versioning, multi-channel publishing, and the option to handle content updates directly in Git.

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npm init next-app --example with-netlify-cms with-netlify-cms-app
# or
yarn create next-app --example with-netlify-cms with-netlify-cms-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-netlify-cms
cd with-netlify-cms
```

Install it and run:

```bash
npm install
npm run dev
# or
yarn
yarn dev
```

Deploy it to the cloud with [now](https://zeit.co/now) ([download](https://zeit.co/download))

```bash
now
```

## How it works

Sites take its content from markdown files in `/content`. Two of pages (`home` and `about`) are referencing directly their respective markdown files.

Blog component loads all posts (during build!) and lists them out [How to load multiple md files](https://medium.com/@shawnstern/importing-multiple-markdown-files-into-a-react-component-with-webpack-7548559fce6f)

Posts are separate static sites thanks to dynamically created export map. I took inspiration on how to do it from
[here](https://medium.com/@joranquinten/for-my-own-website-i-used-next-js-725678e65b09)
