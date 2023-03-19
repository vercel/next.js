# createContext in a Server Component

#### Why This Error Occurred

You are using `createContext` in a Server Component but it only works in Client Components.

#### Possible Ways to Fix It

Mark the component using `createContext` as a Client Component by adding `'use client'` at the top of the file.

##### Before

```jsx
import { createContext } from 'react'

const Context = createContext()
```

##### After

```jsx
'use client'
import { createContext } from 'react'

const Context = createContext()
```

### Useful Links

[Server and Client Components](https://beta.nextjs.org/docs/rendering/server-and-client-components#context)
