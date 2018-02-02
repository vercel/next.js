[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/with-external-scoped-css)
## Scoped Style with external CSS file
The motivation for this example is using scoped css from external files and in the end generate a compiled static `.css` file to use in production..

#### Running That

```
yarn install
yarn start
```

#### Supported Langs
The plugin supports the `less`, `scss` and `css` file extensions. It is possible to add support for another pre-processor by creating a function to compile the code. In the example we use `sass` as our css pre-processor

You need to edit the `.babelrc` and sometimes the `pre-processor.js` to work with another languages, if you want to use SCSS the solution and explanation (fit with other css-pre-processors) are in this issue <3 [#3053](https://github.com/zeit/next.js/issues/3053)

#### Attention Points
- Next.js doesn't have support for watching `*.css files. So you will have to edit a Javascript file to re-compile the css. In the future this will be fixed by [#823](https://github.com/zeit/next.js/pull/823).