// In the browser, React keys include concrete params so navigation preserves
// or resets component state according to the segment's actual identity.
export { createRouterCacheKey as createSegmentKey } from './create-router-cache-key'
