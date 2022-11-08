# Welcome to your Convex functions directory!

Write your Convex functions here.

A query function looks like:

```typescript
// myQueryFunction.ts
import { query } from './_generated/server'

export default query(async ({ db }) => {
  // Load data with `db` here!
})
```

A mutation function looks like:

```typescript
// myMutationFunction.ts
import { mutation } from './_generated/server'

export default mutation(async ({ db }) => {
  // Edit data with `db` here!
})
```

The Convex CLI is your friend. See everything it can do by running
`npx convex -h` in your project root directory. To learn more, launch the docs
with `npx convex docs`.
