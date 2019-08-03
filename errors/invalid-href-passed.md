# Invalid href passed to router

#### Why This Error Occurred

Next.js provides a router which can be utilized via a component exposed at `next/link`, a wrapper `withRouter(Component)`, and now a hook `useRouter(Component)`. When using any of these, it is expected they are only used for internal navigation i.e. navigating between pages in the same Next.js application.

Either you passed a non-internal `href` to a `next/link` component or you called `router.push` or `router.replace` with one.

Invalid `href`s include external sites (https://google.com) and `mailto:` links. In the past, usage of these invalid `href`s could have gone un-noticed but since they can cause unexpected behavior we now show a warning in development for them.

#### Possible Ways to Fix It

Look for any usage of `next/link` or `next/router` that is being passed a non-internal `href` and replace them with either `window.location.href = YOUR_HREF` or an anchor tag `<a>`.

### Useful Links

- [Routing section of readme](https://github.com/zeit/next.js/blob/canary/readme.md#routing)
