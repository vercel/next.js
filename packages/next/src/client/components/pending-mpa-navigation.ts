// The URL of the MPA navigation the router last handed to the browser with
// `location.assign`/`location.replace`. The router performs that navigation
// during render, so any re-render while it is in flight would start it again;
// it skips the call when the URL matches this one.
//
// The browser can abandon the navigation and keep the current document, for
// example when the response is a 204 or the user dismisses a beforeunload
// prompt, and nothing tells the page. So every new navigation the app asks for
// clears this value: a retry to the same URL then reaches the browser again,
// just as a second click on a plain <a> would.
export const pendingMpaNavigation: { path?: string } = {}
