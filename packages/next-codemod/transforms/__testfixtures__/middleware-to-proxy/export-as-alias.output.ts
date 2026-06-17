import { NextResponse } from 'next/server'

const proxy = 'existing proxy variable'

function _proxy1() {
  return NextResponse.next()
}

export { _proxy1 as randomName }