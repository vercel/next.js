import { NextResponse } from 'next/server'

const proxy = 'existing proxy variable'

export function _proxy1() {
  return NextResponse.next()
}
export { _proxy1 as proxy };