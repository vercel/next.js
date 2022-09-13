# React Server Components (RFC)

React Server Components allow developers to build applications that span the server and client, combining the rich interactivity of client-side apps with the improved performance of traditional server rendering.

In an upcoming Next.js release, React and Next.js developers will be able to use Server Components inside the `app` directory as part of the changes outlined by the [Layouts RFC](https://nextjs.org/blog/layouts-rfc).

## What are React Server Components?

React Server Components improve the user experience of your application by pairing the best parts of server-rendering with client-side interactivity.

With traditional React applications that are client-side only, developers often had to make tradeoffs between SEO and performance. Server Components enable developers to better leverage their server infrastructure and achieve great performance by default.

For example, large dependencies that previously would impact the JavaScript bundle size on the client can instead stay entirely on the server. By sending less JavaScript to the browser, the time to interactive for the page is decreased, leading to improved [Core Web Vitals](https://vercel.com/blog/core-web-vitals).

## React Server Components vs Server-Side Rendering

[Server-side Rendering](/docs/basic-features/pages.md#server-side-rendering) (SSR) dynamically builds your application into HTML on the server. This creates faster load times for users by offloading work from the user's device to the server, especially those with slower internet connections or older devices. However, developers still pay the cost to download, parse, and hydrate those components after the initial HTML loads.

React Server Components, combined with Next.js server-side rendering, help eliminate the tradeoff of all-or-nothing data fetching. You can progressively show updates as your data comes in.

## Using React Server Components with Next.js

The Next.js team at Vercel released the [Layouts RFC](https://nextjs.org/blog/layouts-rfc) a few months ago outlining the vision for the future of routing, layouts, and data fetching in the framework. These changes **aren't available yet**, but we can start learning about how they will be used.

Pages and Layouts in `app` will be rendered as React Server Components by default. This improves performance by reducing the amount of JavaScript sent to the client for components that are not interactive. Client components will be able to be defined through either a file name extension or through a string literal in the file.

We will be providing more updates about Server Components usage in Next.js soon.
