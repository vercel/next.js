# Next.js

This app shows how you can use extracted stylesheets for maximum performance in production.

Features:

- Hot reloading in development without CSS-in-JS
- 100% Page Speed score and 100% YSlow score (if put behind CDN)
- Critical stylesheets injected per-device (phone, tablet, desktop)
- SCSS and PostCSS with autoprefixing for styling
- Content hashes for all resources for best integration with CDNs
- Properly setup Cache headers for resources
- Auto-bundling images referenced as `url()` in stylesheets
- Auto-bundling of imported and required images
- Inlining small images as Data URI (in both stylesheets and SSR page)
- Properly handling multiple pages and routing between them
- Ability to fallback to dynamic pages
- Importing single icons from Font Awesome
- GZip compression of served pages

## How to use

Download the example [or clone the repo](https://github.com/zeit/next.js):

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/master | tar -xz --strip=2 next.js-master/examples/with-extracted-stylesheet
cd with-extracted-stylesheet
```

To get this example running you just need to

    npm install
    npm run dev

Visit [http://localhost:3000](http://localhost:3000) and try to modify `styles/index.scss` changing color. Your changes should be picked up instantly.

## Deploying as static website

You should get complete webpage in `out` directory after running `npm run build`.

It is recommended to use `node bin/start` as a server though, to get dynamic content as fallback.

## Deploying to now

Deploy it to the cloud with [now](https://zeit.co/now) ([download](https://zeit.co/download)) with:

```bash
now --npm
```

To deploy with critical CSS optimization (takes longer):

```bash
now --docker
```

## Demo

You see this app and test with performance analytics tools under following address:

[https://with-extracted-stylesheet.now.sh/](https://with-extracted-stylesheet.now.sh/)
