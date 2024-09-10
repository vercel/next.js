import type { API, Collection, FileInfo, Core, ASTPath, ExportDefaultDeclaration } from 'jscodeshift'

function isPageOrLayoutFile(filename: string) {
  return /[\\/](page|layout)\.j|tsx?/.test(filename)
}

function insertReactUseImport(root: Collection<any>, j: API['j']) {
  const hasReactUseImport =
    root
      .find(j.ImportSpecifier, {
        imported: {
          type: 'Identifier',
          name: 'use',
        },
      })
      .size() > 0

  if (!hasReactUseImport) {
    const reactImportDeclaration = root.find(j.ImportDeclaration, {
      source: {
        type: 'Literal',
        value: 'react',
      },
    })

    if (reactImportDeclaration.size() > 0) {
      // Add 'use' to existing 'react' import declaration
      reactImportDeclaration
        .get()
        .node.specifiers.push(j.importSpecifier(j.identifier('use')))
    } else {
      // Create new import declaration for 'use' from 'react'
      const newImport = j.importDeclaration(
        [j.importSpecifier(j.identifier('use'))],
        j.literal('react')
      )

      // append after "use client" directive if there's any
      const clientDirectives = root.find(j.Literal, { value: 'use client' })
      if (clientDirectives.size() > 0) {
        const parent = clientDirectives.get().parentPath
        if (parent) {
          parent.insertAfter(newImport)
        } else {
          if (root.length > 0) {
            root.at(0).insertAfter(newImport)
          } else {
            root.get().node.program.body.unshift(newImport)
          }
        }
      } else {
        root.get().node.program.body.unshift(newImport)
      }
    }
  }
}

export default function transform(fileInfo: FileInfo, api: API) {
  const j = api.jscodeshift
  const root = j(fileInfo.source)
  const filename = fileInfo.path

  // Check if 'use' from 'react' needs to be imported
  let needsReactUseImport = false

  function processAsyncPropOfEntryFile(
    propName: 'params' | 'searchParams',
    isClientComponent: boolean
  ) {
    const asyncPropName =
      'async' + propName[0].toUpperCase() + propName.slice(1)

    console.log('propName:', propName, '->', asyncPropName, 'isClientComponent:', isClientComponent)

    // find `params` and `searchParams` in file, and transform the access to them
    function renameParamsToAsyncParams(path: ASTPath<ExportDefaultDeclaration>) {
      if (!('params' in path.value)) {
        return
      }
      const params = path.value.params
      // @ts-ignore
      if (params && params.length === 1 && j.ObjectPattern.check(params[0])) {
        const properties = params[0].properties
        if (
          properties.length === 1 &&
          'key' in properties[0] &&
          j.Identifier.check(properties[0].key) &&
          properties[0].key.name === propName
        ) {
          // Rename property
          // e.g. `params` to `asyncParams`
          // e.g. `searchParams` to `asyncSearchParams`
          properties[0] = j.objectProperty(
            j.identifier(propName),
            j.identifier(asyncPropName)
          )
        }
      }
    }

    // Helper function to insert `const params = await asyncParams;` at the beginning of the function body
    function insertAwaitAsyncParams(path) {
      if (!path.value.body) {
        return
      }
      const body = path.value.body.body
      const newStatement = j.variableDeclaration('const', [
        j.variableDeclarator(
          j.identifier(propName),
          j.awaitExpression(j.identifier(asyncPropName))
        ),
      ])
      body.unshift(newStatement)
    }

    if (!isClientComponent) {
      // Process Function Declarations
      const functionDeclarations = root
        .find(j.ExportDefaultDeclaration, {
          declaration: {
            type: 'FunctionDeclaration',
          },
        })
      
      console.log('functionDeclarations:', functionDeclarations.size())
      functionDeclarations.forEach((path) => {
          renameParamsToAsyncParams(path)
          insertAwaitAsyncParams(path)
        })

      // Process Arrow Function Expressions
      const arrowFunctions = root
      .find(j.ExportDefaultDeclaration, {
        declaration: {
          type: 'ArrowFunctionExpression',
        },
      })
        
      console.log('arrowFunctions:', arrowFunctions.size())
      arrowFunctions.forEach((path) => {
          renameParamsToAsyncParams(path)
          insertAwaitAsyncParams(path)
        })
    }
  }

  const isClientComponentFile =
    root.find(j.Literal, { value: 'use client' }).size() > 0

  // Only apply to layout or page files
  // if (!isPageOrLayoutFile(filename)) {
  //   return fileInfo.source
  // }
  processAsyncPropOfEntryFile('params', isClientComponentFile)
  processAsyncPropOfEntryFile('searchParams', isClientComponentFile)

  // Add import { use } from 'react' if needed and not already imported
  if (needsReactUseImport) {
    insertReactUseImport(root, j)
  }

  return root.toSource()
}
