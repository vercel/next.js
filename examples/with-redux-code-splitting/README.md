
[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/with-redux-code-splitting)

# Redux with code splitting example

## How to use

Download the example [or clone the repo](https://github.com/zeit/next.js):

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/master | tar -xz --strip=2 next.js-master/examples/with-redux-code-splitting
cd with-redux-code-splitting
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

Redux uses single store per application and usually it causes problems for code splitting when you want to load actions and reducers used on the current page only.

This example utilizes [fast-redux](https://github.com/dogada/fast-redux) to split Redux's actions and reducers across pages. In result each page's javascript bundle contains only code that is used on the page. When user navigates to a new page, its actions and reducers are connected to the single shared application store.