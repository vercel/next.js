# No Sync Scripts

### Why This Error Occurred

A synchronous script was used which can impact your webpage's performance.

### Possible Ways to Fix It

#### Script component (experimental)

Use the Script component with the right loading strategy to defer loading of the script until necessary.

```jsx
import Script from 'next/experimental-script'

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

Note: This is still an experimental feature and needs to be enabled via the `experimental.scriptLoader` flag in `next.config.js`.

### Useful Links

- [Efficiently load third-party JavaScript](https://web.dev/efficiently-load-third-party-javascript/)
