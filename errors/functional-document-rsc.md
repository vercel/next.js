# Functional Next.js Document Components don't currently support React Hooks or Suspense

#### Why This Error Occurred

You tried to use [Suspense](https://reactjs.org/docs/react-api.html#suspense) or a [React hook](https://reactjs.org/docs/hooks-reference.html) like `useState` inside of a functional custom Next.js `Document` component. While these components are conceptually similar to [React Server Components](https://reactjs.org/blog/2020/12/21/data-fetching-with-react-server-components.html), they are very limited in functionality while React Server Components are still experimental.

#### Possible Ways to Fix It

Move any relevant suspense or hooks to the [`App` Component](https://nextjs.org/docs/advanced-features/custom-app) instead.
