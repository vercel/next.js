## Scoped Style with external CSS file
The motivation for this example is using scoped css from external files and in the end generate a compiled `.css` on static to use in the final application.

#### Running That

```
yarn install
yarn start
```

#### Supported Langs
The plugin supports `less`, `scss` and `css` extension. Is possible using another pre-processor creating a function to compile the code. In the example I use `sass` as my css' pre processor

To edit the types you need to go to `.babelrc`


#### Problems
- Next haven't support to auto-reload in files that not be JS and JSX, this is frutasting, so you need to edit something on JS to compile your css :/ 
- Sometimes cache come in and you need to reload with (shift + r) to clear and got the new css file version