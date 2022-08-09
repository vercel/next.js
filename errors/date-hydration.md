# Render `Date` without hydration mismatch

#### Why This Error Occurred

You are rendering `Date` in one of your components.

Example:

```jsx
export default function Page() {
  return <p>{new Date().toLocaleString()}</p>
}
```

This can lead to hydration mismatches in production. Since the server

#### Possible Ways to Fix It

Consider formatting `Date` in a way that is not dependent on the locale.

You can also set `suppressHydrationWarning={true}` on the element that renders the `Date`, but use this with caution!

```jsx
export default function Page() {
  return <p suppressHydrationWarning={true}>{new Date().toLocaleString()}</p>
}
```

### Useful Links

- [Minifed production error 423 (React)](https://reactjs.org/docs/error-decoder.html/?invariant=423)
- [Minifed production error 425 (React)](https://reactjs.org/docs/error-decoder.html/?invariant=425)
- [`suppressHydrationWarning` documentation](https://reactjs.org/docs/dom-elements.html#suppresshydrationwarning)
