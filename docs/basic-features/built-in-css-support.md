---
description: Next.js includes styled-jsx by default for isolated and scoped CSS support, but you can also use any other CSS-in-JS solution!. Learn more here.
---

# Built-in CSS Support

<details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="https://github.com/zeit/next.js/tree/canary/examples/basic-css">Basic CSS</a></li>
  </ul>
</details>

We bundle [styled-jsx](https://github.com/zeit/styled-jsx) to provide support for isolated scoped CSS. The aim is to support "shadow CSS" similar to Web Components, which unfortunately [do not support server-rendering and are JS-only](https://github.com/w3c/webcomponents/issues/71).

A component using `styled-jsx` looks like this:

```jsx
function HelloWorld() {
  return (
    <div>
      Hello world
      <p>scoped!</p>
      <style jsx>{`
        p {
          color: blue;
        }
        div {
          background: red;
        }
        @media (max-width: 600px) {
          div {
            background: blue;
          }
        }
      `}</style>
      <style global jsx>{`
        body {
          background: black;
        }
      `}</style>
    </div>
  )
}

export default HelloWorld
```

Please see the [styled-jsx documentation](https://github.com/zeit/styled-jsx) for more examples.

## CSS-in-JS

<details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="https://github.com/zeit/next.js/tree/canary/examples/with-styled-components">Styled components</a></li>
    <li><a href="https://github.com/zeit/next.js/tree/canary/examples/with-styletron">Styletron</a></li>
    <li><a href="https://github.com/zeit/next.js/tree/canary/examples/with-glamor">Glamor</a></li>
    <li><a href="https://github.com/zeit/next.js/tree/canary/examples/with-cxs">Cxs</a></li>
    <li><a href="https://github.com/zeit/next.js/tree/canary/examples/with-aphrodite">Aphrodite</a></li>
    <li><a href="https://github.com/zeit/next.js/tree/canary/examples/with-fela">Fela</a></li>
  </ul>
</details>

It's possible to use any existing CSS-in-JS solution. The simplest one is inline styles:

```jsx
function HiThere() {
  return <p style={{ color: 'red' }}>hi there</p>
}

export default HiThere
```

## CSS Plugins

To support importing `.css`, `.scss`, `.less` or `.styl` files you can use the following modules, which configure sensible defaults for server rendered applications:

- [@zeit/next-css](https://github.com/zeit/next-plugins/tree/master/packages/next-css)
- [@zeit/next-sass](https://github.com/zeit/next-plugins/tree/master/packages/next-sass)
- [@zeit/next-less](https://github.com/zeit/next-plugins/tree/master/packages/next-less)
- [@zeit/next-stylus](https://github.com/zeit/next-plugins/tree/master/packages/next-stylus)
