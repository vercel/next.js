import { relative, isAbsolute, sep } from 'path'
import {
  requestCompilerTransform,
  type CompilerTransformDescriptor,
} from './transform-broker'
import type { CompilerTransformSourceMap } from './transform-hooks'

/** Distinct built-in coverage lane; user transform hooks are never called. */
export default function istanbulLoader(
  this: {
    resourcePath: string
    resourceQuery?: string
    getOptions(): {
      descriptor: CompilerTransformDescriptor
      projectRoot: string
      frameworkRoot: string
    }
    async(): (
      error: Error | null,
      code?: string,
      map?: CompilerTransformSourceMap
    ) => void
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
  void requestCompilerTransform(options.descriptor, {
    file: this.resourcePath,
    query: this.resourceQuery ?? '',
    code,
    ...(map ? { map } : {}),
    moduleType: 'js',
  }).then(
    (result) => callback(null, result.code, result.map),
    (error) =>
      callback(error instanceof Error ? error : new Error(String(error)))
  )
}
