# No Router Instance

#### Why This Error Occurred

During Pre-rendering (SSR or SSG) you tried to access a router method `push`, `replace`, `back`, which is not supported.

#### Possible Ways to Fix It

In a class Component, move any calls to router methods to `componentDidMount` lifecycle method or add a check such as `typeof window !== 'undefined'` before calling the methods

In a functional Component you can move the code into the `useEffect` hook.

This way the calls to the router methods are only executed in the browser.
