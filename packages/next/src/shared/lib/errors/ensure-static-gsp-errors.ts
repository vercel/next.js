import type { Route } from '../route-types'

export function throwMissingGspErrorInStaticRoute(page: Route) {
  throw new Error(
    `Page "${page}": \`ensureStatic = "navigation"\` requires an exported \`generateStaticParams()\` function.\nLearn more: https://nextjs.org/docs/messages/generate-static-params#with-ensurestatic`
  )
}

export function throwIncompleteStaticParamsErrorInStaticRoute(
  page: Route,
  missingParamNames: string[]
) {
  throw new Error(
    `Page "${page}": \`generateStaticParams()\` returned incomplete params. Routes using \`ensureStatic = "navigation"\` must return every dynamic route parameter. Missing: ${missingParamNames.map((name) => `"${name}"`).join(', ')}.\nLearn more: https://nextjs.org/docs/messages/generate-static-params#with-ensurestatic`
  )
}
