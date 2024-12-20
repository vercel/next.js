export const HTML = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Minimal Blog</title>
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body>
    <header class="blog-header">
      <h1>Minimal Blog</h1>
    </header>
    <main>
      <article class="blog-post">
        <h2 class="post-title">The Art of CSS</h2>
        <p class="post-content">
          Discovering the latest features in CSS can transform the way we design
          and interact with web content.
        </p>
      </article>
      <article class="blog-post">
        <h2 class="post-title">Exploring Web Design</h2>
        <p class="post-content">
          A journey through the evolution of web design, from static pages to
          dynamic, responsive experiences.
        </p>
      </article>
    </main>
    <footer class="blog-footer">
      <p>&copy; 2023 Minimal Blog</p>
    </footer>
  </body>
</html>`;

export const CSS = `:root {
  --main-bg-color: #f3f4f6;
  --title-color: #262626;
  --text-color: #525252;
  --font-family: "Arial", sans-serif;
}

body {
  margin: 0;
  padding: 0;
  background-color: var(--main-bg-color);
  font-family: var(--font-family);
}

.blog-header,
.blog-footer {
  text-align: center;
  padding: 1rem;
  background-color: var(--title-color);
  color: white;
}

.blog-post {
  container-type: inline-size;
  margin: 1rem;
  padding: 1rem;
  background-color: white;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);

  & .post-title {
    color: var(--title-color);
    margin: 0 0 1rem 0;
    text-wrap: balance;
    font-size: 1em;
  }

  & .post-content {
    color: var(--text-color);
  }
}

@container (min-inline-size: 500px) {
  .blog-post {
    padding: 1.5rem;

    & .post-title {
      font-size: 1.25em;
    }
  }
}`;

export const Tailwind = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Minimal Blog</title>
    <script src="https://cdn.tailwindcss.com"></script>
  </head>
  <body class="bg-gray-100 font-sans">
    <header class="text-center text-3xl font-bold py-8 bg-neutral-800 text-white">
      <h1>Minimal Blog</h1>
    </header>
    <main class="w-full px-4">
      <article class="my-4 p-4 bg-white shadow-md">
        <h2 class="text-neutral-800 mb-4 font-bold">The Art of CSS</h2>
        <p class="text-neutral-600 leading-5">
          Discovering the latest features in CSS can transform the way we design
          and interact with web content.
        </p>
      </article>
      <article class="my-4 p-4 bg-white shadow-md">
        <h2 class="text-neutral-800 mb-4 font-bold">Exploring Web Design</h2>
        <p class="text-neutral-600 leading-5">
          A journey through the evolution of web design, from static pages to
          dynamic, responsive experiences.
        </p>
      </article>
    </main>
    <footer class="text-center py-8 bg-neutral-800 text-white">
      <p>&copy; 2023 Minimal Blog</p>
    </footer>
  </body>
</html>`;

export const stylexIndex = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Minimal Blog</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/index.tsx"></script>
  </body>
</html>
`;

export const stylexViteConfig = `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { stylexPlugin } from "vite-plugin-stylex-dev";

export default defineConfig({
  plugins: [react(), stylexPlugin()],
});
`;

export const stylexTokens = `import * as stylex from "@stylexjs/stylex";

export const tokens = stylex.defineVars({
  bgColor: "#f3f4f6",
  titleColor: "#262626",
  textColor: "#525252",
  fontFamily: 'Arial, sans-serif',
});
`;

export const stylexApp = `import React from "react";
import * as stylex from "@stylexjs/stylex";
import { tokens } from "./tokens.stylex";

const styles = stylex.create({
  body: {
    backgroundColor: tokens.bgColor,
    fontFamily: tokens.fontFamily,
    margin: 0,
    padding: 0,
  },
  header: {
    fontSize: "2rem"
  },
  headerFooter: {
    textAlign: "center",
    padding: "1rem",
    backgroundColor: tokens.titleColor,
    color: "white",
  },
  blogPost: {
    margin: "1rem",
    padding: "1rem",
    backgroundColor: "white",
    boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
  },
  postTitle: {
    color: tokens.titleColor,
    marginBottom: "1rem",
    fontSize: "1em",
    textWrap: "balance"
  },
  postContent: {
    color: tokens.textColor,
  },
});

export default function App() {
  return (
    <body {...stylex.props(styles.body)}>
      <header {...stylex.props(styles.headerFooter)}>
        <h1 {...stylex.props(styles.header)}>Minimal Blog</h1>
      </header>
      <main>
        <article {...stylex.props(styles.blogPost)}>
          <h2 {...stylex.props(styles.postTitle)}>The Art of CSS</h2>
          <p {...stylex.props(styles.postContent)}>
            Discovering the latest features in CSS can transform the way we
            design and interact with web content.
          </p>
        </article>
        <article {...stylex.props(styles.blogPost)}>
          <h2 {...stylex.props(styles.postTitle)}>Exploring Web Design</h2>
          <p {...stylex.props(styles.postContent)}>
            A journey through the evolution of web design, from static pages to
            dynamic, responsive experiences.
          </p>
        </article>
      </main>
      <footer {...stylex.props(styles.headerFooter)}>
        <p>&copy; 2023 Minimal Blog</p>
      </footer>
    </body>
  );
}`;