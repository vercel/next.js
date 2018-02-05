[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/with-tailwindcss)

# Tailwind CSS example

This is an example of how you can include a global stylesheet in a next.js webapp.

## How to use

### Using `create-next-app`

Download [`create-next-app`](https://github.com/segmentio/create-next-app) to bootstrap the example:

```
npm i -g create-next-app
create-next-app --example with-tailwindcss with-tailwindcss-app
```

### Download manually

If you like [create-next-app](https://github.com/segmentio/create-next-app) and/or [yarn](https://yarnpkg.com/en/docs/cli/create) simply run:

```bash
yarn create next-app --example with-tailwindcss my-app
cd my-app
```

*Otherwise:*

Download the example [or clone the repo](https://github.com/zeit/next.js):

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-tailwindcss
cd with-tailwindcss
```

**Running**

To get this example running you just need to

    yarn install .
    yarn dev

Visit [http://localhost:3000](http://localhost:3000) and try to modify `styles/index.css`.

Deploy it to the cloud with [now](https://zeit.co/now) ([download](https://zeit.co/download))

```bash
now
```

### Extras

In the `package.json` you'll see some extra commands.

* `yarn dev:css`
  * used by `yarn dev` generate css bundle and watch css files for changes
  * includes css imported into `index.css`
  * will **not** autoreload browser when css changes
* `yarn build:css`
  * used by `yarn build` to generate css bundle

These can be used manually but using the usual commands will run them anyways.

## The idea behind the example

This setup is a basic starting point for using tailwind css and next. Along with tailwind, this example
also uses some other postcss plugins for imports, autoprefixing, and stripping whitespace/comments. The imports simply
allow for an easy way to split up css files but still get one bundled css file in `static/css/bundle.css`.
Changing stylesheets does not trigger auto-reloads. Setting up auto-reloads was avoided
because the next.js read me does not recommend doing so. Although, that can easily be done with
some webpack loaders. If you are curious about using loaders with next look at this
[example](https://github.com/zeit/next.js/tree/canary/examples/with-global-stylesheet).

This project shows how you can set it up. Have a look at:
* pages/_document.js
* styles/config/postcss.config.js
* styles/config/tailwind.config.js
* styles/index.css
* styles/button.css
