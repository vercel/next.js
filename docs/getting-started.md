# Getting Started

Welcome to the Next.js documentation! This is the general feature documentation.

If you're new to Next.js we recommend that you start with the [learn course](https://nextjs.org/learn/basics/getting-started).

The interactive course with quizzes will guide you through everything you need to know to use Next.js.

#### System Requirements

- We recommend using Node.js 10 or later
- Linux, MacOS and Windows (including WSL) are supported

## Setup

Install `next`, `react` and `react-dom` in your project:

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

These scripts refer to the different stages of developing an application:

- `dev` - Runs `next` which starts Next.js in development mode
- `build` - Runs `next build` which builds the Next.js application for production usage
- `start` - Runs `next start` which starts a Next.js production server

After that, create a `pages` directory in your project.

When using Next.js the filesystem drives most of the routing. Every `.js` file becomes a route that gets automatically processed and rendered.

Populate `./pages/index.js` inside your project:

```jsx
function HomePage() {
  return <div>Welcome to Next.js!</div>
}

export default HomePage
```

To start developing your application run `npm run dev`. This starts the development server on `http://localhost:3000`.

> In case port 3000 is already in use Next.js will show you how to use a different port.

Go to `http://localhost:3000` to view your application.

So far, we get:

- Automatic compilation and bundling (with webpack and babel)
- Hot code reloading
- Static rendering and on-demand server rendering of `./pages/`
- Static file serving. `./public/` is mapped to `/` (given you [create a `./public/` directory](/docs/basic-features/static-file-serving.md) inside your project)
