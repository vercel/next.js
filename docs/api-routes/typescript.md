# TypeScript

The following is an example of how to use the built-in types for API routes:

```ts
import { NextApiRequest, NextApiResponse } from 'next'

export default (req: NextApiRequest, res: NextApiResponse) => {
  res.status(200).json({ name: 'Jhon Doe' })
}
```

You can also type the response data:

```ts
import { NextApiRequest, NextApiResponse } from 'next'

type Data = {
  name: string
}

export default (req: NextApiRequest, res: NextApiResponse<Data>) => {
  res.status(200).json({ name: 'Jhon Doe' })
}
```

## Related

For more information on what to do next, we recommend the following sections:

- [**TypeScript**: Add TypeScript to your Next.js application](/docs/basic-features/typescript.md)
