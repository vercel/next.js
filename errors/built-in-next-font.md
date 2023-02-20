# Built-in `next/font`

#### Why This Error Occurred

Starting with Next.js 13.2, `next/font` is built-in to Next.js and no longer needs to be installed. The `@next/font` package will be removed in Next.js 14.

#### Possible Ways to Fix It

Run the `built-in-next-font` codemod to automatically uninstall `@next/font` and change `@next/font` imports to `next/font`:

```sh
npx @next/codemod built-in-next-font .
```

### Useful Links

- [Codemods](https://nextjs.org/docs/advanced-features/codemods)
- [Optimizing Fonts](https://nextjs.org/docs/basic-features/font-optimization)
