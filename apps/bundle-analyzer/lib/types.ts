export interface FileNode {
  id: number
  name: string
  type: 'file'
  size: number
  outputType: 'code' | 'css' | 'asset'
  server: boolean
  client: boolean
  dependencies: number[]
  dependents: number[]
}

export interface DirectoryNode {
  id: number
  name: string
  type: 'directory'
  children: TreeNode[]
  size?: number
}

export type TreeNode = FileNode | DirectoryNode

interface Route {
  page: string
  regex: string
  routeKeys?: Record<string, string>
  namedRegex?: string
}

export interface RouteManifest {
  version: number
  pages: Record<string, string>
  staticRoutes: Array<Route>
  dynamicRoutes: Array<Route>
}

export enum SpecialModule {
  POLYFILL_MODULE,
  POLYFILL_NOMODULE,
}
