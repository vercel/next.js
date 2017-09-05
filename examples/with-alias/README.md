[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/with-alias)

# Example app with alias

## How to use

Download the example [or clone the repo](https://github.com/zeit/next.js):

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/master | tar -xz --strip=2 next.js-master/examples/with-alias
cd with-alias
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

This example shows how to configure custom aliases within your next.js project
using
[`babel-plugin-module-resolver`](https://github.com/tleunen/babel-plugin-module-resolver).

In the `.babelrc`, we've configured `babel-plugin-module-resolver` to alias `@`
as the project root `./`, which allows us to import our components within a file
at any directory level without us having to traverse up for example:

```javascript
import Heading from '@/components/Heading';

// instead of
// import Heading from '../../components/Heading';
```

Another way we can configure `module-resolver` is by setting `"root": ["./"]`,
this will get rid of the `@` prefix and allow us to import `components` directly.

```javascript
import Heading from 'components/Heading';
```

Now we won't need to calculate how many levels of directory we have to go up before accessing the file!
