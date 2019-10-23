# Tailwind CSS example

This is an example of using [Tailwind CSS](https://tailwindcss.com) in a Next.js project.

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-tailwindcss with-tailwindcss-app
# or
yarn create next-app --example with-tailwindcss with-tailwindcss-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-tailwindcss
cd with-tailwindcss
```

Install it and run:

```bash
npm install
npm run dev
# or
yarn
yarn dev
```

Deploy it to the cloud with [now](https://zeit.co/now) ([download](https://zeit.co/download))

```bash
now
```

## The idea behind the example

This setup is a basic starting point for using [Tailwind CSS](https://tailwindcss.com) with Next.js. This example also includes the following [PostCSS](https://github.com/postcss/postcss) plugins:
- [autoprefixer](https://github.com/postcss/autoprefixer) - Adds vendor prefixes to CSS rules in your stylesheet using values from [Can I Use](https://caniuse.com/)
- [purgecss](https://github.com/FullHuman/purgecss) - Removes unused CSS
- [cssnano](https://cssnano.co/) - Minifies CSS
- [postcss-easy-import](https://github.com/TrySound/postcss-easy-import) - Allows importing one stylesheet into another

## Limitations
### Dynamically generated class strings will be purged
Purgecss takes a very straightforward approach to removing unused CSS. It simply searches an entire file for a string that matches a regular expression. As a result, class strings that are dynamically created in a template using string concatenation will be considered unused and removed from your stylesheet. Tailwind CSS addresses this problem in more detail in [their documentation](https://tailwindcss.com/docs/controlling-file-size#writing-purgeable-html).
