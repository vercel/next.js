# `unstable_useFlushEffects` can not be called on the client

#### Why This Error Occurred

The `unstable_useFlushEffects` hook was executed while rendering a component on the client, or in another unsupported environment.

#### Possible Ways to Fix It

The `unstable_useFlushEffects` hook can only be called while _server rendering a client component_. As a best practice, we recommend creating a wrapper hook:

```jsx
// lib/use-style-libraries.js
import { unstable_useFlushEffects as useFlushEffects } from 'next/streaming'

export default function useStyleLibraries() {
  if (typeof window === 'undefined') {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useFlushEffects([
      /* ... */
    ])
  }
  /* ... */
}
```
