# Unsafe `next/head` Usage

#### Why This Error Occurred

You are using `next/head` in one or more ways that might be unsafe and cause unexpected behavior with
upcoming features of React and Next.js, such as suspense.

#### Possible Ways to Fix It

Ensure your application adheres to the following guidelines.

##### Render `<Head>` once per Page

When using concurrent features like Suspense, the order that different `<Head>` instances render
may differ depending on when they unsuspend. Instead, you should only render `<Head>` once per page.

You can put it anywhere in the tree and use [Context](https://reactjs.org/docs/context.html) to pass down
additional data or options if needed.

##### Only use `<Head>` for non-behavioral tags

You should only use `<Head>` for tags such as `<title>`, or `<meta name="author|description|keywords|og:*|twitter:*" />` that
don't affect browser behavior.

All other tags should be put in a [custom `Document`](https://nextjs.org/docs/advanced-features/custom-document) component instead.

##### Only use native DOM tags in `<Head>`

Next.js does not currently support custom components like `<MyComponent />` on the client. Instead, you should render native
tags like `<meta>` directly as children.
