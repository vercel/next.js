# React Class component rendered in a Server Component

#### Why This Error Occurred

You are rendering a React Class Component in a Server Component, `React.Component` and `React.PureComponent` only works in Client Components.

#### Possible Ways to Fix It

Use a Function Component.

##### Before

```jsx
export default class Page extends React.Component {
  render() {
    return <p>Hello world</p>
  }
}
```

##### After

```jsx
export default function Page() {
  return <p>Hello world</p>
}
```

Mark the component rendering the React Class Component as a Client Component by adding `'use client'` at the top of the file.

##### Before

```jsx
export default class Page extends React.Component {
  render() {
    return <p>Hello world</p>
  }
}
```

##### After

```jsx
'use client'
export default class Page extends React.Component {
  render() {
    return <p>Hello world</p>
  }
}
```

### Useful Links

[Server and Client Components](https://beta.nextjs.org/docs/rendering/server-and-client-components)
