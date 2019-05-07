# Example with sitemap.xml and robots.txt using Express server

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/segmentio/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-sitemap-and-robots-express-server with-sitemap-and-robots-express-server-app
# or
yarn create next-app --example with-sitemap-and-robots-express-server with-sitemap-and-robots-express-server-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-sitemap-and-robots-expres-server
cd with-sitemap-and-robots-express-server
```

Install it and run:

```bash
npm install
npm run start
# or
yarn
yarn start
```

Deploy it to the cloud with [now](https://zeit.co/now) ([download](https://zeit.co/download))

```bash
now
```

## The idea behind the example

This example app shows you how to set up sitemap.xml and robots.txt files for proper indexing by search engine bots.

The app is deployed at: https://sitemap-robots.now.sh. Open the page and click the links to see sitemap.xml and robots.txt. Here is a snapshot of these files, with sitemap.xml on the left and robots.txt on the right:
![sitemap-robots](https://user-images.githubusercontent.com/26158226/38786210-4d0c3f70-40db-11e8-8e44-b2c90cfd1b74.png)

Notes:

- routes `/a` and `/b` are added to sitemap manually
- routes that start with `/posts` are added automatically to sitemap; the current example creates an array of posts (see `server/posts.js`), but in a production-level web app, you would want to update `sitemap.xml` dynamically by getting posts from a database:
  - see [this app](https://github.com/builderbook/builderbook/blob/5f33772b8896d646cff89493853f34e61de6179a/server/sitemap.js#L11) in which posts are fetched from a database

When you start this example locally:

- your app with run at https://localhost:8000
- sitemap.xml will be located at http://localhost:8000/sitemap.xml
- robots.txt will be located at http://localhost:8000/robots.txt

In case you want to deploy this example, replace the URL in the following locations with your own domain:

- `hostname` in `server/sitemap.js`
- `ROOT_URL` in `server/app.js`
- `Sitemap` at the bottom of `robots.txt`
- `alias` in `now.json`

Deploy with `now` or with `yarn now` if you specified `alias` in `now.json`
