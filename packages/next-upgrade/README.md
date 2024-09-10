# @next/upgrade

Upgrade Next.js apps to newer or beta versions with one command.

# Build

To build the package locally, go to `packages/next-upgrade` and run:

```bash
pnpm build && pnpm link --global
```

In your Next.js app, add the following to your `package.json`:

```json
"dependencies": {
  "@next/upgrade": "path/to/local/next.js/packages/next-upgrade"
}
```

Finally, run:

```bash
pnpm i
```

Now you can use the package!

```bash
npx @next/upgrade
```
