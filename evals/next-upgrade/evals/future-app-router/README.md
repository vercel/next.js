# Future blog migration

Adapted from `evals/evals/agent-030-app-router-migration-hard`. The blog has a
request-rendered home page, an ISR blog index and dynamic post pages, shared
styles and a theme provider, metadata, custom errors, and Pages API routes.
Data comes from `lib/posts.js` so verification does not depend on an external API.

Complete the Future upgrade while preserving the original URLs and UI. The home
page must continue showing the requesting browser's user agent and a current
server timestamp. Preserve the blog index's 60-second data freshness and the
post pages' 300-second freshness, navigation, metadata, and missing-post behavior.
Transfer the shared header, footer, styles, and provider. Leave `pages/api` files
unchanged and preserve their GET/POST/PUT/DELETE and validation behavior.

Verify a production build, start, and browser navigation. Finish required
adoption, including Cache Components and Partial Prefetching, rather than
stopping at temporary route opt-outs.
