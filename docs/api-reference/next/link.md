---
description: Enable client-side transitions between routes with the built-in Link component.
---

# next/link

<details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="https://github.com/zeit/next.js/tree/canary/examples/hello-world">Hello World</a></li>
  </ul>
</details>

> Before moving forward, we recommend you to read [Routing Introduction](/docs/routing/introduction.md) first.

Client-side transitions between routes can be enabled via the `Link` component exported by `next/link`.

An example of linking to `/` and `/about`:

```jsx
import Link from 'next/link'

function Home() {
  return (
    <ul>
      <li>
        <Link href="/">
          <a>Home</a>
        </Link>
      </li>
      <li>
        <Link href="/about">
          <a>About Us</a>
        </Link>
      </li>
    </ul>
  )
}

export default Home
```

`Link` accepts the following props:

- `href` - The path inside `pages` directory. This is the only required prop
- `as` - The path that will be rendered in the browser URL bar. Used for dynamic routes
- [`passHref`](#forcing-Link-to-expose-href-to-its-child) - Forces `Link` to send the `href` property to its child. Defaults to `false`
- `prefetch` - Prefetch the page in the background. Defaults to `true`
- [`replace`](#replace-the-url-instead-of-push) - Replace the current `history` state instead of adding a new url into the stack. Defaults to `false`
- [`scroll`](#disable-scrolling-to-the-top-of-the-page) - Scroll to the top of the page after a navigation. Defaults to `true`

## Dynamic routes

A `Link` to a dynamic route is a combination of the `href` and `as` props. A link to the page `pages/post/[pid].js` will look like this:

```jsx
<Link href="/post/[pid]" as="/post/abc">
  <a>First Post</a>
</Link>
```

`href` is a file system path used by the page and it shouldn't change at runtime. `as` on the other hand, will be dynamic most of the time according to your needs. Here's an example of how to create a list of links:

```jsx
const pids = ['id1', 'id2', 'id3']
{
  pids.map(pid => (
    <Link href="/post/[pid]" as={`/post/${pid}`}>
      <a>Post {pid}</a>
    </Link>
  ))
}
```

## Example with `React.forwardRef`

If the child component in `Link` is a function component, you'll need to wrap it in [`React.forwardRef`](https://reactjs.org/docs/react-api.html#reactforwardref) like in the following example:

```jsx
import React from 'react'
import Link from 'next/link'

// `onClick`, `href`, and `ref` need to be passed to the DOM element
// for proper handling
const MyButton = React.forwardRef(({ onClick, href }, ref) => {
  return (
    <a href={href} onClick={onClick} ref={ref}>
      Click Me
    </a>
  )
})

function Home() {
  return (
    <Link href="/about">
      <MyButton />
    </Link>
  )
}

export default Home
```

## With URL Object

`Link` can also receive an URL object and it will automatically format it to create the URL string. Here's how to do it:

```jsx
import Link from 'next/link'

function Home() {
  return (
    <div>
      <Link href={{ pathname: '/about', query: { name: 'ZEIT' } }}>
        <a>About us</a>
      </Link>
    </div>
  )
}

export default Home
```

The above example will be a link to `/about?name=Zeit`. You can use every property as defined in the [Node.js URL module documentation](https://nodejs.org/api/url.html#url_url_strings_and_url_objects).

## Replace the URL instead of push

The default behavior of the `Link` component is to `push` a new URL into the `history` stack. You can use the `replace` prop to prevent adding a new entry, as in the following example:

```jsx
<Link href="/about" replace>
  <a>About us</a>
</Link>
```

## Using a component that supports `onClick`

`Link` supports any component that supports the `onClick` event, in the case you don't provide an `<a>` tag, consider the following example:

```jsx
<Link href="/about">
  <img src="/static/image.png" alt="image" />
</Link>
```

The child of `Link` is `<img>` instead of `<a>`. `Link` will send the `onClick` property to `<img>` but won't pass the `href` property.

## Forcing `Link` to expose `href` to its child

If the child is an `<a>` tag and doesn't have a `href` attribute we specify it so that the repetition is not needed by the user. However, sometimes, you’ll want to pass an `<a>` tag inside of a wrapper and `Link` won’t recognize it as a _hyperlink_, and, consequently, won’t transfer its `href` to the child.

In cases like that, you can add the `passHref` property to `Link`, forcing it to expose its `href` property to the child. Take a look at the following example:

```jsx
import Link from 'next/link'
import Unexpected_A from 'third-library'

function NavLink({ href, name }) {
  return (
    <Link href={href} passHref>
      <Unexpected_A>{name}</Unexpected_A>
    </Link>
  )
}

export default NavLink
```

> **Please note**: using a tag other than `<a>` and failing to pass `passHref` may result in links that appear to navigate correctly, but, when being crawled by search engines, will not be recognized as links (owing to the lack of `href` attribute). This may result in negative effects on your sites SEO.

## Disable scrolling to the top of the page

The default behavior of `Link` is to scroll to the top of the page. When there is a hash defined it will scroll to the specific id, just like a normal `<a>` tag. To prevent scrolling to the top / hash `scroll={false}` can be added to `Link`:

```jsx
<Link href="/?counter=10" scroll={false}>
  <a>Disables scrolling to the top</a>
</Link>
```
