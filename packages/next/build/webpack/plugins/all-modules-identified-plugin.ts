import { Compiler, Plugin } from 'webpack'
import { createHash } from 'crypto'
import escapeRegex from 'escape-string-regexp'
import path from 'path'

function getRawModuleIdentifier(m: any, dir: string) {
  // webpack impl:
  // new RawModule(
  //   "/* (ignored) */",
  //   `ignored ${context} ${request}`,
  //   `${request} (ignored)`
  // )

  let request = m.readableIdentifierStr.replace(/ \(ignored\)$/, '')
  let context = m.identifierStr
    .match(new RegExp(`^ignored (.*) ${escapeRegex(request)}$`))
    .pop()

  if (path.isAbsolute(request)) {
    request = path.relative(dir, request)
  }
  if (path.isAbsolute(context)) {
    context = path.relative(dir, context)
  }

  const identifier = `${context}::${request}`
  console.warn(
    `[module identifier] RawModule ${m.identifier()} => ${identifier}`
  )
  return identifier
}

function getMultiModuleIdentifier(m: any) {
  const mods = m.dependencies.map((d: any) => d.module)
  if (mods.some((d: any) => !Boolean(d))) {
    throw new Error('Cannot handle a MultiModule with moduleless dependencies')
  }

  const ids = mods.map((m: any) => m.id)
  if (ids.some((i: any) => !Boolean(i))) {
    throw new Error(
      'Cannot handle a MultiModule dependency without a module id'
    )
  }

  const identifier = ids.sort().join('::')
  console.warn(
    `[module identifier] MultiModule ${m.identifier()} => ${identifier}`
  )
  return identifier
}

export class AllModulesIdentifiedPlugin implements Plugin {
  private dir: string

  constructor(dir: string) {
    this.dir = dir
  }

  apply(compiler: Compiler) {
    compiler.hooks.compilation.tap(
      'AllModulesIdentifiedPlugin',
      compilation => {
        compilation.hooks.beforeModuleIds.tap(
          'AllModulesIdentifiedPlugin',
          modules => {
            ;(modules as any[]).forEach(m => {
              if (m.id != null) {
                return
              }

              let identifier: string
              if (m.constructor && m.constructor.name === 'RawModule') {
                identifier = getRawModuleIdentifier(m, this.dir)
              } else if (
                m.constructor &&
                m.constructor.name === 'MultiModule'
              ) {
                identifier = getMultiModuleIdentifier(m)
              } else {
                throw new Error(
                  `Do not know how to handle module: ${
                    m.name
                  }, ${m.identifier && m.identifier()}, ${
                    m.type
                  }, ${m.constructor && m.constructor.name}`
                )
              }

              // This hashing algorithm is consistent with how the rest of
              // webpack does it (n.b. HashedModuleIdsPlugin)
              m.id = createHash('md4')
                .update(identifier)
                .digest('hex')
                .substr(0, 4)
            })
          }
        )
      }
    )
  }
}
