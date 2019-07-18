<h1 align="center">Create Next App</h1>

<!-- description -->
<p align="center">
The easiest way to create a <a href="https://facebook.github.io/react">React</a> app with server-side rendering thanks to <a href="https://github.com/zeit/next.js">Next.js</a>
</p>

<!-- badges -->
<p align="center">
  <a href="https://github.com/unicodeveloper/awesome-nextjs"><img alt="Mentioned in Awesome Next JS" src="https://awesome.re/mentioned-badge.svg" /></a>
</p>

<!-- toc -->
<p align="center">
    <em>
      <a href="#getting-started">Getting Started</a>
      · <a href="https://github.com/zeit/next.js/blob/master/lib/templates/default/README.md">Starting from scratch with Create Next App</a>
      · <a href="#starting-from-nextjs-examples">Starting from Next.js Examples</a>
    </em>
</p>

<p align="center">
If you run into any issues or have feedback, please <a href="https://github.com/zeit/next.js/issues/new">file an issue</a>
</p>

## Overview

|     | [npx](https://github.com/zkat/npx) & npm (Node 8.x.x+) | [yarn create](https://yarnpkg.com/en/docs/cli/create) (Yarn 1.0.0+) | manual install (Node 6.x.x+)     |
| --- | ------------------------------------------------------ | ------------------------------------------------------------------- | -------------------------------- |
| 1.  | `npx create-next-app my-app`                           | `yarn create next-app my-app`                                       | `npm install -g create-next-app` |
| 2.  | `cd my-app/`                                           | `cd my-app/`                                                        | `create-next-app my-app`         |
| 3.  | `npm run dev`                                          | `yarn dev`                                                          | `cd my-app/`                     |
| 4.  |                                                        |                                                                     | `npm run dev`                    |

Open [http://localhost:3000](http://localhost:3000) to view your running app.
When you're ready for production, run the `build` then `start` scripts.

<p align='center'>
  <img width="600" alt="Create Next App running in terminal" src="media/init-app.png" />
</p>

<p align='center'>
  <img width="600" alt="Create Next App running in terminal" src="media/dev-tree.png" />
</p>

### Start Coding Now

You **don't** need to install or setup Webpack or Babel.
They come packaged with `next`, so you can just start coding.

After running `create-next-app`, you're good to go!

## Getting Started

### Creating an App

Follow the steps in the [above table](#overview):

Minimum Requirements:

- Node >= `6.x.x` - Use [nvm](https://github.com/creationix/nvm#usage) or [asdf](https://github.com/asdf-vm/asdf#readme) to easily switch Node versions between projects.

**You don't need to use Node as your primary backend**. The Node installation is only required for Create Next App and running the Next.js server in development/production.

### What's in an App

`create-next-app` will have created a directory called `my-app` inside the current folder. Inside that directory, it will generate the initial project structure and install necessary dependencies:

```
.
├── README.md
├── components
│   ├── head.js
│   └── nav.js
├── next.config.js
├── node_modules
│   ├── [...]
├── package.json
├── pages
│   └── index.js
├── static
│   └── favicon.ico
└── yarn.lock
```

Routing in Next.js is based on the file system, so `./pages/index.js` maps to the `/` route and
`./pages/about.js` would map to `/about`.

The `./static` directory maps to `/static` in the `next` server, so you can put all your
other static resources like images or compiled CSS in there.

Out of the box, we get:

- Automatic transpilation and bundling (with webpack and babel)
- Hot code reloading
- Server rendering and indexing of `./pages`
- Static file serving. `./static/` is mapped to `/static/`

Once the installation is finished, you can run some commands in your project:

### `npm run dev` or `yarn dev`

Runs the app in the development mode.<br>
Open [http://localhost:3000](http://localhost:3000) to view it in the browser.

The page will reload if you make edits.<br>
You will also see any errors in the console.

### `npm run build` or `yarn build`

Builds the app for production to the `.next` folder.<br>
It correctly bundles React in production mode and optimizes the build for the best performance.

### `npm run start` or `yarn start`

Starts the application in production mode.
The application should be compiled with \`npm run build\` first.

Now you're ready to code & deploy your app!

## Starting from Next.js Examples

There are a ton of examples in the [Next.js repo](https://github.com/zeit/next.js/tree/master/examples/) (and growing!) that you can use to bootstrap your app.

To use an example:

1.  Go to https://open.segment.com/create-next-app#examples
2.  Search for an example you want and get it's name (looks like `basic-css`)
3.  Run: `create-next-app --example basic-css example-app`
4.  Done 💥

**It is worth noting that the _basic-css_ example above uses [styled-jsx](https://github.com/zeit/styled-jsx).**

## Acknowledgements

We are grateful to the authors of existing related projects for their ideas as inspiration:

- [Create React App](https://github.com/facebookincubator/create-react-app)
- [Next.js](https://github.com/zeit/next.js)
- [@eanplatter](https://github.com/eanplatter)
- [@insin](https://github.com/insin)
- [@mxstbr](https://github.com/mxstbr)

Looking for alternatives? Here are some other project starter kits:

- [Create React App](https://github.com/facebookincubator/create-react-app)
- [insin/nwb](https://github.com/insin/nwb)
- [mozilla-neutrino/neutrino-dev](https://github.com/mozilla-neutrino/neutrino-dev)
- [NYTimes/kyt](https://github.com/NYTimes/kyt)
- [gatsbyjs/gatsby](https://github.com/gatsbyjs/gatsby)
- [enclave](https://github.com/eanplatter/enclave)
- [motion](https://github.com/motion/motion)
- [quik](https://github.com/satya164/quik)
- [sagui](https://github.com/saguijs/sagui)
- [roc](https://github.com/rocjs/roc)
- [aik](https://github.com/d4rkr00t/aik)
- [react-app](https://github.com/kriasoft/react-app)
- [dev-toolkit](https://github.com/stoikerty/dev-toolkit)
- [tarec](https://github.com/geowarin/tarec)
- [sku](https://github.com/seek-oss/sku)

Questions? Feedback? [Please let us know](https://github.com/zeit/next.js/issues/new)

## Maintainers

This repo, `create-next-app`, was previously maintiained by Segment, Inc. It is now maintained by ZEIT, Inc.

## License (MIT)

```
WWWWWW||WWWWWW
 W W W||W W W
      ||
    ( OO )__________
     /  |           \
    /o o|    MIT     \
    \___/||_||__||_|| *
         || ||  || ||
        _||_|| _||_||
       (__|__|(__|__|
```

Copyright (c) 2017-present Segment.io, Inc. friends@segment.com

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the 'Software'), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
