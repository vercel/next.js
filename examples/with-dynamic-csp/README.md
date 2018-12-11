[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/with-dynamic-csp)

# Strict CSP example

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/segmentio/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-dynamic-csp with-dynamic-csp-app
# or
yarn create next-app --example with-dynamic-csp with-dynamic-csp-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-dynamic-csp
cd with-dynamic-csp
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

**If** you are having difficulty setting up a *standard* Content Security Policy, then you might need to use a [dynamic policy](https://csp.withgoogle.com/docs/strict-csp.html). This is less secure than effective whitelisting, but if your project cannot employ effective whitelisting, this can be a secure alternative. For it to work, we need to generate a nonce on every request, so this is limited to server rendered projects.

Next.js supports generating nonces for our CSP out of the box.

Note that when using `style-src 'nonce-{style-nonce}' 'unsafe-inline';` the nonce is automatically applied to your `styled-jsx` styles when using `<style jsx>`. This is the most secure way of using `styled-jsx`. Next.js adds a meta tag to support [Material UI's CSS in JSS](https://material-ui.com/css-in-js/advanced/#content-security-policy-csp) or when using [JSS](https://github.com/cssinjs/jss/blob/master/docs/csp.md) as well.
