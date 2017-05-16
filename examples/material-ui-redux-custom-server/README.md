[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/material-ui-redux-custom-server)

# Fetching data with Material UI

This example allow you to fetch data from api get news from `techcrunch` using api service: [https://newsapi.org/](https://newsapi.org/). 

In this example, I use:
+ babel config
+ postCSS config
+ webpack config: to add plugins allow develop CSS using SCSS
+ using Redux
+ using Material UI
+ using custom Document
+ custom Routes
+ Data fetching
+ gulp

Basically, Next.JS allow you to use `style-jsx` package to develop CSS, but in the production mode, html is not minified. So that, gulp allow you to bundle final all scss into css.

## How to use

Download the example [or clone the repo](https://github.com/zeit/next.js):

Install it and run:

# development

```bash
npm i nodemon -g
npm install
npm run dev
```

# production

```bash
npm i
npm run production
```


