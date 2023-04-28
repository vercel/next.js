import fs from 'fs/promises'

export class StaticRouteModuleNotFound extends Error {
  public constructor(id: string) {
    super(`Static route module "${id}" not found`)
  }
}

export class StaticRouteModuleLoader {
  public static async load(id: string): Promise<string> {
    if (process.env.NEXT_RUNTIME !== 'edge') {
      try {
        // Try to load the route module as a static `.html` file from the
        // filesystem.
        return await fs.readFile(id, 'utf8')
      } catch {
        throw new StaticRouteModuleNotFound(id)
      }
    }

    throw new Error('StaticRouteModuleLoader is not supported in edge runtime.')
  }
}
