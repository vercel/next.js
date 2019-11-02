# Introduction

Every file in the `pages` folder in the root directory of your project is called a `page`. Every page has a React component as `default` export like in the following example:

```jsx
function Home() {
  return <div>Welcome to Next.js!</div>
}

export default Home
```

You can also use a [class component](https://reactjs.org/docs/react-component.html):

```jsx
import React from 'react'

class Home extends React.Component {
  render() {
    return <div>Welcome to Next.js!</div>
  }
}

export default Home
```

> **Component Lifecycle** works as expected. You can use [Hooks](https://reactjs.org/docs/hooks-intro.html) for function components and [State and Lifecycle](https://reactjs.org/docs/state-and-lifecycle.html) for class components.

> All your pages will be [**statically optimized**](https://www.notion.so/zeithq/Automatic-Static-Optimization-172e00fb49b548f9ab196a5bf754ca2d) by default.
