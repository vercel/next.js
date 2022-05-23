# No Script Tags In Head Component

### Why This Error Occurred

A `<script>` tag was added using the `next/head` component.

We don't recommend this pattern because it will potentially break when used with Suspense and/or streaming. In these contexts, `next/head` tags aren't:

- guaranteed to be included in the initial SSR response, so loading could be delayed until client-side rendering, regressing performance.

- loaded in any particular order. The order that the app's Suspense boundaries resolve will determine the loading order of your scripts.

### Possible Ways to Fix It

#### Script component

Use the Script component with the right loading strategy to defer loading of the script until necessary. You can see the possible strategies [here](https://nextjs.org/docs/basic-features/script/.)

```jsx
import Script from 'next/script'

const Home = () => {
  return (
    <div class="container">
      <Script src="https://third-party-script.js"></Script>
      <div>Home Page</div>
    </div>
  )
}

export default Home
```

### Useful Links

- [Script component docs](https://nextjs.org/docs/basic-features/script/)
