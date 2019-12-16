# next/head

<details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="https://github.com/zeit/next.js/tree/canary/examples/head-elements">Head Elements</a></li>
    <li><a href="https://github.com/zeit/next.js/tree/canary/examples/layout-component">Layout Component</a></li>
  </ul>
</details>

We expose a built-in component for appending elements to the `head` of the page:

```jsx
import Head from 'next/head'

function IndexPage() {
  return (
    <div>
      <Head>
        <title>My page title</title>
        <meta name="viewport" content="initial-scale=1.0, width=device-width" />
      </Head>
      <p>Hello world!</p>
    </div>
  )
}

export default IndexPage
```

To avoid duplicate tags in your `head` you can use the `key` property, which will make sure the tag is only rendered once, as in the following example:

```jsx
import Head from 'next/head'

function IndexPage() {
  return (
    <div>
      <Head>
        <title>My page title</title>
        <meta
          name="viewport"
          content="initial-scale=1.0, width=device-width"
          key="viewport"
        />
      </Head>
      <Head>
        <meta
          name="viewport"
          content="initial-scale=1.2, width=device-width"
          key="viewport"
        />
      </Head>
      <p>Hello world!</p>
    </div>
  )
}

export default IndexPage
```

In this case only the second `<meta name="viewport" />` is rendered.

> The contents of `head` get cleared upon unmounting the component, so make sure each page completely defines what it needs in `head`, without making assumptions about what other pages added.

> `title` and `meta` elements need to be contained as **direct** children of the `Head` element, or wrapped into maximum one level of `<React.Fragment>`, otherwise the meta tags won't be correctly picked up on client-side navigations.
