# Introduction

Next.js has a file-system based router, every `page` inside the `pages` folder defines a new route. To give you a better idea of how it works take a look into the routes handled by the following pages:

- `pages/index.js` → `/`
- `pages/about.js` → `/about`
- `pages/blog/index.js` → `/blog`
- `pages/blog/first-post.js` → `/blog/first-post`

There's no need to manually define routes, once you add a `page` it just works, we also have support for [Dynamic Routes](https://www.notion.so/zeithq/Dynamic-Routes-6b992822e021418c9125ad60cffe3b62) and [API routes](https://www.notion.so/zeithq/API-Routes-6e853f09008a45be9287c21e4ecabc9a).

> Because of the nature of the router, we don't recommend you to add any file inside `pages` that's not intended to be a `page`, use another folder instead, like `components`, `lib`, e.t.c

## How it works

The router is divided in multiple independent parts, here is a general overview of those:

- [`<Link>`](https://www.notion.so/zeithq/Using-Link-9656279e431e4497a25db38c75e31126): A component that handles client-side navigations, it's basically an anchor tag (`<a>`) with magic powers
- [`userRouter`](https://www.notion.so/zeithq/useRouter-9366b2aaca924f3db8bed5a43aa887ad)/[`withRouter`](https://www.notion.so/zeithq/withRouter-ebcdae351eae4b8f84db2f2a26d0e505): Allow your pages to access the [`router`](https://www.notion.so/zeithq/Router-Object-580270ec245444ed9253c529b1db0315) object, which has the context of the route used by a page
- [Router API](https://www.notion.so/zeithq/Router-push-769f057793c549e3a7190c7f1896c602): Aimed for advanced users and imperative needs
