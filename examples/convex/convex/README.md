# Welcome to your Convex functions directory!

Write your Convex functions here. See
https://docs.convex.dev/using/writing-convex-functions for more.

A query function that takes two arguments looks like:

```typescript
// myQueryFunction.ts
import { query } from './_generated/server'

export default query(async ({ db }, first: number, second: string) => {
  // Validate arguments here.
  if (typeof first !== 'number' || first < 0) {
    throw new Error('First argument is not a non-negative number.')
  }
  if (typeof second !== 'string' || second.length > 1000) {
    throw new Error('Second argument is not a string of length 1000 or less.')
  }

  // Query the database as many times as you need here.
  // See https://docs.convex.dev/using/database-queries to learn how to write queries.
  const documents = await db.query('tablename').collect()

  // Write arbitrary JavaScript here: filter, aggregate, build derived data,
  // remove non-public properties, or create new objects.
  return documents
})
```

Using this query function in a React component looks like:

```typescript
const data = useQuery('myQueryFunction', 10, 'hello')
```

A mutation function looks like:

```typescript
// myMutationFunction.ts
import { mutation } from './_generated/server'

export default mutation(async ({ db }, first: string, second: string) => {
  // Validate arguments here.
  if (typeof first !== 'string' || typeof second !== 'string') {
    throw new Error('Both arguments must be strings')
  }

  // Insert or modify documents in the database here.
  // Mutations can also read from the database like queries.
  const message = { body: first, author: second }
  const id = await db.insert('messages', message)

  // Optionally, return a value from your mutation.
  return await db.get(id)
})
```

Using this mutation function in a React component looks like:

```typescript
const mutation = useMutation('myMutationFunction')
function handleButtonPress() {
  // fire and forget, the most common way to use mutations
  mutation('Hello!', 'me')
  // OR
  // use the result once the mutation has completed
  mutation('Hello!', 'me').then((result) => console.log(result))
}
```

The Convex CLI is your friend. See everything it can do by running
`npx convex -h` in your project root directory. To learn more, launch the docs
with `npx convex docs`.
