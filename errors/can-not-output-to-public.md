# Cannot output to /public

#### Why This Error Occurred

Either you set `distDir` to `public` in your `next.config.js` or during `next export` you tried to export to the `public` directory.

This is not allowed due to `public` being a special folder in Next.js used to serve static assets.

#### Possible Ways to Fix It

Use a different `distDir` or export to a different folder.

### Useful Links

- [Static file serving docs](https://nextjs.org/docs#static-file-serving-eg-images)
