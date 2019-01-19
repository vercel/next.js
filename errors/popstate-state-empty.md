# `popstate` called with empty state

#### Why This Error Occurred

When using the browser back button the popstate event is triggered. Next.js sets 
`popstate` event triggered but `event.state` did not have `url` or `as`, causing a route change failure

#### Possible Ways to Fix It

The only known cause of this issue is manually manipulating `window.history` instead of using `next/router` 

### Useful Links

- [The issue this was reported in: #4994](https://github.com/zeit/next.js/issues/4994)
