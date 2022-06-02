# Invalid Custom Route `source`

#### Why This Error Occurred

When defining custom routes a route was added that causes an error during parsing. This can be due to trying to use normal `RegExp` syntax like negative lookaheads (`?!exclude`) without following `path-to-regexp`'s syntax for it.

#### Possible Ways to Fix It

Wrap the `RegExp` part of your `source` as an un-named parameter.

**Before**

```js
{
  source: '/feedback/(?!general)',
  destination: '/feedback/general'
}
```

**After**

```js
{
  source: '/feedback/((?!general).*)',
  destination: '/feedback/general'
}
```

### Useful Links

- [path-to-regexp](https://github.com/pillarjs/path-to-regexp)
- [un-named parameters](https://github.com/pillarjs/path-to-regexp#unnamed-parameters)
