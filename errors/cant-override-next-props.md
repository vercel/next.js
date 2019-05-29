# Can't Override Next Props

#### Why This Error Occurred

In your `pages/_app.js` you returned an object from `getInitialProps` that contained a `router` or `Component` value. These property names are used by Next.js and can not be overwritten.

#### Possible Ways to Fix It

Look in your \_app.js component's `getInitialProps` function and make sure neither of these property names are present in the object returned.

### Useful Links

- [The issue this was reported in: #6480](https://github.com/zeit/next.js/issues/6480)
