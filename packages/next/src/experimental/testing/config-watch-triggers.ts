import path from 'node:path'
import { types } from 'node:util'
import type { TestWatchTriggerPattern } from './config-api'

export type WatchTriggerMatch =
  | { source: string; matched: false }
  | { source: string; matched: true; tests: string[] }

export interface RetainedWatchTriggers {
  definitions: readonly TestWatchTriggerPattern[]
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

/** Keep executable definitions in their real root configuration realm. */
export function retainWatchTriggers(
  value: unknown,
  projectConfig: boolean
): { value: unknown; retained?: RetainedWatchTriggers } {
  if (!record(value) || !record(value.test)) return { value }
  const test = value.test
  const setting = test.watchTriggerPatterns
  let retained: RetainedWatchTriggers | undefined
  if (setting !== undefined && !projectConfig) {
    if (!Array.isArray(setting))
      throw new TypeError('test.watchTriggerPatterns must be an array.')
    retained = { definitions: setting }
  }
  let changed = setting !== undefined
  const projects = Array.isArray(test.projects)
    ? test.projects.map((project) => {
        if (!record(project)) return project
        const settings = record(project.test) ? project.test : project
        if (settings.watchTriggerPatterns === undefined) return project
        changed = true
        const { watchTriggerPatterns: _ignored, ...rest } = settings
        return settings === project ? rest : { ...project, test: rest }
      })
    : test.projects
  if (!changed) return { value }
  const { watchTriggerPatterns: _setting, ...rest } = test
  return {
    value: {
      ...value,
      test: {
        ...rest,
        ...(Array.isArray(projects) ? { projects } : {}),
      },
    },
    ...(retained ? { retained } : {}),
  }
}

/** Evaluate the actual synchronous authored rules in source order. */
export function evaluateWatchTriggers(
  retained: RetainedWatchTriggers,
  root: string,
  files: readonly string[]
): WatchTriggerMatch[] {
  return files.map((source) => {
    const id = source.replace(/\\/g, '/')
    let matched = false
    const selected = new Set<string>()
    retained.definitions.forEach((definition) => {
      const match = definition.pattern.exec(id)
      if (!match) return
      // Preserve the actual definition receiver and RegExp.lastIndex. A null
      // result does not stop a later rule from selecting this change.
      const result = definition.testsToRun(id, match)
      if (types.isPromise(result))
        throw new Error(
          'Watch trigger mapper Promise returns are not implemented.'
        )
      if (Array.isArray(result)) {
        matched = true
        result.forEach((file) => selected.add(path.resolve(root, file)))
      } else if (typeof result === 'string') {
        matched = true
        selected.add(path.resolve(root, result))
      }
    })
    return matched
      ? { source, matched: true, tests: [...selected] }
      : { source, matched: false }
  })
}
