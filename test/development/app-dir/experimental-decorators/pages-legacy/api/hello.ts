import type { NextApiRequest, NextApiResponse } from 'next'

type Constructor = new () => {
  myMethod(): string
}

function loggedClass<T extends Constructor>(
  OriginalClass: T,
  _context?: unknown
) {
  return class extends OriginalClass {
    myMethod() {
      return `${super.myMethod()} world`
    }
  }
}

export default function handler(
  _req: NextApiRequest,
  res: NextApiResponse<{ text: string }>
) {
  res.status(200).json({ text: new Test().myMethod() })
}

@loggedClass
class Test {
  myMethod() {
    return 'hello'
  }
}
