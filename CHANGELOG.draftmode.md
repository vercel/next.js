## Next.js v16.2.1-canary.38 (Draft Mode Fix)

### Core Changes

- Fix Draft Mode not passing searchParams on Vercel production with cacheComponents enabled
- Add fallback to parse requestStore.url.search directly from URLSearchParams
- Add data support to draftMode().enable(data)
- Fix PrerenderStore mutation for dynamic rendering (revalidate = 0)
- Re-parse URL query parameters after enabling draft mode

### Credits

- @Mark-Lasfar (Initial implementation and testing)

### Full Changelog

https://github.com/Mark-Lasfar/next.js/compare/v16.2.1-canary.37-draftmode-fix...v16.2.1-canary.38-draftmode-fix
