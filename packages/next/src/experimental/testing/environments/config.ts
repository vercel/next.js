import type { TestExecutionEnvironment, TestProfile } from '../contracts'

function environmentError(label: string, message: string): never {
  throw new Error(`Invalid next.test.config.json: ${label}.${message}`)
}

export function parseExecutionEnvironment(
  name: unknown,
  options: unknown,
  label: string
): TestExecutionEnvironment | undefined {
  if (typeof name !== 'string' || !name.trim() || name !== name.trim())
    environmentError(
      label,
      'environment must be a nonempty environment name or module path.'
    )
  if (
    options !== undefined &&
    (!options || typeof options !== 'object' || Array.isArray(options))
  )
    environmentError(label, 'environmentOptions must be an object.')
  let copied: Record<string, unknown> | undefined
  if (options !== undefined) {
    try {
      copied = structuredClone(options) as Record<string, unknown>
    } catch {
      environmentError(
        label,
        'environmentOptions must be serializable across the file worker boundary.'
      )
    }
  }
  if (name === 'rsc' || name === 'browser') {
    if (options !== undefined)
      environmentError(
        label,
        'environmentOptions requires a Node execution environment.'
      )
    return undefined
  }
  if (name === 'node' && options === undefined) return undefined
  return { name, ...(copied === undefined ? {} : { options: copied }) }
}

/** Discovery reads directives without importing the test or its environment. */
export function resolveFileEnvironment(
  source: string,
  project: {
    profile: TestProfile
    executionEnvironment?: TestExecutionEnvironment
  }
): { profile: TestProfile; executionEnvironment?: TestExecutionEnvironment } {
  // Limit directives to the leading comments; strings and executable bodies
  // cannot change the realm selected before compilation and setup.
  const comments =
    source.match(
      /^(?:\uFEFF)?(?:#![^\n]*(?:\n|$))?(?:\s|\/\/[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)*/
    )?.[0] ?? ''
  const name = comments.match(
    /@(?:vitest|jest)-environment\s+([\w./@-]+)\b/
  )?.[1]
  let json = comments.match(
    /@(?:vitest|jest)-environment-options\s+([^\r\n]+)/
  )?.[1]
  if (json?.endsWith('*/')) json = json.slice(0, -2).trimEnd()
  if (name === undefined && json === undefined) return project
  if (project.profile.environment !== 'node')
    throw new Error(
      'Per-file execution environment directives require a Node compiler profile.'
    )
  const selected = name ?? project.executionEnvironment?.name ?? 'node'
  if (selected === 'rsc' || selected === 'browser')
    throw new Error(
      'A per-file execution environment cannot change the Next compiler profile.'
    )
  let options: unknown = project.executionEnvironment?.options
  if (json !== undefined) {
    let parsed: unknown
    try {
      parsed = JSON.parse(json)
    } catch {
      throw new Error('Invalid per-file environment-options JSON.')
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      throw new Error('Per-file environment-options must be a JSON object.')
    options = { [selected === 'happy-dom' ? 'happyDOM' : selected]: parsed }
  }
  return {
    profile: project.profile,
    executionEnvironment: parseExecutionEnvironment(
      selected,
      options,
      'file'
    ) ?? { name: 'node' },
  }
}
