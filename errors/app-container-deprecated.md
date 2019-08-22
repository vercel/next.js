# App Container Deprecated

#### Why This Error Occurred

In versions prior to v9.0.4 the `<Container>` component was used in `./pages/_app.js` to handle scrolling to hashes.
This handling has been moved up the tree so the `<Container>` component is no longer needed in your custom `<App>`!

#### Possible Ways to Fix It

Remove the `<Container>` component from your Custom `<App>` (`./pages/_app.js`).

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
