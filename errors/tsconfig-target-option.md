# TypeScript's Target Option

#### Why This Warning Occurred

You've changed the `target` option in `tsconfig.json` from the default `es5` to a different value.

NextJS doesn't use TypeScript's `tsc` compiler to build code, so this change will have no effect.
You should not expect to see any changes in your output code after changing this option.

#### Possible Ways to Fix It

If you want to target specific browsers or features, Next.js supports [Browserslist](https://browsersl.ist/)
configuration in your `package.json` file.

So instead of changing TypeScript's `target` option, you should specify a Browserslist configuration
and Next.js will build your code accordingly.

### Useful Links

- [Supported Browsers and Features](https://nextjs.org/docs/basic-features/supported-browsers-features)
