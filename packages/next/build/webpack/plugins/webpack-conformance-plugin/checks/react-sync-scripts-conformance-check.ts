import {
  IWebpackConformanceTest,
  IGetAstNodeResult,
  IParsedModuleDetails,
  IConformanceTestResult,
  IConformanceTestStatus,
} from '../TestInterface'
import {
  CONFORMANCE_ERROR_PREFIX,
  CONFORMANCE_WARNING_PREFIX,
} from '../constants'
// eslint-disable-next-line import/no-extraneous-dependencies
import { namedTypes } from 'ast-types/'
// eslint-disable-next-line import/no-extraneous-dependencies
import { NodePath } from 'ast-types/lib/node-path'
import { getLocalFileName } from '../utils/file-utils'
import { isNodeCreatingScriptElement } from '../utils/ast-utils'
export const ErrorMessage: string = `${CONFORMANCE_ERROR_PREFIX}: A sync script was found in a react module.`
export const WarningMessage: string = `${CONFORMANCE_WARNING_PREFIX}: A sync script was found in a react module.`
export const ErrorDescription = ``
const EARLY_EXIT_SUCCESS_RESULT: IConformanceTestResult = {
  result: IConformanceTestStatus.SUCCESS,
}

export interface ReactSyncScriptsConformanceCheckOptions {
  AllowedSources?: String[]
}
export class ReactSyncScriptsConformanceCheck
  implements IWebpackConformanceTest {
  private allowedSources: String[] = []
  constructor({
    AllowedSources,
  }: ReactSyncScriptsConformanceCheckOptions = {}) {
    if (AllowedSources) {
      this.allowedSources = AllowedSources
    }
  }

  public getAstNode(): IGetAstNodeResult[] {
    return [
      {
        visitor: 'visitCallExpression',
        inspectNode: (path: NodePath, { request }: IParsedModuleDetails) => {
          const { node }: { node: namedTypes.CallExpression } = path
          if (!node.arguments || node.arguments.length < 2) {
            return EARLY_EXIT_SUCCESS_RESULT
          }
          if (isNodeCreatingScriptElement(node)) {
            const propsNode = node.arguments[1] as namedTypes.ObjectExpression
            if (!propsNode.properties) {
              return EARLY_EXIT_SUCCESS_RESULT
            }
            const props: {
              [key: string]: string
            } = propsNode.properties.reduce((originalProps, prop: any) => {
              // @ts-ignore
              originalProps[prop.key.name] = prop.value.value
              return originalProps
            }, {})
            if (
              'defer' in props ||
              'async' in props ||
              !('src' in props) ||
              this.allowedSources.includes(props.src)
            ) {
              return EARLY_EXIT_SUCCESS_RESULT
            }

            // Todo: Add an absolute error case for modern js when class is a subclass of next/head.
            return {
              result: IConformanceTestStatus.FAILED,
              warnings: [
                {
                  message: `${WarningMessage} ${getLocalFileName(
                    request
                  )}. This can potentially delay FCP/FP metrics.`,
                },
              ],
            }
          }
          return EARLY_EXIT_SUCCESS_RESULT
        },
      },
    ]
  }
}
