[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/with-configured-babel-target)
# Example using next/babel preset configuring browsers target

Download the example [or clone the repo](https://github.com/zeit/next.js):

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/master | tar -xz --strip=2 next.js-master/examples/with-configured-babel-target
cd with-configured-babel-target
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

This example shows how you can use `next/babel` preset configuring the browsers target versions, allowing to only transform the required minimum ES features.

The example page file will transform the `const` only if you build the files with` next build` but not if your run it with `next`, thats because we are targeting the last Chrome and Node.js versions for development but it's transforming everything (as usual) for production.
