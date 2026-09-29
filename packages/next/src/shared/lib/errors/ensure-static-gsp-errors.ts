export function throwMissingGspErrorInStaticRoute(page: string) {
  throw new Error(
    `Page "${page}": \`unstable_ensureStatic = "navigation"\` requires an exported \`generateStaticParams()\` function.\nLearn more: https://nextjs.org/docs/messages/generate-static-params#with-unstable_ensurestatic`
  )
}

export function throwIncompleteStaticParamsErrorInStaticRoute(
  page: string,
  missingParamNames: string[]
) {
  throw new Error(
    `Page "${page}": \`generateStaticParams()\` returned incomplete params. Routes using \`unstable_ensureStatic = "navigation"\` must return every dynamic route parameter. Missing: ${missingParamNames.map((name) => `"${name}"`).join(', ')}.\nLearn more: https://nextjs.org/docs/messages/generate-static-params#with-unstable_ensurestatic`
  )
}
