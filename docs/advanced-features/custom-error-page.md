---
description: Override and extend the built-in Error page to handle custom errors.
---

# Custom Error Page

**404** or **500** errors are handled both client-side and server-side by the `Error` component. If you wish to override it, define the file `pages/_error.js` and add the following code:

```jsx
function Error({ statusCode }) {
  return (
    <p>
      {statusCode
        ? `An error ${statusCode} occurred on server`
        : 'An error occurred on client'}
    </p>
  )
}

Error.getInitialProps = ({ res, err }) => {
  const statusCode = res ? res.statusCode : err ? err.statusCode : 404
  return { statusCode }
}

export default Error
```

> `pages/_error.js` is only used in production for non-404 errors. In development you'll get an error with the call stack to know where the error originated from.

## Reusing the built-in error page

If you want to render the built-in error page you can by importing the `Error` component:

```jsx
import Error from 'next/error'
import fetch from 'isomorphic-unfetch'

const Page = ({ errorCode, stars }) => {
  if (errorCode) {
    return <Error statusCode={errorCode} />
  }

  return <div>Next stars: {stars}</div>
}

Page.getInitialProps = async () => {
  const res = await fetch('https://api.github.com/repos/zeit/next.js')
  const errorCode = res.statusCode > 200 ? res.statusCode : false
  const json = await res.json()

  return { errorCode, stars: json.stargazers_count }
}

export default Page
```

The `Error` component also takes `title` as a property if you want to pass in a text message along with a `statusCode`.

## Default Static 404 Page

When you don't need to create a custom `_error` page and would prefer to use the default Next.js provided one, we will automatically apply the static optimization to this file during a production build and use it when deploying on [Now](https://zeit.co) or with `next start`.

## Static `pages/404`

For the cases where you do want a custom `_error` page but still want the benefits of a static 404 page we have added a convention of a `pages/404` file that takes priority over `_error` for 404s specifically. This 404 page is specifically meant for creating a static 404 page and strictly does not allow `getInitialProps` or `getServerSideProps` to be used.

In the case where you want to use the default 404 page provided by Next.js but still need a custom `_error` page to report any errors, you can achieve this with:

```jsx
// pages/404.js
import Error from 'next/error'
export default () => <Error statusCode={404} />
```

If you have a custom `_app` with `getInitialProps`, the automatic static optimization will not be able to be applied since you are defining a global data dependency. A `pages/404` file can still be added in this case even though the optimization will not be applied.

A 404 page can end up being visited very often, this means rendering the `_error` page every time it is visited which increases the load on your server or increases the invocations for serverless functions. This additional load on your infrastructure is not ideal as it costs more and is a slower experience. Using the two above strategies to ensure the 404 page is static allows you to achieve the above benefits and have a more optimal 404 page.
