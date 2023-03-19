# React client hook in Server Component

#### Why This Error Occurred

You are using a React client hook in a Server Component.

#### Possible Ways to Fix It

Mark the component using the hook as a Client Component by adding `'use client'` at the top of the file.

##### Before

```jsx
import { useEffect } from 'react'

export default function Page() {
  useEffect(() => {
    console.log('in useEffect')
  })
  return <p>Hello world</p>
}
```

##### After

```jsx
'use client'
import { useEffect } from 'react'

export default function Page() {
  useEffect(() => {
    console.log('in useEffect')
  })
  return <p>Hello world</p>
}
```

### Useful Links

[Server and Client Components](https://beta.nextjs.org/docs/rendering/server-and-client-components)
