// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next'

type Data = {
  text: string
}

function loggedMethod(originalMethod: any, _context: any) {
  console.log('decorator hit')
  function replacementMethod(this: any, ...args: any[]) {
    console.log('hit')
    const result = originalMethod.call(this, ...args)
    return result + ' world'
  }
  return replacementMethod
}

export default function handler(
  req: NextApiRequest,
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
