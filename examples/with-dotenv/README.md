[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/with-dotenv)

# With Dotenv example

## How to use

Download the example [or clone the repo](https://github.com/zeit/next.js):

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/master | tar -xz --strip=2 next.js-master/examples/with-dotenv
cd with-dotenv
```

Install it and run:

```bash
npm install
npm run dev
```

Deploy it to the cloud with [now](https://zeit.co/now) ([download](https://zeit.co/download))

```bash
now
```

## The idea behind the example

This example shows how to use .env files to specify environment variables. It handles both variables already in the environment and variables defined in a `.env` file.

This example showcases using a `.env.production` file for environment configuration, but it can use the same file – and/or simple environment variables.

Instead of overriding `process.env.*`, it provides a fake `@env` module which you can load the environment variables from.

This is of course [all configurable](https://github.com/tusbar/babel-plugin-dotenv-import).

Of course, please put .env* in your .gitignore when using this example locally.
