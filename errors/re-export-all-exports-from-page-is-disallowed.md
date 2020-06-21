# Re-exporting all exports from a page is disallowed

#### Why This Error Occurred

This error occurred when use of `export * from '...'` in Next.js pages to prevent errors like this one :

In case we import `fs` and re-exports all, we got the following error :

```js
    Module not found: Can't resolve 'fs' in './pages/example.js'
```

#### Possible Ways to Fix It

Remove `export * from '...'` from Next.js pages.
