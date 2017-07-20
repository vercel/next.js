[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/page-transitions)

# Example app with custom page transitions

## How to use

Download the example [or clone the repo](https://github.com/zeit/next.js):

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/master | tar -xz --strip=2 next.js-master/examples/page-transitions
cd page-transitions
```

Install it and run:

```bash
yarn
yarn dev
```

Deploy it to the cloud with [now](https://zeit.co/now) ([download](https://zeit.co/download))

```bash
now
```

## The idea behind the example

Being able to animate out old content and animate in new content is a fairly standard thing to do these days. We can hijack the route change and do any animations that we want: sliding, cross fading, scaling, et al.
