import { createHash } from 'crypto'

import type { SubresourceIntegrityAlgorithm } from '../../build/webpack/plugins/subresource-integrity-plugin'

const INLINE_SCRIPT_REGEX =
  /<script(?<attributes>[^>]*)>(?<body>[\s\S]*?)<\/script\s*>/gi
const SRC_ATTRIBUTE_REGEX = /\ssrc[\s=]/i
const UNSAFE_INLINE_SOURCE = `'unsafe-inline'`
const DEFAULT_ALGORITHM: SubresourceIntegrityAlgorithm = 'sha256'

/**
 * Collects the CSP hash sources of every inline script of a document.
 *
 * @param html the rendered document
 * @param algorithm the digest algorithm to use
 */
export function collectInlineScriptHashes(
  html: string,
  algorithm: SubresourceIntegrityAlgorithm = DEFAULT_ALGORITHM
): string[] {
  const hashes = new Set<string>()

  for (const match of html.matchAll(INLINE_SCRIPT_REGEX)) {
    const { attributes = '', body = '' } = match.groups ?? {}

    // Scripts with a src are external resources, which the policy admits by
    // their URL rather than by the content of the element.
    if (SRC_ATTRIBUTE_REGEX.test(attributes) || !body) {
      continue
    }

    const digest = createHash(algorithm).update(body, 'utf8').digest('base64')

    hashes.add(`'${algorithm}-${digest}'`)
  }

  return Array.from(hashes)
}

/**
 * Adds hash sources to the directive that governs script elements of every
 * policy in a `Content-Security-Policy` header value.
 *
 * A policy that already carries `'unsafe-inline'` is left alone: adding a hash
 * source makes browsers ignore `'unsafe-inline'`, which would block the inline
 * scripts the policy admits today.
 *
 * @param cspHeaderValue the header value, which may carry several policies
 * @param hashes the hash sources to add
 */
export function withInlineScriptHashes(
  cspHeaderValue: string,
  hashes: string[]
): string {
  if (hashes.length === 0) {
    return cspHeaderValue
  }

  // A header carries one policy per ',', each enforced on its own.
  return cspHeaderValue
    .split(',')
    .map((policy) => addHashesToPolicy(policy, hashes))
    .join(',')
}

function addHashesToPolicy(policy: string, hashes: string[]): string {
  const directives = policy.split(';')

  // Script elements are governed by 'script-src-elem' where it is present, and
  // fall back to 'script-src' and then 'default-src'.
  const index =
    findDirective(directives, 'script-src-elem') ??
    findDirective(directives, 'script-src') ??
    findDirective(directives, 'default-src')

  if (index === undefined || directives[index].includes(UNSAFE_INLINE_SOURCE)) {
    return policy
  }

  directives[index] = `${directives[index].trimEnd()} ${hashes.join(' ')}`

  return directives.join(';')
}

function findDirective(directives: string[], name: string): number | undefined {
  const index = directives.findIndex(
    (directive) => directive.trim().split(/\s+/)[0]?.toLowerCase() === name
  )

  return index === -1 ? undefined : index
}
