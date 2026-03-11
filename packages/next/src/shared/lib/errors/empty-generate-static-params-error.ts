export function throwEmptyGenerateStaticParamsError(): never {
  const error = new Error(
    'When using Cache Components, all `generateStaticParams` functions must return at least one result. ' +
      'This is to ensure that we can perform build-time validation that there is no other dynamic accesses that would cause a runtime error.\n\n' +
      'Learn more: https://nextjs.org/docs/messages/empty-generate-static-params'
  )
  error.name = 'EmptyGenerateStaticParamsError'
  // This error is meant to interrupt the server start/build process
  // but the stack trace isn't meaningful, as it points to internal code.
  error.stack = undefined

  throw error
}
