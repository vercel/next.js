import { ParsedUrlQuery } from 'querystring'
import { searchParamsToUrlQuery } from './querystring'
import { parseRelativeUrl } from './parse-relative-url'
import * as pathToRegexp from 'next/dist/compiled/path-to-regexp'

type Params = { [param: string]: any }

export default function prepareDestination(
  destination: string,
  params: Params,
  query: ParsedUrlQuery,
  appendParamsToQuery: boolean,
  basePath: string
) {
  let parsedDestination: {
    query?: ParsedUrlQuery
    protocol?: string
    hostname?: string
    port?: string
  } & ReturnType<typeof parseRelativeUrl> = {} as any

  if (destination.startsWith('/')) {
    parsedDestination = parseRelativeUrl(destination)
  } else {
    const {
      pathname,
      searchParams,
      hash,
      hostname,
      port,
      protocol,
      search,
      href,
    } = new URL(destination)

    parsedDestination = {
      pathname,
      query: searchParamsToUrlQuery(searchParams),
      hash,
      protocol,
      hostname,
      port,
      search,
      href,
    }
  }

  const destQuery = parsedDestination.query
  const destPath = `${parsedDestination.pathname!}${
    parsedDestination.hash || ''
  }`
  const destPathParamKeys: pathToRegexp.Key[] = []
  pathToRegexp.pathToRegexp(destPath, destPathParamKeys)

  const destPathParams = destPathParamKeys.map((key) => key.name)

  let destinationCompiler = pathToRegexp.compile(
    destPath,
    // we don't validate while compiling the destination since we should
    // have already validated before we got to this point and validating
    // breaks compiling destinations with named pattern params from the source
    // e.g. /something:hello(.*) -> /another/:hello is broken with validation
    // since compile validation is meant for reversing and not for inserting
    // params from a separate path-regex into another
    { validate: false }
  )
  let newUrl

  // update any params in query values
  for (const [key, strOrArray] of Object.entries(destQuery)) {
    let value = Array.isArray(strOrArray) ? strOrArray[0] : strOrArray
    if (value) {
      // the value needs to start with a forward-slash to be compiled
      // correctly
      value = `/${value}`
      const queryCompiler = pathToRegexp.compile(value, { validate: false })
      value = queryCompiler(params).substr(1)
    }
    destQuery[key] = value
  }

  // add path params to query if it's not a redirect and not
  // already defined in destination query or path
  const paramKeys = Object.keys(params)

  if (
    appendParamsToQuery &&
    !paramKeys.some((key) => destPathParams.includes(key))
  ) {
    for (const key of paramKeys) {
      if (!(key in destQuery)) {
        destQuery[key] = params[key]
      }
    }
  }

  const shouldAddBasePath = destination.startsWith('/') && basePath

  try {
    newUrl = `${shouldAddBasePath ? basePath : ''}${destinationCompiler(
      params
    )}`

    const [pathname, hash] = newUrl.split('#')
    parsedDestination.pathname = pathname
    parsedDestination.hash = `${hash ? '#' : ''}${hash || ''}`
    delete parsedDestination.search
  } catch (err) {
    if (err.message.match(/Expected .*? to not repeat, but got an array/)) {
      throw new Error(
        `To use a multi-match in the destination you must add \`*\` at the end of the param name to signify it should repeat. https://err.sh/vercel/next.js/invalid-multi-match`
      )
    }
    throw err
  }

  // Query merge order lowest priority to highest
  // 1. initial URL query values
  // 2. path segment values
  // 3. destination specified query values
  parsedDestination.query = {
    ...query,
    ...parsedDestination.query,
  }

  return {
    newUrl,
    parsedDestination,
  }
}
