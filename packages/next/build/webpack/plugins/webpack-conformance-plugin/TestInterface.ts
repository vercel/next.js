import { NodePath } from 'ast-types/lib/node-path'

export interface IConformanceAnamoly {
  message: string
  stack_trace?: string
}

export interface IConformanceTestResult {
  result: 'SUCCESS' | 'FAILED'
  warnings?: Array<IConformanceAnamoly>
  errors?: Array<IConformanceAnamoly>
}

export interface IParsedModuleDetails {
  request: string
}

export type NodeInspector = (
  node: NodePath,
  details: IParsedModuleDetails
) => IConformanceTestResult

export interface IGetAstNodeResult {
  visitor: string
  inspectNode: NodeInspector
}

export interface IWebpackConformanctTest {
  buildStared?: (options: any) => IConformanceTestResult
  getAstNode?: () => IGetAstNodeResult[]
  buildCompleted?: (assets: any) => IConformanceTestResult
}
