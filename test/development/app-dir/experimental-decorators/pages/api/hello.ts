import type { NextApiRequest, NextApiResponse } from 'next'

type Data = {
  text: string
}

function loggedMethod(originalMethod: () => string, _context: unknown) {
  function replacementMethod(this: unknown) {
    return `${originalMethod.call(this)} world`
  }

  return replacementMethod
}

export default function handler(
  _req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  res.status(200).json({ text: new Test().myMethod() })
}

class Test {
  @loggedMethod
  myMethod() {
    return 'hello'
  }
}
