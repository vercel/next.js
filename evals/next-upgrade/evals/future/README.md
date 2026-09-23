# Next.js 13 Future storefront

This App Router storefront starts on Next.js 13. It lists products, renders
product detail routes, and shows an account greeting from the request's
`display-name` cookie. Cookie values must stay isolated between visitors, and
product pages must preserve useful shared layout content while resolving the
requested product.

Upgrade through Next.js 16, complete and verify Cache Components adoption, then
complete Partial Prefetching adoption. Enable both globally without leaving
temporary route opt-outs or Cache Components adoption TODOs. Keep automatic
prefetching on the existing links. Product navigations should show a useful
shared shell with the Product heading; the requested product details may stream.
Use `npm run typecheck`, `npm run build`, and `npm start`, and verify client
navigation in a browser against the production app.
