// A request that opts out of caching makes a route dynamic when it is sent while the route is
// rendered. This one is sent when the module is evaluated.
export const fetched = fetch('data:text/plain,fetched', {
  cache: 'no-store',
}).then(
  (response) => response.text(),
  (error) => `error: ${error.message}`
)
