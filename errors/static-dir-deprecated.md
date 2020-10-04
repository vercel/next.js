# Static directory is deprecated

#### Why This Error Occurred

In versions prior to 9.0.6 the `static` directory was used to serve static assets in a Next.js application. This has been deprecated in favor of a `public` directory.

The reason we want to support a `public` directory instead is to not require the `/static` prefix for assets anymore and there is no reason to maintain both paths.

#### Possible Ways to Fix It

You can move your `static` directory inside of the `public` directory and all URLs will remain the same as they were before.

**Before**

```sh
static/
  my-image.jpg
pages/
  index.js
components/
  my-image.js
```

**After**

```sh
public/
  static/
    my-image.jpg
pages/
  index.js
components/
  my-image.js
```

### Useful Links

- [Static file serving docs](https://nextjs.org/docs/basic-features/static-file-serving)
