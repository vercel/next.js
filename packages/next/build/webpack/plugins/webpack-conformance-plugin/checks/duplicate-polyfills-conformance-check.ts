// eslint-disable-next-line import/no-extraneous-dependencies
import { namedTypes } from 'ast-types'
// eslint-disable-next-line import/no-extraneous-dependencies
import { NodePath } from 'ast-types/lib/node-path'
import { types } from 'next/dist/compiled/recast'
import {
  CONFORMANCE_ERROR_PREFIX,
  CONFORMANCE_WARNING_PREFIX,
} from '../constants'
import {
  IConformanceTestResult,
  IConformanceTestStatus,
  IGetAstNodeResult,
  IParsedModuleDetails,
  IWebpackConformanceTest,
} from '../TestInterface'
import {
  isNodeCreatingScriptElement,
  reducePropsToObject,
} from '../utils/ast-utils'
import { getLocalFileName } from '../utils/file-utils'

function getMessage(
  property: string,
  request: string,
  isWarning: Boolean = false
): string {
  if (isWarning) {
    return `${CONFORMANCE_WARNING_PREFIX}: Found a ${property} polyfill in ${getLocalFileName(
      request
    )}.`
  }
  return `${CONFORMANCE_ERROR_PREFIX}: Found a ${property} polyfill in ${getLocalFileName(
    request
  )}.`
}

export interface DuplicatePolyfillsConformanceTestSettings {
  BlockedAPIToBePolyfilled?: string[]
}

const BANNED_LEFT_OBJECT_TYPES = ['Identifier', 'ThisExpression']

export class DuplicatePolyfillsConformanceCheck
  implements IWebpackConformanceTest {
  private BlockedAPIs: string[] = []
  constructor(options: DuplicatePolyfillsConformanceTestSettings = {}) {
    this.BlockedAPIs = options.BlockedAPIToBePolyfilled || []
  }
  public getAstNode(): IGetAstNodeResult[] {
    const EARLY_EXIT_SUCCESS_RESULT: IConformanceTestResult = {
      result: IConformanceTestStatus.SUCCESS,
    }
    return [
      {
        visitor: 'visitAssignmentExpression',
        inspectNode: (
          path: NodePath<namedTypes.AssignmentExpression>,
          { request }: IParsedModuleDetails
        ): IConformanceTestResult => {
          const { node } = path
          const left = node.left as namedTypes.MemberExpression
          /**
           * We're only interested in code like `foo.fetch = bar;`.
           * For anything else we exit with a success.
           * Also foo in foo.bar needs to be either Identifier or `this` and not someFunction().fetch;
           */
          if (
            left.type !== 'MemberExpression' ||
            !BANNED_LEFT_OBJECT_TYPES.includes(left.object.type) ||
            left.property.type !== 'Identifier'
          ) {
            return EARLY_EXIT_SUCCESS_RESULT
          }
          if (!this.BlockedAPIs.includes(left.property.name)) {
            return EARLY_EXIT_SUCCESS_RESULT
          }
          /**
           * Here we know the code is `foo.(fetch/URL) = something.
           * If foo === this/self, fail it immediately.
           * check for this.[fetch|URL(...BlockedAPIs)]/ self.[fetch|URL(...BlockedAPIs)]
           **/
          if (isNodeThisOrSelf(left.object)) {
            return {
              result: IConformanceTestStatus.FAILED,
              warnings: [
                {
                  message: getMessage(left.property.name, request),
                },
              ],
            }
          }
          /**
           * we now are sure the code under examination is
           * `globalVar.[fetch|URL(...BlockedAPIs)] = something`
           **/
          const objectName = (left.object as namedTypes.Identifier).name
          const allBindings = path.scope.lookup(objectName)
          if (!allBindings) {
            /**
             * we have absolutely no idea where globalVar came from,
             * so lets just exit
             **/
            return EARLY_EXIT_SUCCESS_RESULT
          }

          try {
            const sourcePath = allBindings.bindings[objectName][0]
            const originPath = sourcePath.parentPath
            const {
              node: originNode,
            }: { node: namedTypes.VariableDeclarator } = originPath
            if (
              originNode.type === 'VariableDeclarator' &&
              isNodeThisOrSelf(originNode.init)
            ) {
              return {
                result: IConformanceTestStatus.FAILED,
                warnings: [
                  {
                    message: getMessage(left.property.name, request),
                  },
                ],
              }
            }
            if (
              originPath.name === 'params' &&
              originPath.parentPath.firstInStatement()
            ) {
              /**
               * We do not know what will be the value of this param at runtime so we just throw a warning.
               * ```
               * (function(scope){
               *  ....
               *  scope.fetch = new Fetch();
               * })(.....)
               * ```
               */
              return {
                result: IConformanceTestStatus.FAILED,
                warnings: [
                  {
                    message: getMessage(left.property.name, request, true),
                  },
                ],
              }
            }
          } catch (e) {
            return EARLY_EXIT_SUCCESS_RESULT
          }

          return EARLY_EXIT_SUCCESS_RESULT
        },
      },
      {
        visitor: 'visitCallExpression',
        inspectNode: (path: NodePath) => {
          const { node }: { node: types.namedTypes.CallExpression } = path
          if (!node.arguments || node.arguments.length < 2) {
            return EARLY_EXIT_SUCCESS_RESULT
          }
          if (isNodeCreatingScriptElement(node)) {
            const propsNode = node
              .arguments[1] as types.namedTypes.ObjectExpression
            if (!propsNode.properties) {
              return EARLY_EXIT_SUCCESS_RESULT
            }
            const props: {
              [key: string]: string
            } = reducePropsToObject(propsNode)
            if (!('src' in props)) {
              return EARLY_EXIT_SUCCESS_RESULT
            }
            const foundBannedPolyfill = doesScriptLoadBannedAPIfromPolyfillIO(
              props.src,
              this.BlockedAPIs
            )
            if (foundBannedPolyfill) {
              return {
                result: IConformanceTestStatus.FAILED,
                warnings: [
                  {
                    message: `${CONFORMANCE_WARNING_PREFIX}: Found polyfill.io loading polyfill for ${foundBannedPolyfill}.`,
                  },
                ],
              }
            }
          }
          return EARLY_EXIT_SUCCESS_RESULT
        },
      },
    ]
  }
}

function isNodeThisOrSelf(node: any): boolean {
  return (
    node.type === 'ThisExpression' ||
    (node.type === 'Identifier' && node.name === 'self')
  )
}

function doesScriptLoadBannedAPIfromPolyfillIO(
  source: string,
  blockedAPIs: string[]
): string | undefined {
  const url = new URL(source)
  if (url.hostname === 'polyfill.io' && url.searchParams.has('features')) {
    const requestedAPIs = (url.searchParams.get('features') || '').split(',')
    return blockedAPIs.find((api) => requestedAPIs.includes(api))
  }
}
