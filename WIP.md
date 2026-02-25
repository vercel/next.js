➜ yokohama git:(mischnic/turbopack-static-info) ✗ pnpm next build test/e2e/app-dir/app-middleware-proxy/

> Build error occurred
> Error: Static info mismatch for /Users/niklas/conductor/workspaces/next.js/yokohama/test/e2e/app-dir/app-middleware-proxy/proxy.js: {
> "baseline": {

    "middleware": {
      "matchers": [
        {
          "regexp": "^(?:\\/(_next\\/data\\/[^/]{1,}))?\\/headers(\\.json)?[\\/#\\?]?$",
          "originalSource": "/headers"
        }
      ]
    },
    "type": "pages"

},
"turbopack": {
"middleware": {
"matchers": [
{
"regexp": "^(?:\\/(\_next\\/data\\/[^/]{1,}))?\\/headers(\\\\.json)?[\\/#\\?]?$",
"originalSource": "/headers"
}
]
},
"type": "pages"
}
}
at ignore-listed frames
 ELIFECYCLE  Command failed with exit code 1.

➜ yokohama git:(mischnic/turbopack-static-info) ✗ pnpm next build test/e2e/app-dir/app-alias
✓ Compiled successfully in 4.2s
✓ Finished TypeScript in 1265ms

> Build error occurred
> Error: Static info mismatch for /Users/niklas/conductor/workspaces/next.js/yokohama/test/e2e/app-dir/app-alias/src/app/typing/[slug]/page.tsx: {
> "baseline": {

    "generateStaticParams": true,
    "type": "app"

},
"turbopack": {
"type": "app"
}
}
at ignore-listed frames
