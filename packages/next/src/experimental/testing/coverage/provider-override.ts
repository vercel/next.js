type RecordValue = Record<string, unknown>

function record(value: unknown): value is RecordValue {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function settings(
  value: RecordValue,
  provider: 'v8' | 'istanbul'
): RecordValue {
  if (!record(value.coverage)) return value
  const { customProviderModule: _module, ...coverage } = value.coverage
  return { ...value, coverage: { ...coverage, provider } }
}

/** Apply the selected CLI provider before validating provider-specific options. */
export function applyCoverageProviderOverride(
  value: unknown,
  provider: 'v8' | 'istanbul' | undefined
): unknown {
  if (provider === undefined || !record(value)) return value
  const projects = (input: unknown) =>
    Array.isArray(input)
      ? input.map((project) =>
          record(project) && record(project.test)
            ? { ...project, test: settings(project.test, provider) }
            : record(project)
              ? settings(project, provider)
              : project
        )
      : input
  if (record(value.test))
    return {
      ...value,
      test: {
        ...settings(value.test, provider),
        ...('projects' in value.test
          ? { projects: projects(value.test.projects) }
          : {}),
      },
    }
  return 'projects' in value
    ? { ...value, projects: projects(value.projects) }
    : value
}
