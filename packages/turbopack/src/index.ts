import {
  loadBinding,
  type NapiBuildInfo,
  type NapiProjectOptions,
  type NativeProject,
  type RawBinding,
} from './binding'

/** A live project handle wrapping the opaque native handle. */
export class Project {
  constructor(
    private readonly binding: RawBinding,
    private readonly native: NativeProject
  ) {}

  /** Production build: emit rewritten HTML + hashed chunks to the out dir. */
  build(): Promise<void> {
    return this.binding.projectBuild(this.native)
  }

  shutdown(): Promise<void> {
    return this.binding.projectShutdown(this.native)
  }
}

export async function createProject(
  options: NapiProjectOptions
): Promise<Project> {
  const binding = loadBinding()
  const native = await binding.projectNew(options)
  return new Project(binding, native)
}

export { defineConfig } from './config'
export type { TurbopackConfig } from './config'
export type { NapiBuildInfo, NapiProjectOptions }
