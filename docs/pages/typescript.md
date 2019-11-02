# TypeScript

For function components `NextPage` type is exported, here's how to use it:

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
