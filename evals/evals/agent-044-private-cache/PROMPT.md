Last sprint we cached the expensive recommendation scoring pass in lib/recommendations.ts, and now production builds fail complaining about cookies inside the cached function. Fix the build while keeping the feature working as designed:

- The Recommendations link on the home page is prefetched. Navigating to /recommendations must keep showing the visitor's picks instantly, with no loading flash — the picks are supposed to already be there by the time the click happens.
- Compliance rules for personalized data: one visitor's picks must never be shown to another visitor, must never appear in prerendered or shared output, and must never be written to any shared server-side cache. Caching personalized picks in the visitor's own browser is the only caching allowed for this data.
- Keep the existing element ids and data attributes; our smoke tests select on them.
