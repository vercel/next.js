
# Hello World example

## How to use

Download the example [or clone the repo](https://github.com/zeit/next.js):

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/master | tar -xz --strip=2 next.js-master/examples/using-preact
cd using-preact
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

This example uses [Preact](https://github.com/developit/preact) instead of React. It's a React like UI framework which fast and small. Here we've customized Next.js to use Preact instead of React.

Here's how we did it:

* Create `.babelrc` file with es2015 and react presets. This allow us to get rid of the hard coded React dependency for core Next.js modules.
* Use `next.config.js` to customize our webpack config to support [preact-compat](https://github.com/developit/preact-compat)
