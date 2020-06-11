# Correct sass dependency

#### Why This Error Occurred

You are using both _sass_ and _node-sass_ in your project.

#### Possible Ways to Fix It

Your dependencies should contain only one of both, preferably node-sass.

They should look like this

```js
 "dependencies": {
    "node-sass": "^4.14.1",
  }
```

instead of this

```js
 "dependencies": {
    "node-sass": "^4.14.1",
    "sass": "^1.26.8"
  }
```

### Useful Links

- [Related issue](https://github.com/vercel/next.js/issues/6681)
