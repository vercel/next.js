# Modern `next/head` Usage

#### Why This Error Occurred

You are using `next/head` in one or more ways which may not behave as expected in React 18 and later.

#### Possible Ways to Fix It

##### Render `<Head>` once per Page

When using concurrent features like Suspense, the order that different `<Head>` instances render
may differ depending on when they unsuspend. Instead, you should only render `<Head>` once per page.

You can put it anywhere in the tree and use [Context](https://reactjs.org/docs/context.html) to pass down
additional data or options if needed.

##### Only use `<Head>` for cosmetic tags

You should only use `<Head>` for _cosmetic_ or _optional_ tags, such as `<title>`, or `<meta name="author|description|keywords|og:*|twitter:*" />`.
All other tags should be put in a [custom `Document`](https://nextjs.org/docs/advanced-features/custom-document) component instead.
