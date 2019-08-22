# App Container Deprecated

#### Why This Error Occurred

In versions prior to v9.0.4-canary.3 the `Container` component was used in `_app` to handle scrolling to hashes. Now this handling has been moved up the tree so `Container` is no longer needed in `_app`.

You should remove the `Container` component from your `_app` since it a no-op now and will be removed in future versions.

#### Possible Ways to Fix It

Remove the `Container` component from `_app`

**Before**
```jsx
import React from 'react'
import App, { Container } from 'next/app'

class MyApp extends App {
  render() {
    const { Component, pageProps } = this.props
    return (
      <Container>
        <Component {...pageProps} />
      </Container>
    )
  }
}

export default MyApp
```

**After**
```jsx
import React from 'react'
import App from 'next/app'

class MyApp extends App {
  render() {
    const { Component, pageProps } = this.props
    return <Component {...pageProps} />
  }
}

export default MyApp
```