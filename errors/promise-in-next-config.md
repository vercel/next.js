# Promise In Next Config

#### Why This Error Occurred

The webpack function in `next.config.js` returned a promise which is not supported in Next.js. For example, below is not supported:

```js
module.exports = {
  webpack: async function(config) { 
    return config
  }
}
```

#### Possible Ways to Fix It

Look in your `next.config.js` and make sure you aren't using any asynchronous functions. Also check that any plugins you are using aren't either. 
