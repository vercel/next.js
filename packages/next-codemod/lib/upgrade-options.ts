import { gte, major, satisfies, valid } from 'semver'
import { BadInput } from '../bin/shared'
import { TRANSFORMER_INQUIRER_CHOICES } from './utils'

export interface UpgradeOptions {
  verbose: boolean
  yes?: boolean
  skipCodemod?: string[]
  reactVersion?: string
  turbopack?: boolean
}

export function validateUpgradeOptions(options: UpgradeOptions): void {
  const known = new Set(TRANSFORMER_INQUIRER_CHOICES.map(({ value }) => value))
  for (const slug of options.skipCodemod ?? []) {
    if (!known.has(slug)) throw new BadInput(`Unknown codemod: "${slug}".`)
  }
  if (
    options.reactVersion &&
    valid(options.reactVersion) !== options.reactVersion
  ) {
    throw new BadInput(
      '--react-version must be an exact published React version.'
    )
  }
}

export function validateReactVersion(
  version: string,
  nextVersion: string,
  peers: Record<string, string>,
  usesAppDir: boolean,
  react: { version: string },
  reactDom: { version: string; peerDependencies?: Record<string, string> }
): void {
  if (
    react.version !== version ||
    reactDom.version !== version ||
    !peers.react ||
    !peers['react-dom'] ||
    !satisfies(version, peers.react, { includePrerelease: true }) ||
    !satisfies(version, peers['react-dom'], { includePrerelease: true }) ||
    !reactDom.peerDependencies?.react ||
    !satisfies(version, reactDom.peerDependencies.react, {
      includePrerelease: true,
    }) ||
    (usesAppDir && gte(nextVersion, '14.3.0-canary.45') && major(version) < 19)
  ) {
    throw new BadInput(
      `React/React DOM ${version} is not a published compatible pair for Next.js ${nextVersion} and this router.`
    )
  }
}

export function filterCodemods<T extends { value: string }>(
  choices: T[],
  skipped: string[] = []
): T[] {
  return choices.filter(({ value }) => !skipped.includes(value))
}

// Next 16 changes the default for both commands. An explicit adoption opt-out
// must preserve the old default as well as decline optional suggestions.
export function preserveBundler(
  scripts: Record<string, string>,
  source: string,
  target: string
): string[] {
  if (major(source) >= 16 || major(target) < 16) return []
  const unresolved: string[] = []
  for (const [name, script] of Object.entries(scripts)) {
    const command = script.match(/^next (dev|build)(?= |$)/)
    if (!command) {
      if (
        name === 'dev' ||
        name === 'build' ||
        /\bnext (dev|build)\b/.test(script)
      )
        unresolved.push(name)
      continue
    }
    // Preserve explicitly selected bundlers and decline to rewrite shell syntax.
    if (!/^[\w ./@:%=+,-]+$/.test(script)) {
      unresolved.push(name)
    } else if (!/(?:^| )--(?:turbo|turbopack|webpack)(?: |$)/.test(script)) {
      scripts[name] = script.replace(command[0], `${command[0]} --webpack`)
    }
  }
  return unresolved
}
