import { NextRequest } from 'next/server'

const proxy = 'existing proxy variable'

export function _proxy1(request: NextRequest) {
  return _proxy1(request); // self-reference
}

const handler = _proxy1
export { handler }
export { _proxy1 as proxy };