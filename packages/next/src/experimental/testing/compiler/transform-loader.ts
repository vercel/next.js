import { relative, isAbsolute, sep } from 'node:path'
import {
  requestCompilerTransform,
  type CompilerTransformDescriptor,
} from './transform-broker'
import type { CompilerTransformSourceMap } from './transform-hooks'

export interface CompilerTransformLoaderOptions {
  descriptor: CompilerTransformDescriptor
  projectRoot: string
  frameworkRoot: string
}
export default function transformLoader(
  this: {
    resourcePath: string
    resourceQuery?: string
    getOptions(): CompilerTransformLoaderOptions
    async(): (
      error: Error | null,
      code?: string,
      map?: CompilerTransformSourceMap
    ) => void
    addDependency(file: string): void
    emitWarning(error: Error): void
  },
  code: string,
  map?: CompilerTransformSourceMap
) {
  const callback = this.async()
  const options = this.getOptions()
  const inside = (root: string) => {
    const path = relative(root, this.resourcePath)
    return path !== '..' && !path.startsWith('..' + sep) && !isAbsolute(path)
  }
  if (!inside(options.projectRoot) || inside(options.frameworkRoot))
    return callback(null, code, map)
  if (options.descriptor.configFile)
    this.addDependency(options.descriptor.configFile)
  for (const file of options.descriptor.configDependencies ?? [])
    this.addDependency(file)
  const extension = this.resourcePath.split('.').pop()!
  void requestCompilerTransform(options.descriptor, {
    file: this.resourcePath,
    query: this.resourceQuery ?? '',
    code,
    ...(map ? { map } : {}),
    moduleType: /^(?:ts|mts|cts)$/.test(extension)
      ? 'ts'
      : extension === 'tsx'
        ? 'tsx'
        : extension === 'jsx'
          ? 'jsx'
          : 'js',
  }).then(
    (result) => {
      for (const file of result.dependencies) this.addDependency(file)
      for (const warning of result.warnings)
        this.emitWarning(new Error(warning))
      callback(null, result.code, result.map)
    },
    (error) =>
      callback(error instanceof Error ? error : new Error(String(error)))
  )
}
