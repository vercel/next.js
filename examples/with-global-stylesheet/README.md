# Global Stylesheet example

This is an example of how you can include a global stylesheet in a next.js webapp.


## How to use

Download the example [or clone the repo](https://github.com/zeit/next.js):

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/master | tar -xz --strip=2 next.js-master/examples/with-global-stylesheet
cd with-global-stylesheet 
```

To get this example running you just need to

    npm install .
    npm run dev

Visit [http://localhost:300](http://localhost:300) and try to modify `pages/style.scss` changing color. Your changes should be picked up instantly.

Also see it working with plain css here
![example](example.gif)

Deploy it to the cloud with [now](https://zeit.co/now) ([download](https://zeit.co/download))

```bash
now
```


## The idea behind the example

The strategy here is to transpile the stylesheet file to a css-in-js file so that it can be loaded and hot reloaded both on the server and the client. For this purpose i created a babel loader plugin called [babel-loader-wrap-in-js](https://github.com/davibe/babel-plugin-wrap-in-js)

This project shows how you can set it up. Have a look at
- .babelrc
- next.config.js
- pages/style.scss
- pages/index.js


Please, report any issue on enhancement related to this example to its original
github repository https://github.com/davibe/next.js-css-global-style-test