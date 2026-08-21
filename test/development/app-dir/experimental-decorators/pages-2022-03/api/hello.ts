import type { NextApiRequest, NextApiResponse } from 'next'

function loggedAccessor(value: any, context: ClassAccessorDecoratorContext) {
  if (context.kind !== 'accessor') {
    throw new Error(`Unexpected decorator kind: ${context.kind}`)
  }

  return {
    get(this: unknown) {
      return `${value.get.call(this)} world`
    },
  }
}

export default function handler(
  _req: NextApiRequest,
  res: NextApiResponse<{ text: string }>
) {
  res.status(200).json({ text: new Test().myMethod() })
}

class Test {
  @loggedAccessor accessor message = 'hello'

  myMethod() {
    return this.message
  }
}
