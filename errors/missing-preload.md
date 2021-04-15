# Missing Preload

### Why This Error Occurred

A Stylesheet that was used to link a CSS file does not have an associated preload tag. This could potentially impact First Paint.

### Possible Ways to Fix It

Include `rel="preload"` to the `<link>` tag to ensure the Stylesheet is fetched as soon as possible.

```tsx
function Home() {
  return (
    <div>
      <link href="..." rel="preload" />
    </div>
  )
}

export default Home
```

### Useful Links

- [Preload critical assets to improve loading speed](https://web.dev/preload-critical-assets/)
