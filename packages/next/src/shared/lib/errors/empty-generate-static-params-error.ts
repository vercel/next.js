export function throwEmptyGenerateStaticParamsError(
  // Compiler-injected factory whose error stack is anchored at the user's
  // `generateStaticParams`. The transform injects it for every app page that
  // exports `generateStaticParams` by a statically-visible name, but a few
  // forms can't be detected from the page module alone (e.g. `export *`
  // re-exports), so it may be absent.
  createError: (() => Error) | undefined
): never {
  if (createError) {
    throw createError()
  }

  // Fallback for the rare case the compiler couldn't inject an anchored factory
  // (e.g. a wildcard re-export). The stack points at framework internals, but
  // we keep it: those frames are ignore-listed in the output and stay available
  // for debugging.
  throw new Error(
    'When using Cache Components, all `generateStaticParams` functions must return at least one result. ' +
      'This is to ensure that we can perform build-time validation that there is no other dynamic accesses that would cause a runtime error.\n\n' +
      'Learn more: https://nextjs.org/docs/messages/empty-generate-static-params'
  )
}
