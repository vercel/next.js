import type { Token } from 'next/dist/compiled/path-to-regexp'
import { parse, tokensToRegexp } from 'next/dist/compiled/path-to-regexp'
import { parse as parseURL } from 'url'
import isError from './is-error'

interface ParseResult {
  error?: any
  parsedPath: string
  regexStr?: string
  route: string
  tokens?: Token[]
}

/**
 * If there is an error show our error link but still show original error or
 * a formatted one if we can
 */
function reportError({ route, parsedPath }: ParseResult, err: any) {
  let errMatches
  if (isError(err) && (errMatches = err.message.match(/at (\d{0,})/))) {
    const position = parseInt(errMatches[1], 10)
    console.error(
      `\nError parsing \`${route}\` ` +
        `https://nextjs.org/docs/messages/invalid-route-source\n` +
        `Reason: ${err.message}\n\n` +
        `  ${parsedPath}\n` +
        `  ${new Array(position).fill(' ').join('')}^\n`
    )
  } else {
    console.error(
      `\nError parsing ${route} https://nextjs.org/docs/messages/invalid-route-source`,
      err
    )
  }
}

/**
 * Attempts to parse a given route with `path-to-regexp` and returns an object
 * with the result. Whenever an error happens on parse, it will print an error
 * attempting to find the error position and showing a link to the docs. When
 * `handleUrl` is set to `true` it will also attempt to parse the route
 * and use the resulting pathname to parse with `path-to-regexp`.
 */
export function tryToParsePath(
  route: string,
  options?: {
    handleUrl?: boolean
  }
): ParseResult {
  const result: ParseResult = { route, parsedPath: route }
  try {
    if (options?.handleUrl) {
      const parsed = parseURL(route, true)
      result.parsedPath = `${parsed.pathname!}${parsed.hash || ''}`
    }

    result.tokens = parse(result.parsedPath)
    result.regexStr = tokensToRegexp(result.tokens).source
  } catch (err) {
    reportError(result, err)
    result.error = err
  }

  return result
}
