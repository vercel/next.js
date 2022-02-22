# TypeScript configuration in read-only environments

#### Why This Error Occurred

Next.js automatically detects if your project is using TypeScript and will try to reconfigure it to give the most optimal output. This is done by updating the `tsconfig.json` and `next-env.d.ts` files. The detection runs for both `next dev` and `next build`. In read-only environments (like CI) Next.js won't be able to apply the suggested changes.

#### Possible Ways to Fix It

You should make sure that the suggested changes are applied before running the `next build` command in a read-only environment. Run

```bash
npm run dev
```

or

```bash
yarn dev
```

in your development environment, and commit and push the changes made to the `tsconfig.json` and `next-env.d.ts` files.

### Useful Links

- [Next.js TypeScript documentation](https://nextjs.org/docs/basic-features/typescript#existing-projects)
