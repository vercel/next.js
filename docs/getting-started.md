# Getting Started

Welcome to the Next.js documentation! This is the general feature documentation. If you're new to Next.js we recommend that you start with the [learn course](https://nextjs.org/learn/basics/getting-started) that will guide you through an interactive tutorial with quizzes to validate your knowledge.

## Quick Start

```bash
npx create-next-app
```

_([npx](https://medium.com/@maybekatz/introducing-npx-an-npm-package-runner-55f7d4bd282b) comes with npm 5.2+ and higher, see [instructions for older npm versions](https://gist.github.com/timer/833d9946fa8a05ba855729d05a38ac23))_

## Manual Setup

Install Next.js and peer dependencies in your project:

```bash
npm install --save next react react-dom
```

Now open `package.json` and add the following `scripts`:

```json
"scripts": {
  "dev": "next",
  "build": "next build",
  "start": "next start"
}
```

After that, the file-system is the main API. Every `.js` file becomes a route that gets automatically processed and rendered.

Populate `./pages/index.js` inside your project:

```jsx
function Home() {
  return <div>Welcome to Next.js!</div>
}

export default Home
```

Then run `npm run dev`:

```bash
npm run dev
# To use another port
npm run dev -- -p <your port here>
```

Now go to `http://localhost:3000` and see your application running.

So far, we get:

- Automatic transpilation and bundling (with webpack and babel)
- Hot code reloading
- Server rendering and indexing of `./pages/`
- Static file serving. `./public/` is mapped to `/` (given you [create a `./public/` directory](/docs/basic-features/static-file-serving.md) inside your project)
