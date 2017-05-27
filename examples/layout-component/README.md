[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/layout-component)

# Layout component example

## How to use

Download the example [or clone the repo](https://github.com/zeit/next.js):

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/master | tar -xz --strip=2 next.js-master/examples/layout-component
cd layout-component
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

This example shows a very common use case when building websites where you need to repeat some sort of layout for all your pages. Our pages are: `home`, `about` and `contact` and they all share the same `<head>` settings, the `<nav>` and the `<footer>`. Further more, the title (and potentially other head elements) can be sent as a prop to the layout component so that it's customizable in all pages.
