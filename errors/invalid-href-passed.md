# Invalid href passed to router

#### Why This Error Occurred

Next.js provides a router which can be utilized via a component imported via `next/link`, a wrapper `withRouter(Component)`, and now a hook `useRouter()`.
When using any of these, it is expected they are only used for internal navigation, i.e. navigating between pages in the same Next.js application.

Either you passed a non-internal `href` to a `next/link` component or you called `Router#push` or `Router#replace` with one.

Invalid `href`s include external sites (https://google.com) and `mailto:` links. In the past, usage of these invalid `href`s could have gone unnoticed, but since they can cause unexpected behavior we now show a warning in development for them.

#### Possible Ways to Fix It

Look for any usage of `next/link` or `next/router` that is being passed a non-internal `href` and replace them with either an anchor tag (`<a>`) or `window.location.href = YOUR_HREF`.

### Useful Links

- [Routing section in Documentation](https://nextjs.org/docs/routing/introduction)
