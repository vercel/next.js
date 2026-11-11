import { lstat, mkdir, readFile, rm, symlink } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'

const packagePart = '[a-zA-Z0-9_~][a-zA-Z0-9._~-]*'
const packageName = `(?:@${packagePart}/)?${packagePart}`
const directoryPattern = /^node_modules\/\.next-test-external\/[a-f0-9]{16}$/
const aliasPattern = new RegExp(`^node_modules/${packageName}-[a-f0-9]{16}$`)
const dependencyPattern = new RegExp(
  `^(node_modules/\\.next-test-external/[a-f0-9]{16})/node_modules/${packageName}$`
)

function invalid(): never {
  throw new Error('Invalid compiler-issued external package layout.')
}

function fields(
  value: unknown,
  keys: string[]
): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  )
}

/** Reconstructs only the package topology owned by this immutable emission. */
export async function materializeExternalLayout(
  root: string,
  files: readonly string[],
  id: string
): Promise<void> {
  const metadata = `server/next-test/${id}.external-layout.json`
  if (!files.includes(metadata)) return
  const layout: unknown = JSON.parse(
    await readFile(join(root, metadata), 'utf8')
  )
  if (
    !fields(layout, ['version', 'kind', 'directories', 'links']) ||
    layout.version !== 1 ||
    layout.kind !== 'node-external-layout' ||
    !Array.isArray(layout.directories) ||
    !Array.isArray(layout.links)
  )
    invalid()
  const directories = new Set<string>()
  let previous = ''
  for (const directory of layout.directories) {
    if (
      typeof directory !== 'string' ||
      !directoryPattern.test(directory) ||
      directory <= previous ||
      !files.some((file) => file.startsWith(`${directory}/`))
    )
      invalid()
    directories.add(directory)
    previous = directory
  }
  const links: { path: string; target: string }[] = []
  previous = ''
  for (const link of layout.links) {
    if (
      !fields(link, ['path', 'target']) ||
      typeof link.path !== 'string' ||
      typeof link.target !== 'string' ||
      link.path <= previous ||
      !directories.has(link.target)
    )
      invalid()
    const dependency = dependencyPattern.exec(link.path)
    if (
      (!aliasPattern.test(link.path) &&
        (!dependency || !directories.has(dependency[1]))) ||
      files.some(
        (file) => file === link.path || file.startsWith(`${link.path}/`)
      )
    )
      invalid()
    links.push({ path: link.path, target: link.target })
    previous = link.path
  }

  const checked = new Set<string>()
  async function ensureDirectory(path: string, create: boolean): Promise<void> {
    if (checked.has(path)) return
    if (path !== '.') await ensureDirectory(dirname(path), create)
    const absolute = join(root, path)
    if (create)
      await mkdir(absolute).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'EEXIST') throw error
      })
    if (!(await lstat(absolute)).isDirectory()) invalid()
    checked.add(path)
  }
  for (const path of directories) await ensureDirectory(path, false)
  const created: string[] = []
  try {
    for (const link of links) {
      await ensureDirectory(dirname(link.path), true)
      const path = join(root, link.path)
      const target = join(root, link.target)
      await symlink(
        process.platform === 'win32' ? target : relative(dirname(path), target),
        path,
        process.platform === 'win32' ? 'junction' : 'dir'
      )
      created.push(path)
    }
  } catch (error) {
    await Promise.all(created.map((path) => rm(path, { force: true })))
    throw error
  }
}
