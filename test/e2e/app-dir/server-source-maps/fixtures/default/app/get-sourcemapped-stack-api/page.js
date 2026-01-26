import { getSourcemappedStack } from 'next/server'

function createError() {
  return new Error('get-sourcemapped-stack-api-test')
}

export default function Page() {
  const error = createError()
  const stack = getSourcemappedStack(error)
  console.log('SOURCEMAPPED_STACK_OUTPUT:', stack)
  return <p>Test page</p>
}
