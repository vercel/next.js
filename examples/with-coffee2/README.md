[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/with-coffee2)

# CoffeeScript 2 Next.js example

Inspired by [with-typescript](https://github.com/zeit/next.js/tree/master/examples/with-typescript), this is a very simple project that shows the usage of Next.js with CoffeeScript 2.0.0 that came out recently, with supports to many ES2015 facilities but most importantly, the JSX.

## Getting started
 
Download the example [or clone the repo](https://github.com/zeit/next.js):
 
```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/master | tar -xz --strip=2 next.js-master/examples/with-coffee2
cd with-coffee2
```
then you shold
```bash
npm install # Install required dependencies
or
yarn # Install required dependencies faster

npm run dev # Start CoffeeScript watcher and launch next.js development server simultaneously
or
yarn run dev # Same effect with `npm run dev` but faster
```

Output generated JS files should be compilant to ES2015+ and are aside related CS files (e.g. index.js -> index.coffee)

## Limitations & Problems

1. No SourceMap support to CS source
    * This is because webpack does not bundle the required CS source in the bundling process
2. Scrambled files with CS and generated JS sources  
    * Urgh, I don't want to see my .js and .coffee files grouping up together
3. Inconsistent file watch state
    * There are two distinctive and independent process that looks up for file changes, namely the CS compiler watcher (for *.coffee -> *.js) and Next.js watcher (for *.js)
    * They will probably clash and usually getting up into a confusing state 
    * This is especially severe when you are working with a companion, buddies, that he/she/they may have to overwrite your files

---
Next.js is a minimalistic framework for server-rendered React applications.

**Visit https://learnnextjs.com to get started with Next.js.**
