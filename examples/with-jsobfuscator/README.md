[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/with-jsobfuscator)

# JSObfuscator Next.js example

A minimal example (well, trimmed to the bare bones) that demonstrates how to obfuscate your production code to prevent source drilling from hackers.

## Getting started
 
Download the example [or clone the repo](https://github.com/zeit/next.js):
 
```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/master | tar -xz --strip=2 next.js-master/examples/with-jsobfuscator
cd with-jsobfuscator
```
then you shold
```bash
npm install # Install required dependencies
 or
yarn # Install required dependencies faster

npm run build # Build your .next production distro
npm run start # launch next.js production server
```

## Ideas/Motivations behind the example

You don't want to see nobody your website, you don't. 

And even though, 90% of the time the uglified JS, to some extent, is still humanly-readable, you just need some reconstruction...

And you don't want to see nobody XSS'ing your site by digging through your website source code right?

Well, with a simple obfuscator then the problem is gone! Your precious hackers will have to scratch head on the skewed source code and we could probably shoo them away!

## Limitations & Problems

1. Bundle pages are not be able to obfuscate   
    * See https://github.com/zeit/next.js/blob/master/server/build/plugins/pages-plugin.js#L34
    * I have made a makeshift plugin to emulate the exact same behavior of this
        * And after this PagePlugin was able to transpile we do our obfuscator as well.
        * See `next.config.js` -> NextJSBundleObfuscatorPlugin

2. The output file is very big
    * This makes it troublesome for mobile visitors
    * And this may also be troublesome for in-page traversal/prefetching

---
Next.js is a minimalistic framework for server-rendered React applications.

**Visit https://learnnextjs.com to get started with Next.js.**

javascript-obfuscator is a powerful obfuscator for JavaScript and Node.js

**Visit https://github.com/javascript-obfuscator/javascript-obfuscator to see more**