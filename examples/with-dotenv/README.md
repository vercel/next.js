[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/with-dotenv)

# With Dotenv example

## How to use

### Using `create-next-app`

Download [`create-next-app`](https://github.com/segmentio/create-next-app) to bootstrap the example:

```
npm i -g create-next-app
create-next-app --example with-dotenv with-dotenv-app
```

### Download manually

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

This example shows the most basic idea of babel replacement from multiple environment. We have 1 env variable: `TEST` which will be replaced in development env and in production env with different babel plugin. In local development, babel reads .env file and replace process.env.* in your nextjs files. In production env (such as heroku), babel reads the ENV and replace process.env.* in your nextjs files. Thus no more needed to commit your secrets anymore.

Of course, please put .env* in your .gitignore when using this example locally.

## Troubleshooting

### Environment variables not showing on the page

If for some reason the variable is not displayed on the page, try clearing the `babel-loader` cache:

```
rm -rf ./node_modules/.cache/babel-loader
```
