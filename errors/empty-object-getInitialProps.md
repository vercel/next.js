# Empty Object Returned From `getInitialProps`

#### Why This Error Occurred

In one of your page components you added a `getInitialProps` that returned an empty object. This de-optimizes automatic prerendering. If you **meant** to do this and understand the **consequences** you can ignore this message as it is only shown in development.

#### Possible Ways to Fix It

Look for any page's using `getInitialProps` that return an empty object `{}`. You might also need to update higher order components (HOCs) to only add `getInitialProps` if they are present on the passed component.

### Useful Links

- [Automatic Prerendering Documentation](https://nextjs.org/docs/#automatic-prerendering)
