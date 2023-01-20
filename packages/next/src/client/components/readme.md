# How RSC works in Next.js

## Server

1. Resolving Request (server) (base-server.ts, next-server.ts, next-dev-server.ts)

   1. headers from next.config.js
   1. redirects from next.config.js
   1. Middleware (rewrites, redirects, etc.)
   1. beforeFiles (rewrites) from next.config.js
   1. Filesystem routes (public/, \_next/static/, Pages, etc.)
   1. afterFiles (rewrites) from next.config.js
   1. Dynamic Routes (e.g. /blog/[slug])
   1. fallback (rewrites) from next.config.js

1. Rendering app route (server)

   1. Require file for route
   1. Create component tree
   1. Start server component stream
   1. Pass server component stream to HTML rendering

1. Hydration (client) (app-index.tsx)

   1.

1. Reducer actions (client) (reducer.ts)
   1.
