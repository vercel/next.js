import type { NextApiRequest, NextApiResponse } from 'next'

const metadataKey = Symbol('messageSuffix')
let accessorMetadata: DecoratorMetadata | undefined

function loggedAccessor(value: any, context: ClassAccessorDecoratorContext) {
  if (context.kind !== 'accessor') {
    throw new Error(`Unexpected decorator kind: ${context.kind}`)
  }

  accessorMetadata = context.metadata
  context.metadata[metadataKey] = ' world'

  return {
    get(this: unknown) {
      return `${value.get.call(this)}${context.metadata[metadataKey]}`
    },
  }
}

function verifyMetadata(_value: unknown, context: ClassDecoratorContext) {
  if (context.metadata !== accessorMetadata) {
    throw new Error('Expected decorators to share the same metadata object')
  }
}

export default function handler(
  _req: NextApiRequest,
  res: NextApiResponse<{ text: string }>
) {
  res.status(200).json({ text: new Test().myMethod() })
}

@verifyMetadata
class Test {
  @loggedAccessor accessor message = 'hello'

  myMethod() {
    return this.message
  }
}
