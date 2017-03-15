## Scoped Style with external CSS file
The motivation for this example is using scoped css from external files and in the end generate a compiled static `.css` file to use in production..

#### Running That

```
yarn install
yarn start
```

#### Supported Langs
The plugin supports the `less`, `scss` and `css` file extensions. It is possible to add support for another pre-processor by creating a function to compile the code. In the example we use `sass` as our css pre-processor

To edit the types you need to go to `.babelrc`


#### Attention Points
- Next.js doesn't have support for watching `*.css files. So you will have to edit a Javascript file to re-compile the css. In the future this will be fixed by [#823](https://github.com/zeit/next.js/pull/823).