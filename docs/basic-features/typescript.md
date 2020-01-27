---
description: Next.js supports TypeScript by default and has built-in types for pages and the API. You can get started with TypeScript in Next.js here.
---

# TypeScript

<details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="https://github.com/zeit/next.js/tree/canary/examples/with-typescript">TypeScript</a></li>
  </ul>
</details>

Next.js provides an integrated [TypeScript](https://www.typescriptlang.org/) experience out of the box, similar to an IDE.

To get started, create an empty `tsconfig.json` file in the root of your project:

```bash
touch tsconfig.json
```

Next.js will automatically configure this file with default values. Providing your own `tsconfig.json` with custom [compiler options](https://www.typescriptlang.org/docs/handbook/compiler-options.html) is also supported.

> Next.js uses Babel to handle TypeScript, which has some [caveats](https://babeljs.io/docs/en/babel-plugin-transform-typescript#caveats), and some [compiler options are handled differently](https://babeljs.io/docs/en/babel-plugin-transform-typescript#typescript-compiler-options).

Then, run `next` (normally `npm run dev`) and Next.js will guide you through the installation of the required packages to finish the setup:

```bash
npm run dev

# You'll see instructions like these:
#
# Please install typescript, @types/react, and @types/node by running:
#
#         yarn add --dev typescript @types/react @types/node
#
# ...
```

You're now ready to start converting files from `.js` to `.tsx` and leveraging the benefits of TypeScript!.

> A file named `next-env.d.ts` will be created in the root of your project. This file ensures Next.js types are picked up by the TypeScript compiler. **You cannot remove it**, however, you can edit it (but you don't need to).

> Next.js `strict` mode is disabled by default. When you feel comfortable with TypeScript, it's recommended to turn it on in your `tsconfig.json`.

By default, Next.js reports TypeScript errors during development for pages you are actively working on. TypeScript errors for inactive pages **do not** block the development process.

If you want to silence the error reports, refer to the documentation for [Ignoring TypeScript errors](/docs/api-reference/next.config.js/ignoring-typescript-errors.md).

## Pages

For function components the `NextPage` type is exported, here's how to use it:

```jsx
import { NextPage } from 'next'

interface Props {
  userAgent?: string;
}

const Page: NextPage<Props> = ({ userAgent }) => (
  <main>Your user agent: {userAgent}</main>
)

Page.getInitialProps = async ({ req }) => {
  const userAgent = req ? req.headers['user-agent'] : navigator.userAgent
  return { userAgent }
}

export default Page
```

And for `React.Component` you can use `NextPageContext`:

```jsx
import React from 'react'
import { NextPageContext } from 'next'

interface Props {
  userAgent?: string;
}

export default class Page extends React.Component<Props> {
  static async getInitialProps({ req }: NextPageContext) {
    const userAgent = req ? req.headers['user-agent'] : navigator.userAgent
    return { userAgent }
  }

  render() {
    const { userAgent } = this.props
    return <main>Your user agent: {userAgent}</main>
  }
}
```

## API Routes

The following is an example of how to use the built-in types for API routes:

```ts
import { NextApiRequest, NextApiResponse } from 'next'

export default (req: NextApiRequest, res: NextApiResponse) => {
  res.status(200).json({ name: 'John Doe' })
}
```

You can also type the response data:

```ts
import { NextApiRequest, NextApiResponse } from 'next'

type Data = {
  name: string
}

export default (req: NextApiRequest, res: NextApiResponse<Data>) => {
  res.status(200).json({ name: 'John Doe' })
}
```
