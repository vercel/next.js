export function throwMissingGspErrorInStaticRoute(page: string) {
  throw new Error(
    `Page "${page}" is missing \`generateStaticParams()\` which is currently not supported with \`ensureStatic = "navigation"\`. See more info here: https://nextjs.org/docs/messages/generate-static-params`
  )
}

export function throwIncompleteStaticParamsErrorInStaticRoute(
  page: string,
  missingParamNames: string[]
) {
  throw new Error(
    `Page "${page}" returned incomplete params from \`generateStaticParams()\`. This is currently unsupported with \`ensureStatic = "navigation"\`. Every params object must include all dynamic route parameters. Missing: ${missingParamNames.map((name) => `"${name}"`).join(', ')}. See more info here: https://nextjs.org/docs/messages/generate-static-params`
  )
}
