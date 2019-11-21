# Routing

Next.js has a file-system based router, every `page` inside the `pages` folder defines a new route. To give you a better idea of how it works take a look into the routes handled by the following pages:

- `pages/index.js` → `/`
- `pages/about.js` → `/about`
- `pages/blog/index.js` → `/blog`
- `pages/blog/first-post.js` → `/blog/first-post`

There's no need to manually define routes, once you add a `page` it just works, we also have support for [Dynamic Routes](/docs/routing/dynamic-routes.md) and [API routes](/docs/api-routes/introduction.md).

> Because of the nature of the router, we don't recommend you to add any file inside `pages` that's not intended to be a `page`, use another folder instead, like `components`, `lib`, e.t.c

## How it works

The router is divided in multiple independent parts, here is a general overview of those:

- [`Link`](/docs/routing/using-link.md): A component that handles client-side navigations, it's basically an anchor tag (`<a>`) with magic powers
- [`userRouter`](/docs/routing/useRouter.md)/[`withRouter`](/docs/routing/withRouter.md): Allow your pages to access the [`router`](/docs/routing/router-object.md) object, which has the context of the route used by a page
- [Router API](/docs/api-reference/router/router.push.md): Aimed for advanced users and imperative needs
