type RecordValue = Record<string, unknown>

function record(value: unknown): value is RecordValue {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function settings(value: RecordValue): RecordValue {
  if (!record(value.coverage)) return value
  const { customProviderModule: _module, ...coverage } = value.coverage
  return { ...value, coverage: { ...coverage, provider: 'v8' } }
}

/** Apply the selected CLI provider before validating provider-specific options. */
export function applyCoverageProviderOverride(
  value: unknown,
  provider: 'v8' | undefined
): unknown {
  if (provider === undefined || !record(value)) return value
  const projects = (input: unknown) =>
    Array.isArray(input)
      ? input.map((project) =>
          record(project) && record(project.test)
            ? { ...project, test: settings(project.test) }
            : record(project)
              ? settings(project)
              : project
        )
      : input
  if (record(value.test))
    return {
      ...value,
      test: {
        ...settings(value.test),
        ...('projects' in value.test
          ? { projects: projects(value.test.projects) }
          : {}),
      },
    }
  return 'projects' in value
    ? { ...value, projects: projects(value.projects) }
    : value
}
