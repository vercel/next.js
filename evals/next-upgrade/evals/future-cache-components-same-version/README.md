# Next.js 16 Future storefront

This App Router storefront already runs the target Next.js version. It lists
products, renders product detail routes, and shows an account greeting from the
request's `display-name` cookie. Cookie values must stay isolated between
visitors, and product pages must preserve useful shared layout content while
resolving the requested product.

Keep the existing Next.js version and complete Cache Components adoption without
leaving temporary route opt-outs or Cache Components adoption TODOs. Use
`npm run typecheck`, `npm run build`, and `npm start` to verify the app.
