# Invalid Custom Route `source`

#### Why This Error Occurred

When defining custom routes, or a middleware `matcher`, a pattern could not be parsed.

This could have been due to trying to use normal `RegExp` syntax like negative lookaheads (`?!exclude`) without following [`path-to-regexp`](https://github.com/pillarjs/path-to-regexp)'s syntax for it.

#### Possible Ways to Fix It

Wrap the `RegExp` part of your `source` as an un-named parameter.

---

Custom routes:

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

---

Middleware:

**Before**

```js
const config = {
  matcher: '/feedback/(?!general)',
}
```

**After**

```js
const config = {
  matcher: '/feedback/((?!general).*)',
}
```

### Useful Links

- [path-to-regexp](https://github.com/pillarjs/path-to-regexp)
- [un-named parameters](https://github.com/pillarjs/path-to-regexp#unnamed-parameters)
