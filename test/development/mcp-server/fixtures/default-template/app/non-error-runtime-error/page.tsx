'use client'

export default function NonErrorRuntimeErrorPage() {
  // eslint-disable-next-line no-throw-literal -- Testing a non-Error thrown value.
  throw 'Test non-Error runtime error'
}
