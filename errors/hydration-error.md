# Hydration Error

#### Why This Error Occurred

The server-side render of your page didn't match the initial hydration done on the client. This can be caused by conditionally rendering items with `typeof window !== 'undefined'` before the application has mounted.

In React, hydration errors are ignored in production and React assumes the DOM tree matches the React tree generated from hydration. This means any mismatches will be ignored and the DOM not updated from these differences causing bad side effects.

#### Possible Ways to Fix It

Look for any usage of `typeof window !== 'undefined'`, `location.href`, `useRouter().asPath`, or any other logic that generates a different tree on the server versus the initial client render and make sure any differences in the tree aren't triggered until after hydration (`componentDidMount` or `useEffect`).

### Useful Links

- [React Hydration docs](https://reactjs.org/docs/react-dom.html#hydrate)
- [Open React issue for documenting hydration behavior](https://github.com/reactjs/reactjs.org/issues/25)
