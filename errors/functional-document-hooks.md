# Functional Document Components don't currently support React Hooks

#### Why This Error Occurred

You tried to use a [React hook](https://reactjs.org/docs/hooks-reference.html) like `useState` inside of a functional custom `Document` component. These components are similar to [React Server Components](https://reactjs.org/blog/2020/12/21/data-fetching-with-react-server-components.html) and so are very limited in functionality, especially while Server Components are still experimental.

#### Possible Ways to Fix It

Remove the hook. Move any relevant functionality to the [`App` Component](https://nextjs.org/docs/advanced-features/custom-app) instead.
