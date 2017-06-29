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

This example shows the most basic idea of babel replacement from multiple environment. We have 1 env variable: `TEST` which will be replaced in development env and in production env with different babel plugin. In local development, babel reads .env file and replace process.env.* in your nextjs files. In production env (such as heroku), babel reads the ENV and replace process.env.* in your nextjs files. Thus no more needed to commit your secrets anymore.

Of course, please put .env* in your .gitignore when using this example locally.
