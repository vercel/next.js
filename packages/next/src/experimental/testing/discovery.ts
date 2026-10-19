import { readdir, readFile, realpath, stat } from 'fs/promises'
import { createHash } from 'crypto'
import { resolveFileEnvironment } from './environments/config'
import { usesInSourceTestMarker } from './in-source'
import path from 'path'
import picomatch from 'next/dist/compiled/picomatch'
import type { TestEntry } from './contracts'
import type { TestConfig, TestProjectConfig } from './config'

export interface DiscoveredTestProject extends TestProjectConfig {
  entries: TestEntry[]
}

function relativePath(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join('/')
}

export async function discoverTests(
  directory: string,
  config: TestConfig,
  selection: { project?: string; files?: string[] } = {}
): Promise<DiscoveredTestProject[]> {
  const root = await realpath(directory)
  const projects = config.projects.filter(
    (project) => !selection.project || project.profile.id === selection.project
  )
  if (!projects.length) {
    throw new Error(`Unknown test project "${selection.project}".`)
  }
  const files: string[] = []
  // Never follow directory symlinks: avoid cycles, external trees, and duplicate tests.
  async function visit(currentDirectory: string) {
    for (const entry of await readdir(currentDirectory, {
      withFileTypes: true,
    })) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
      const file = path.join(currentDirectory, entry.name)
      if (entry.isDirectory()) await visit(file)
      else if (entry.isFile()) files.push(file)
    }
  }
  await visit(root)
  files.sort()
  return Promise.all(
    projects.map(async (project) => {
      const include = picomatch(project.include)
      const typecheck = project.typecheck?.enabled
        ? project.typecheck
        : undefined
      const typeInclude = typecheck ? picomatch(typecheck.include) : undefined
      const typeExclude = typecheck ? picomatch(typecheck.exclude) : undefined
      const exclude = picomatch(project.exclude)
      const setupFiles = await Promise.all(
        project.setupFiles.map(async (file) => {
          const resolved = await realpath(path.resolve(root, file))
          const relative = path.relative(root, resolved)
          if (
            relative.startsWith(`..${path.sep}`) ||
            path.isAbsolute(relative)
          ) {
            throw new Error(`Setup file must be inside the project: ${file}`)
          }
          if (!(await stat(resolved)).isFile()) {
            throw new Error(`Setup file is not a file: ${file}`)
          }
          return resolved
        })
      )
      const browserFixtures = await Promise.all(
        (project.browserFixtures ?? []).map(async (fixture) => {
          const module = await realpath(path.resolve(root, fixture.module))
          const relative = path.relative(root, module)
          if (
            relative === '..' ||
            relative.startsWith(`..${path.sep}`) ||
            path.isAbsolute(relative)
          ) {
            throw new Error(
              `Browser fixture must be inside the project: ${fixture.id}`
            )
          }
          if (!(await stat(module)).isFile()) {
            throw new Error(`Browser fixture is not a file: ${fixture.id}`)
          }
          return { ...fixture, module }
        })
      )
      const fixtureModules = new Set(
        browserFixtures.map((fixture) => fixture.module)
      )
      const setup = new Set(setupFiles)
      if (setup.size !== setupFiles.length) {
        throw new Error(
          'Duplicate setup files are unsupported; compiled setup modules execute once per file. Use unique setup files.'
        )
      }
      const sourceFiles = new Map<string, string>()
      if (!typecheck?.only && project.includeSource?.length) {
        const includeSource = picomatch(project.includeSource)
        for (const file of files) {
          const relative = relativePath(root, file)
          if (
            !setup.has(file) &&
            !fixtureModules.has(file) &&
            !exclude(relative) &&
            includeSource(relative) &&
            (!selection.files?.length ||
              selection.files.some((filter) => relative.includes(filter)))
          ) {
            // Match the published discovery contract. Actual syntax is parsed
            // and substituted by the native compiler, never by this marker scan.
            const source = await readFile(file)
            if (source.toString('utf8').includes('import.meta.vitest')) {
              sourceFiles.set(
                file,
                createHash('sha256').update(source).digest('hex')
              )
            }
          }
        }
      }
      return {
        ...project,
        setupFiles,
        ...(project.browserFixtures === undefined ? {} : { browserFixtures }),
        entries: (
          await Promise.all(
            files
              .filter((file) => {
                const relative = relativePath(root, file)
                return (
                  !setup.has(file) &&
                  !fixtureModules.has(file) &&
                  !typecheck?.only &&
                  (include(relative) || sourceFiles.has(file)) &&
                  !exclude(relative) &&
                  (!selection.files?.length ||
                    selection.files.some((filter) => relative.includes(filter)))
                )
              })
              .map(async (file): Promise<TestEntry> => {
                const source = await readFile(file)
                const selected = resolveFileEnvironment(
                  source.toString('utf8'),
                  project
                )
                return {
                  id: `${project.profile.id}:${relativePath(root, file)}`,
                  file,
                  profile: selected.profile,
                  ...(selected.executionEnvironment
                    ? { executionEnvironment: selected.executionEnvironment }
                    : {}),
                  ...(sourceFiles.has(file) ||
                  usesInSourceTestMarker(source.toString('utf8'), file, {
                    deferSyntaxError: true,
                  })
                    ? {
                        inSource: true as const,
                        inSourceHash:
                          sourceFiles.get(file) ??
                          createHash('sha256').update(source).digest('hex'),
                      }
                    : {}),
                  environmentSourceHash: createHash('sha256')
                    .update(source)
                    .digest('hex'),
                }
              })
          )
        ).concat(
          typecheck
            ? files
                .filter((file) => {
                  const relative = relativePath(root, file)
                  return (
                    !setup.has(file) &&
                    !fixtureModules.has(file) &&
                    typeInclude!(relative) &&
                    !typeExclude!(relative) &&
                    (!selection.files?.length ||
                      selection.files.some((filter) =>
                        relative.includes(filter)
                      ))
                  )
                })
                .map((file) => ({
                  id: `${project.profile.id}:typescript:${relativePath(root, file)}`,
                  file,
                  profile: project.profile,
                  typecheck: true as const,
                }))
            : []
        ),
      }
    })
  )
}
