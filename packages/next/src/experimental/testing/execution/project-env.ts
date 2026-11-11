import type { CompiledTestArtifact, ExecuteTestOptions } from '../contracts'

// Capture the actual worker environment before authored modules may replace globals.
const realEnvironment = process.env

/** Test settings cannot change the compiler-owned Node mode or shared worker state. */
export function assertNodeProjectEnvironment(
  artifact: CompiledTestArtifact,
  options: Pick<ExecuteTestOptions, 'env' | 'entry' | 'customCoverage'>
): void {
  const values = options.env
  if (values === undefined) return
  if (
    artifact.kind !== 'node' ||
    artifact.profile.environment !== 'node' ||
    !['development', 'production'].includes(artifact.profile.mode) ||
    artifact.profile.browserClient ||
    artifact.profile.route !== undefined ||
    artifact.cohort ||
    (options.entry.executionEnvironment &&
      options.entry.executionEnvironment.name !== 'node') ||
    options.customCoverage
  )
    throw new Error(
      'Project env values require an isolated ordinary Node worker.'
    )
  if (!values || typeof values !== 'object' || Array.isArray(values))
    throw new TypeError('Node project env must be an object of strings.')
  const keys = artifact.compilerEnvKeys
  if (
    !keys ||
    keys.version !== 1 ||
    !Array.isArray(keys.names) ||
    keys.names.some((name) => typeof name !== 'string') ||
    new Set(keys.names).size !== keys.names.length
  )
    throw new Error(
      'Node project env requires the actual compiler define-env key map.'
    )
  for (const [name, value] of Object.entries(values)) {
    if (typeof value !== 'string')
      throw new TypeError(`Node project env.${name} must be a string.`)
    if (keys.names.includes('process.env.' + name))
      throw new Error(
        `Node project env cannot override compiler-defined process.env.${name}.`
      )
  }
}

/** Apply after the emitted bootstrap and retain through the real file disposal. */
export function applyNodeProjectEnvironment(
  values: Record<string, string> | undefined
): (() => void) | undefined {
  if (values === undefined) return
  const original = Object.entries(values).map(([name, value]) => {
    const previous = realEnvironment[name]
    realEnvironment[name] = value
    return [name, previous] as const
  })
  let restored = false
  return () => {
    if (restored) return
    restored = true
    for (const [name, value] of original) {
      if (value === undefined) delete realEnvironment[name]
      else realEnvironment[name] = value
    }
  }
}
