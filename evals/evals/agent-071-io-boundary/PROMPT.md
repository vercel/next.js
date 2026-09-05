Our market dashboard has two pages sharing one data helper: `lib/quote.ts` exports `getFreshQuote()`, which the Live ticker page (`/live`) renders under its streaming placeholder, and the Daily Report page (`/report`) uses inside its cached report loader.

The bug: the Live ticker shows the same quote to every visitor — the value got baked in when the app was built. Two visitors hitting `/live` seconds apart see an identical "live" price and stamp, which is embarrassing for something labeled live.

What we need:

1. The Live ticker must be computed per request: two visitors seconds apart must see different stamps, with the value streaming in under the existing placeholder.
2. The Daily Report must keep serving its cached value: repeat requests return the identical report, recomputed at most once per 10 minutes.
3. The fix must live inside the shared helper itself — we already got burned once by a call site that baked a quote into the build. A teammate wiring `getFreshQuote()` into a brand-new page must get the per-request behavior with zero extra steps at the call site.
4. `next build` stays green, and the Live page keeps its instantly-served frame (the prebuilt shell with the placeholder).

Note: our monitoring scrapes the `data-testid` spans on these pages, so keep those intact.
