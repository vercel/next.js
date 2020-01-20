---
description: Get started with Next.js in the official documentation, and learn more about all our features!
---

# Getting Started

Welcome to the Next.js documentation!

If you're new to Next.js we recommend that you start with the [learn course](https://nextjs.org/learn/basics/getting-started).

The interactive course with quizzes will guide you through everything you need to know to use Next.js.

#### System Requirements

- [Node.js 10](https://nodejs.org/) or later
- MacOS, Windows (including WSL), and Linux are supported

## Setup

Install `next`, `react` and `react-dom` in your project:

```bash
npm install --save next react react-dom
```

Open `package.json` and add the following `scripts`:

```json
"scripts": {
  "dev": "next",
  "build": "next build",
  "start": "next start"
}
```

These scripts refer to the different stages of developing an application:

- `dev` - Runs `next` which starts Next.js in development mode
- `build` - Runs `next build` which builds the application for production usage
- `start` - Runs `next start` which starts a Next.js production server

Next.js is built around the concept of pages. A page is a [React Component](https://reactjs.org/docs/components-and-props.html) exported from a `.js`, `.ts`, or `.tsx` file in the `pages` directory.

Pages are associated with a route based on their file name. For example `pages/about.js` is mapped to `/about`. You can even add dynamic route parameters with the filename.

Create a `pages` directory inside your project.

Populate `./pages/index.js` with the following contents:

```jsx
function HomePage() {
  return <div>Welcome to Next.js!</div>
}

export default HomePage
```

To start developing your application run `npm run dev`. This starts the development server on `http://localhost:3000`.

Visit `http://localhost:3000` to view your application.

So far, we get:

- Automatic compilation and bundling (with webpack and babel)
- Hot code reloading
- Static generation and server-side rendering of [`./pages/`](/docs/basic-features/pages.md)
- [Static file serving](/docs/basic-features/static-file-serving.md). `./public/` is mapped to `/`

## Related

For more information on what to do next, we recommend the following sections:

<div class="card">
  <a href="/docs/basic-features/pages.md">
    <b>Pages:</b>
    <small>Learn more about what pages are in Next.js.</small>
  </a>
</div>

<div class="card">
  <a href="/docs/basic-features/built-in-css-support.md">
    <b>CSS Support:</b>
    <small>Use the built-in CSS support to add custom styles to your app.</small>
  </a>
</div>
