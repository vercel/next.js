// eslint-disable-next-line import/no-extraneous-dependencies
import { NodePath } from 'ast-types/lib/node-path'

export interface IConformanceAnomaly {
  message: string
  stack_trace?: string
}

// eslint typescript has a bug with TS enums
/* eslint-disable no-shadow */
export enum IConformanceTestStatus {
  SUCCESS,
  FAILED,
}
export interface IConformanceTestResult {
  result: IConformanceTestStatus
  warnings?: Array<IConformanceAnomaly>
  errors?: Array<IConformanceAnomaly>
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

export interface IWebpackConformanceTest {
  buildStared?: (options: any) => IConformanceTestResult
  getAstNode?: () => IGetAstNodeResult[]
  buildCompleted?: (assets: any) => IConformanceTestResult
}
