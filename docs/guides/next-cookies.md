# How to Get and Set Cookies in Next.js

Every time you visit a website, servers send a small piece of information to your web browser called cookies. Each cookie is a `key=value` pair that controls when and where it's used. Cookies can help you:

- Resume your session where you left
- Remember your login credentials, preferences, and other settings

The stored cookie data comes with a unique ID that servers send to the browser. Whenever a cookie is exchanged between your browser and the web server, the server reads this ID and knows what information to serve you. This way, you get a personalized web experience.

## Cookies in Next.js

Cookies in Next.js can be handled both on the client-side and the server-side. In this guide, you'll learn:

- How to set & get cookies with Next.js
- Build a [demo app](https://github.com/MaedahBatool/next-cookies) that'll help you set and get the value of a cookie both on the client-side and server-side

![nextjs-cookies](https://assets.vercel.com/image/upload/dpr_auto,q_auto,f_auto/nextjs/guides/next-cookies/nextjs-cookies.png)

Setting and getting cookies on the client-side with Next.js is exactly the same as you would do with any other web application. However, on the server-side, Next.js helps you one step further to set and get cookies (more on this later).

## Client-side Cookies in Next.js

You set cookies via,

```js
document.cookie = 'name=value'
```

You get cookies via,

```js
document.cookie
```

Reading `document.cookie` shows all the available cookies in the current context, where a semicolon separates each cookie.

The `document.cookie` property takes up different attributes. E.g. `max-age` lets you define when the cookie should expire, `secure` allows cookies to transmit only over a secure protocol such as HTTPS.

You can read more details about the `document.cookie` property on the [MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/API/Document/cookie).

### Set and Get Cookies on the Server-side on the Client-side

Let's build a demo application to set a `theme` cookie to save the `light` or `dark` mode of your website.

![client-side-cookies](https://assets.vercel.com/image/upload/dpr_auto,q_auto,f_auto/nextjs/guides/next-cookies/client-cookies.png)

First create a Next.js page that shows the current value of the cookie`theme` and allows you to change it to `light` or `dark`.

```js
export default function ClientSideCookiePage() {
  return (
    <div>
      <h1>Client-side Cookies in Next.js</h1>
      <div>THEME = {theme} </div>
      <button onClick={() => changeTheme('dark')}>Dark</button>
      <button onClick={() => changeTheme('light')}>Light</button>
    </div>
  )
}
```

You can use two React.js hooks to make this app easier to work with:

- [`useState`](https://reactjs.org/docs/hooks-state.html) hook to save the `theme` cookie value
- [`useEffect`](https://reactjs.org/docs/hooks-effect.html) hook to access the `document`, which is a side-effect

To understand how React hooks work, [check out the React documentation](https://reactjs.org/docs/hooks-intro.html).

Here's the basic structure of our code so far:

```js
import { useEffect, useState } from 'react'

export default function ClientSideCookiePage() {
  const [theme, setTheme] = useState()

  useEffect(() => {
    // Get cookies & find the value of the cookie called `theme`.
    // Set default cookie to `light` if not already set.
    // Store the `theme` color in state.
  })

  // Set theme & cookie to user selected color.
  const changeTheme = (color) => {}

  return (
    <div>
      <h1>Client-side Cookies in Next.js</h1>
      <div>THEME = {theme} </div>
      <button onClick={() => changeTheme('dark')}>Dark</button>
      <button onClick={() => changeTheme('light')}>Light</button>
    </div>
  )
}
```

And here's the complete code where you get the `theme` cookie and allow the user to set it to `light` or `dark` mode.

```js
import { useEffect, useState } from 'react'

export default function ClientSideCookiePage() {
  const [theme, setTheme] = useState()

  useEffect(() => {
    // Get cookies & find the value of the cookie called `theme`.
    const color = document.cookie
      ?.split(';')
      .find((x) => x.trim().startsWith('theme'))
      ?.split('=')[1]

    // Set default cookie to `light` if not already set.
    if (!color) {
      color = 'light'
      document.cookie = `theme=${color}`
    }

    // Store the `theme` color in state.
    setTheme(color)
  })

  // Set theme & cookie to user selected color.
  const changeTheme = (color) => {
    setTheme(color)
    document.cookie = `theme=${color}`
  }

  return (
    <div>
      <h1>Client-side Cookies in Next.js</h1>
      <div>THEME = {theme} </div>
      <button onClick={() => changeTheme('dark')}>Dark</button>
      <button onClick={() => changeTheme('light')}>Light</button>
    </div>
  )
}
```

This code sets `light` mode as the default theme. Then it allows the user to click a button to change that to `dark` mode or back to `light` mode. The state is kept by the `useState` React hook, which updates the UI when the cookie value is changed.

## Server-side cookies with Next.js

Next.js provides you with a `context.req.cookies` JavaScript object containing all the cookies.

If you export an async function called [`getServerSideProps`](/docs/basic-features/data-fetching/get-server-side-props) from a page, Next.js will pre-render this page on each request using the data returned by `getServerSideProps`.

```js
export async function getServerSideProps(context) {
  return {
    props: {}, // will be passed to the page component as props
  }
}
```

The `context` parameter is an object which [apart from other keys](https://nextjs.org/docs/api-reference/data-fetching/get-server-side-props#context-parameter) also contains the request as `req` key. In Next.js, `context.req.cookies` returns a JavaScript object containing the cookies sent by the request.

### Set and Get Cookies on the Server-side

Let's create a page in Next.js with [`getServerSideProps`](https://nextjs.org/docs/basic-features/data-fetching#getserversideprops-server-side-rendering) to set and get the cookies on the server-side.

```js
import { useEffect, useState } from 'react'

export default function ServerSideCookiePage() {
  const [name, setName] = useState()

  useEffect(() => {
    // Get cookies & find the value of the cookie called `name`.
    // Store the value of cookie `name` in state.
  })
  return (
    <main>
      <h1>Server-side Cookies in Next.js</h1>
      <h2>Name = {name}</h2>
    </main>
  )
}

export async function getServerSideProps(context) {
  // Get the cookie `name` value if it exists.
  // If cookie `name` is not set, get value from query string.
  // If no cookie was set before or by user via query string then set it to `Not set`.
  // Set a cookie from the server side.
  return { props: {} }
}
```

Here's what you can do:

- First, get the value of cookie `name` if it exists.
- If no cookie was set before, then get value from query string `name`, which a user can set like this `http://localhost:3000/server?name=Tom`
- Now, set a cookie to the value of the `name` query string.
- If no cookie was set and no query string was set, then set the cookie to a value of `Not set` for the sake of visualizing this as an example.

Here's the complete code for this:

```js
export async function getServerSideProps(context) {
  // Getting a cookie here ↓
  // Get the cookie `name` value if it exists.
  let cookieName = context.req.cookies?.name

  // If cookie `name` is not set, get value from query string.
  if (!cookieName) {
    // Get `name` query string.
    cookieName = context.query?.name
  }

  // If no cookie was set before or by user via query string then set it to `Not set`.
  if (!cookieName) {
    cookieName = 'Not set'
  }

  // Setting the cookie here ↓
  // Set a cookie from the server side.
  context.res.setHeader('Set-Cookie', `name=${cookieName}`)

  return { props: {} }
}
```

![server-side-cookies](https://assets.vercel.com/image/upload/dpr_auto,q_auto,f_auto/nextjs/guides/next-cookies/server-cookies.png)

To set a cookie from the server, you can use the `setHeader()` function using `Set-Cookie`, which is an HTTP response header that sends a cookie from the server to the user agent.

With that, you are ready to `set` and `get` the value of cookies with Next.js both from the client-side and the server-side.

To learn more about Next.js check out the [Learn course](https://nextjs.org/learn/basics/create-nextjs-app).
