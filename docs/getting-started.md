---
description: Get started with Next.js in the official documentation, and learn more about all our features!
---

# Getting Started

Welcome to the Next.js documentation!

If you're new to Next.js we recommend that you start with the [learn course](https://nextjs.org/learn/basics/getting-started).

The interactive course with quizzes will guide you through everything you need to know to use Next.js.

If you have questions about anything related to Next.js, you're always welcome to ask our community on [GitHub Discussions](https://github.com/vercel/next.js/discussions).

#### System Requirements

- [Node.js 10.13](https://nodejs.org/) or later
- MacOS, Windows (including WSL), and Linux are supported

## Setup

We recommend creating a new Next.js app using `create-next-app`, which sets up everything automatically for you. To create a project, run:

```bash
npx create-next-app
# or
yarn create next-app
```

If you want to start with a TypeScript project you can use the `--typescript` flag:

```bash
npx create-next-app --typescript
# or
yarn create next-app --typescript
```

After the installation is complete, follow the instructions to start the development server. Try editing `pages/index.js` and see the result on your browser.

For more information on how to use `create-next-app`, you can review the [`create-next-app` documentation](/docs/api-reference/create-next-app.md)

## Manual Setup

Install `next`, `react` and `react-dom` in your project:

```bash
npm install next react react-dom
# or
yarn add next react react-dom
```

Open `package.json` and add the following `scripts`:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "next lint"
}
```

These scripts refer to the different stages of developing an application:

- `dev` - Runs [`next dev`](/docs/api-reference/cli.md#development) which starts Next.js in development mode
- `build` - Runs [`next build`](/docs/api-reference/cli.md#build) which builds the application for production usage
- `start` - Runs [`next start`](/docs/api-reference/cli.md#production) which starts a Next.js production server
- `lint` - Runs [`next lint`](/docs/api-reference/cli.md#lint) which sets up Next.js' built-in ESLint configuration

Next.js is built around the concept of [pages](/docs/basic-features/pages.md). A page is a [React Component](https://reactjs.org/docs/components-and-props.html) exported from a `.js`, `.jsx`, `.ts`, or `.tsx` file in the `pages` directory.

Pages are associated with a route based on their file name. For example `pages/about.js` is mapped to `/about`. You can even add dynamic route parameters with the filename.

Create a `pages` directory inside your project.

Populate `./pages/index.js` with the following contents:

```jsx
function HomePage() {
  return <div>Welcome to Next.js!</div>
}

export default HomePage
```

To start developing your application run `npm run dev` or `yarn dev`. This starts the development server on `http://localhost:3000`.

Visit `http://localhost:3000` to view your application.

So far, we get:

- Automatic compilation and bundling (with webpack and babel)
- [React Fast Refresh](https://nextjs.org/blog/next-9-4#fast-refresh)
- [Static generation and server-side rendering](/docs/basic-features/data-fetching.md) of [`./pages/`](/docs/basic-features/pages.md)
- [Static file serving](/docs/basic-features/static-file-serving.md). `./public/` is mapped to `/`

In addition, any Next.js application is ready for production from the start, read more in our [Deployment documentation](/docs/deployment.md).

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

<div class="card">
  <a href="/docs/api-reference/cli.md">
    <b>CLI:</b>
    <small>Learn more about the Next.js CLI.</small>
  </a>
</div>
