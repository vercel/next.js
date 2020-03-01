# Server-Side and Client-Side

When working with Next.js, we tend to write isomorphic code that can be rendered in both Node.js and the browser, to give you a better idea, take a look at the following example:

```jsx
function Page() {
  return <h1>Hello World</h1>
}

export default Page
```

The above example is pretty basic, but it properly demonstrates what an isomorphic `page` looks like. The page can be prerendered with Node.js to static HTML, and it can also be rendered by the browser.

Now, what if the page tries to use a browser-only API?. Like so:

```jsx
function Page() {
  return <h1>Hello World. Your user agent is: {navigator.userAgent}</h1>
}

export default Page
```

[`navigator`](https://developer.mozilla.org/en-US/docs/Web/API/Window/navigator) is only available in the `window` object, therefore Node.js doesn't have access to it, so your page would end up in a server-side error.

To work with code that only works in one side, read the sections below.

> [Dynamic imports](/docs/advanced-features/dynamic-import.md) can also help you handle code that only loads when required.

## Client-side only code

If you need access to APIs that only exist in the browser, like `window`, then `useEffect` is the recommended solution. Take a look at the following example:

```jsx
import { useState, useEffect } from 'react'

function Page() {
  const [userAgent, setUserAgent] = useState()

  useEffect(() => {
    setUserAgent(navigator.userAgent)
  }, [])

  return <h1>Hello World. Your user agent is: {userAgent}</h1>
}

export default Page
```

Everything inside the function passed to `useEffect` will always run after the initial render, meaning it only runs in the browser.

You can achieve the same using [class components](https://reactjs.org/docs/react-component.html), as in the following example:

```jsx
import React from 'react'

class Page extends React.Component {
  componentDidMount() {
    this.setState({ userAgent: navigator.userAgent })
  }
  render() {
    return <h1>Hello World. Your user agent is: {this.state.userAgent}</h1>
  }
}

export default Page
```

`componentDidMount` will only execute in the browser, just like `useEffect`.

> In both cases, `userAgent` will be `undefined` in the first render, and once `useEffect` or `componentDidMount` are executed, it will change to the value of `navigator.userAgent`.

## Server-side only code

Following the `userAgent` example from above, we can make it always available to the page by adding [`getInitialProps`](/docs/api-reference/data-fetching/getInitialProps.md), like so:

```jsx
import { useState, useEffect } from 'react'

function Page({ userAgent }) {
  return <h1>Hello World. Your user agent is: {userAgent}</h1>
}

Page.getInitialProps = ({ req }) => {
  if (typeof window === 'undefined') {
    return { userAgent: req.headers['user-agent'] }
  } else {
    return { userAgent: navigator.userAgent }
  }
}

export default Page
```

The above example uses `req` to get the user agent in the server, and `navigator` if `getInitialProps` is executed in the browser.

> `typeof window` not only allows the page to differentiate between sides, but it also enables webpack's dead code elimination. We replace `typeof window` with a constant using webpack [DefinePlugin](https://webpack.js.org/plugins/define-plugin/).

Only the required code that passes the condition (`typeof window === 'undefined'`) will be included in the build. So the server-side build for the page's `getInitialProps` would look like:

```jsx
Page.getInitialProps = ({ req }) => {
  return { userAgent: req.headers['user-agent'] }
}
```

And the client-side build:

```jsx
Page.getInitialProps = ({ req }) => {
  return { userAgent: navigator.userAgent }
}
```

Thanks to dead code elimination, you could also import modules only for the required side, as in the following example:

```jsx
Page.getInitialProps = async ({ req }) => {
  if (typeof window === 'undefined') {
    const cookie = await import('cookie')
    const cookies = cookie.parse(req.headers.cookie)

    return { userAgent: req.headers['user-agent'], theme: cookies.theme }
  } else {
    const cookies = await import('js-cookie')

    return { userAgent: navigator.userAgent, theme: cookies.get('theme') }
  }
}
```

And same as before, each build will only include the code that passes the condition.
