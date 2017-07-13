[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/basic-css)

# Basic CSS example

## How to use

Download the example [or clone the repo](https://github.com/zeit/next.js):

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/master | tar -xz --strip=2 next.js-master/examples/with-workbox
cd with-workbox
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

Next.js works well with [workbox](https://workboxjs.org/) the new Service Worker from google that will help you cache your pages, and content that comes from cdns.
In this example, We are caching the pages and an addition to that, we are also caching images from github, and shows from the TV Maze API. Check the `generate-sw.js` for more info on ow and what we are caching.
