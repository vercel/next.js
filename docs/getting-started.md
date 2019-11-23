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

<br/><br />

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

<br/>

Next.js is built around the concept of pages. A page is a [React Component](https://reactjs.org/docs/components-and-props.html) exported from a `.js`, `.ts`, or `.tsx` file in the `pages` directory.

Pages are associated with a route based on their file name. For example `pages/about.js` is mapped to `/about`. You can even add dynamic route parameters with the filename.

<br/>

Create a `pages` directory inside your project.

Populate `./pages/index.js` inside your project:

```jsx
function HomePage() {
  return <div>Welcome to Next.js!</div>
}

export default HomePage
```

To start developing your application run `npm run dev`. This starts the development server on `http://localhost:3000`.

Go to `http://localhost:3000` to view your application.

So far, we get:

- Automatic compilation and bundling (with webpack and babel)
- Hot code reloading
- Static rendering and on-demand server rendering of `./pages/`
- [Static file serving](/docs/basic-features/static-file-serving.md). `./public/` is mapped to `/`
