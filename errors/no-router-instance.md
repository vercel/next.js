# No Router Instance

#### Why This Error Occurred

Next.js is universal, which means it executes code first server-side with NodeJS, then on the client-side, `window` object is not defined in NodeJS, so some methods are not supported or availale at build time.
During SSR you might have tried to access a router method `push`, `replace`, `back`, which is not supported.

#### Possible Ways to Fix It

In a class Component, move any calls to router methods to `componentDidMount` lifecycle method or add a check such as `typeof window !== 'undefined'` before calling the methods

In a functional Component you can move the code into the `useEffect` hook. checking `typeof window !== 'undefined'` also works in a functional component.

This way the calls to the router methods are only executed on the client (in the browser), thus ensuring access to the `window` object.
