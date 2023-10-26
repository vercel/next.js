# Building

You can build Next.js, including all type definitions and packages, with:

```bash
pnpm build
```

By default, the latest canary of the `next-swc` binaries will be installed and used. If you are actively working on Rust code or you need to test out the most recent Rust code that hasn't been published as a canary yet, you can [install Rust](https://www.rust-lang.org/tools/install) and run `pnpm --filter=@next/swc build-native`.

If you need to clean the project for any reason, use `pnpm clean`.
