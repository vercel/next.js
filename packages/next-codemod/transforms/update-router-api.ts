/*
 * One-time usage file. You can delete me after running the codemod!
 * - rename as JSX attr of Link JSX Element to href
 * - remove the as argument in router.push
 * - remove the as argument in router.replace
 */

const generateNodeIdentifier = (name, type = '') => {
  if (name.includes('.')) {
    const [object, ...property] = name.split('.')
    return {
      type: `${type}MemberExpression`,
      object: generateNodeIdentifier(object, type),
      property: generateNodeIdentifier(property.join('.'), type),
    }
  }
  return {
    type: `${type}Identifier`,
    name: name,
  }
}
export default (fileInfo, api) => {
  const j = api.jscodeshift
  const root = j(fileInfo.source)
  // Set to true if we want to rewrite the file
  let hasModifications
  // Get the import line of next/link
  const importDeclaration = root.find(j.ImportDeclaration, {
    source: {
      value: 'next/link',
    },
  })
  const importLink = importDeclaration.find(j.Identifier)

  if (importLink.length) {
    // Get the Link component name (mostly Link)
    const localName = importLink.get(0).node.name

    // Find the Instance of <Link> in the JSX
    root
      .find(j.JSXElement, {
        openingElement: {
          name: {
            name: localName,
          },
        },
      })
      .replaceWith((path) => {
        const { node } = path
        // get the as node
        const asAttr = node.openingElement.attributes.find(
          (attr) => attr.name && attr.name.name === 'as'
        )
        // get the href node
        const hrefAttr = node.openingElement.attributes.find(
          (attr) => attr.name && attr.name.name === 'href'
        )

        // Swap attrs values of href and as
        if (asAttr && hrefAttr) {
          hasModifications = true
          hrefAttr.value = asAttr.value

          // Remove as attr
          node.openingElement.attributes = node.openingElement.attributes.filter(
            (attr) => attr.name.name !== 'as'
          )
        }
        return node
      })
  }
  const importRouterDeclaration = root.find(j.ImportDeclaration, {
    source: {
      value: 'next/router',
    },
  })
  const importRouter = importRouterDeclaration.find(j.Identifier)

  if (importRouter.length) {
    root
      .find(j.CallExpression, {
        callee: generateNodeIdentifier('router.push'),
      })
      .replaceWith((path) => {
        // extract the node from the path
        const { node } = path

        // Check if router.push have more than 1 argument
        if (node.arguments && node.arguments.length > 1) {
          // We want to rewrite the file
          hasModifications = true
          // Remove the first argument
          node.arguments = node.arguments.slice(1)
        }
        return node
      })
    root
      .find(j.CallExpression, {
        callee: generateNodeIdentifier('Router.push'),
      })
      .replaceWith((path) => {
        // extract the node from the path
        const { node } = path

        // Check if router.push have more than 1 argument
        if (node.arguments && node.arguments.length > 1) {
          // We want to rewrite the file
          hasModifications = true
          // Remove the first argument
          node.arguments = node.arguments.slice(1)
        }
        return node
      })
    root
      .find(j.CallExpression, {
        callee: {
          type: 'MemberExpression',
          object: {
            type: 'MemberExpression',
            object: {
              type: 'MemberExpression',
              object: {
                type: 'ThisExpression',
              },
              property: {
                type: 'Identifier',
                name: 'props',
              },
            },
            property: {
              type: 'Identifier',
              name: 'router',
            },
          },
          property: {
            type: 'Identifier',
            name: 'push',
          },
        },
      })
      .replaceWith((path) => {
        // extract the node from the path
        const { node } = path

        // Check if router.push have more than 1 argument
        if (node.arguments && node.arguments.length > 1) {
          // We want to rewrite the file
          hasModifications = true
          // Remove the first argument
          node.arguments = node.arguments.slice(1)
        }
        return node
      })
    root
      .find(j.CallExpression, {
        callee: {
          type: 'MemberExpression',
          object: {
            type: 'MemberExpression',
            object: {
              type: 'MemberExpression',
              object: {
                type: 'ThisExpression',
              },
              property: {
                type: 'Identifier',
                name: 'props',
              },
            },
            property: {
              type: 'Identifier',
              name: 'router',
            },
          },
          property: {
            type: 'Identifier',
            name: 'replace',
          },
        },
      })
      .replaceWith((path) => {
        // extract the node from the path
        const { node } = path

        // Check if router.replace have more than 1 argument
        if (node.arguments && node.arguments.length > 1) {
          // We want to rewrite the file
          hasModifications = true
          // Remove the first argument
          node.arguments = node.arguments.slice(1)
        }
        return node
      })
    root
      .find(j.CallExpression, {
        callee: generateNodeIdentifier('Router.replace'),
      })
      .replaceWith((path) => {
        // extract the node from the path
        const { node } = path

        // Check if router.replace have more than 1 argument
        if (node.arguments && node.arguments.length > 1) {
          // We want to rewrite the file
          hasModifications = true
          // Remove the first argument
          node.arguments = node.arguments.slice(1)
        }
        return node
      })
    root
      .find(j.CallExpression, {
        callee: {},
      })
      .replaceWith((path) => {
        // extract the node from the path
        const { node } = path

        // Check if router.replace have more than 1 argument
        if (node.arguments && node.arguments.length > 1) {
          // We want to rewrite the file
          hasModifications = true
          // Remove the first argument
          node.arguments = node.arguments.slice(1)
        }
        return node
      })
  }
  // Rewrite the file only if you make changes
  return hasModifications ? root.toSource() : null
}
