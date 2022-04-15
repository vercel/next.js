# `prefetch={true}` is deprecated

#### Why This Error Occurred

See https://nextjs.org/blog/next-9#prefetching-in-viewport-links

<Link> will automatically prefetch pages in the background as they appear in the view. If certain pages are rarely visited you can manually set prefetch to false, here's how:

Next.js 9 will automatically prefetch <Link> components as they appear in-viewport.

This feature improves the responsiveness of your application by making navigations to new pages quicker.

Next.js uses an Intersection Observer to prefetch the assets necessary in the background.

These requests have low-priority and yield to fetch() or XHR requests. Next.js will avoid automatically prefetching if the user has data-saver enabled.

#### Possible Ways to Fix It

The prefetch attribute is no longer needed, when set to true, example: `prefetch={true}`, remove the property.

Prefetching can be turned off with `prefetch={false}`.
