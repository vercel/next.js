# Webpack Integration

This subtree contains the webpack implementation used when users opt in with
`next dev --webpack` or `next build --webpack`.

Core Next.js code should reach it through `next/dist/webpack/next-integration`
or other `next/dist/webpack/*` paths so webpack support can be removed cleanly
in a future release.
