/*
 * This codemod transforms the experimental turbo configuration in Next.js config to
 * the new top-level `turbopack` configuration.
 *
 * It moves most properties from experimental.turbo to the top-level turbopack
 * property, with special handling for certain properties like memoryLimit, minify,
 * treeShaking, and sourceMaps which become experimental.turbopack* properties instead.
 */

import type {
  API as JSCodeShiftAPI,
  Options as JSCodeShiftOptions,
  FileInfo,
  ObjectExpression,
  Property,
  ObjectProperty,
  SpreadElement,
  SpreadProperty,
  ObjectMethod,
} from 'jscodeshift'
import { createParserFromPath } from '../lib/parser'
import { isNextConfigFile } from './lib/utils'

// Properties that need to be moved to experimental.turbopack*
const RENAMED_EXPERIMENTAL_PROPERTIES = {
  memoryLimit: 'turbopackMemoryLimit',
  minify: 'turbopackMinify',
  treeShaking: 'turbopackTreeShaking',
  sourceMaps: 'turbopackSourceMaps',
}

export default function transformer(
  file: FileInfo,
  _api: JSCodeShiftAPI,
  options: JSCodeShiftOptions
): string {
  const j = createParserFromPath(file.path)
  const root = j(file.source)
  let hasChanges = false

  if (
    !isNextConfigFile(file) &&
    process.env.NODE_ENV !== 'test' // fixtures have unique basenames in test
  ) {
    return file.source
  }

  // Process a config object once we find it
  function processConfigObject(configObj: ObjectExpression): boolean {
    // Check for `experimental` property in the config
    const experimentalProp = configObj.properties.find(
      (prop) =>
        isStaticProperty(prop) &&
        prop.key &&
        prop.key.type === 'Identifier' &&
        prop.key.name === 'experimental'
    )

    if (!experimentalProp || !isStaticProperty(experimentalProp)) {
      return false
    }

    const experimentalObj = experimentalProp.value
    if (experimentalObj.type !== 'ObjectExpression') {
      return false
    }

    // Check for `experimental.turbo` property in the config
    const turboProp = experimentalObj.properties.find(
      (prop) =>
        isStaticProperty(prop) &&
        prop.key &&
        prop.key.type === 'Identifier' &&
        prop.key.name === 'turbo'
    )

    if (!turboProp || !isStaticProperty(turboProp)) {
      return false
    }

    const turboObj = turboProp.value
    if (turboObj.type !== 'ObjectExpression') {
      return false
    }

    const regularProps = []
    const specialProps = []

    turboObj.properties.forEach((prop) => {
      if (
        isStaticProperty(prop) &&
        prop.key &&
        prop.key.type === 'Identifier' &&
        RENAMED_EXPERIMENTAL_PROPERTIES[prop.key.name]
      ) {
        // Create a new property with the renamed key
        specialProps.push(
          j.objectProperty(
            j.identifier(RENAMED_EXPERIMENTAL_PROPERTIES[prop.key.name]),
            prop.value
          )
        )
      } else {
        // Keep the property for turbopack
        regularProps.push(prop)
      }
    })

    const existingProps = experimentalObj.properties.filter(
      (prop) =>
        !(
          isStaticProperty(prop) &&
          prop.key &&
          prop.key.type === 'Identifier' &&
          prop.key.name === 'turbo'
        )
    )

    experimentalObj.properties = [...existingProps, ...specialProps]

    // If experimental has no properties, remove it
    if (experimentalObj.properties.length === 0) {
      configObj.properties = configObj.properties.filter(
        (prop) =>
          !(
            isStaticProperty(prop) &&
            prop.key &&
            prop.key.type === 'Identifier' &&
            prop.key.name === 'experimental'
          )
      )
    }

    // Add turbopack property at top level if there are regular props
    if (regularProps.length > 0) {
      // Create the turbopack property
      const turbopackProp = j.objectProperty(
        j.identifier('turbopack'),
        j.objectExpression(regularProps)
      )

      configObj.properties.push(turbopackProp)
    }

    return true
  }

  root.find(j.ObjectExpression).forEach((path) => {
    if (processConfigObject(path.value)) {
      hasChanges = true
    }
  })

  // Transform config.experimental.turbo.X = value to config.turbopack.X = value
  // or config.experimental.turbopackX = value for special properties
  root
    .find(j.AssignmentExpression, {
      left: {
        type: 'MemberExpression',
        object: {
          type: 'MemberExpression',
          object: {
            type: 'MemberExpression',
            property: { type: 'Identifier', name: 'experimental' },
          },
          property: { type: 'Identifier', name: 'turbo' },
        },
      },
    })
    .forEach((path) => {
      if (path.node.left.type !== 'MemberExpression') return

      // Get the variable name (e.g., config in config.experimental.turbo.sourceMaps)
      let varName = null
      let currentPath = path.node.left.object
      while (currentPath?.type === 'MemberExpression') {
        currentPath = currentPath.object
      }
      if (currentPath?.type === 'Identifier') {
        varName = currentPath.name
      }

      if (!varName) return

      // Get the property name being assigned (e.g., sourceMaps)
      let propName: string | undefined = undefined
      if (
        path.node.left.property &&
        path.node.left.property.type === 'Identifier'
      ) {
        propName = path.node.left.property.name
      } else {
        return
      }

      // For special properties like memoryLimit, minify, etc.
      if (propName && RENAMED_EXPERIMENTAL_PROPERTIES[propName]) {
        const newAssignment = j.assignmentExpression(
          '=',
          j.memberExpression(
            j.memberExpression(
              j.identifier(varName),
              j.identifier('experimental')
            ),
            j.identifier(RENAMED_EXPERIMENTAL_PROPERTIES[propName])
          ),
          path.node.right
        )

        j(path).replaceWith(newAssignment)
        hasChanges = true
      } else if (propName) {
        // Create new assignment: config.turbopack.propName = value
        const newAssignment = j.assignmentExpression(
          '=',
          j.memberExpression(
            j.memberExpression(
              j.identifier(varName),
              j.identifier('turbopack')
            ),
            j.identifier(propName)
          ),
          path.node.right
        )

        j(path).replaceWith(newAssignment)
        hasChanges = true
      }
    })

  // For nested property assignments like config.experimental.turbo.resolveAlias.foo = 'bar';
  root.find(j.AssignmentExpression).forEach((path) => {
    if (path.node.left.type !== 'MemberExpression') return

    // Build a path to check if this is like `experimental.turbo.resolveAlias.foo`
    let obj = path.node.left.object
    let props = []

    // Collect the property chain
    while (obj && obj.type === 'MemberExpression') {
      if (obj.property && obj.property.type === 'Identifier') {
        props.unshift(obj.property.name)
      }
      obj = obj.object
    }

    // Get the root variable name (e.g., 'config')
    let varName = null
    if (obj && obj.type === 'Identifier') {
      varName = obj.name
    }

    if (!varName) return

    // Check if this matches the pattern: config.experimental.turbo.resolveAlias.foo
    if (
      props.length >= 3 &&
      props[0] === 'experimental' &&
      props[1] === 'turbo'
    ) {
      // Get the final property name, only if it's an Identifier
      let finalProp: string | undefined = undefined
      if (
        path.node.left.property &&
        path.node.left.property.type === 'Identifier'
      ) {
        finalProp = path.node.left.property.name
      } else {
        // If not an Identifier, skip this assignment
        return
      }

      // The properties after 'turbo'
      const middleProps = props.slice(2) // e.g. ['resolveAlias']

      // Start building the new left side: config.turbopack
      let newLeft = j.memberExpression(
        j.identifier(varName),
        j.identifier('turbopack')
      )

      // Add the middle properties
      for (const prop of middleProps) {
        newLeft = j.memberExpression(newLeft, j.identifier(prop))
      }

      // Add the final property
      newLeft = j.memberExpression(newLeft, j.identifier(finalProp))

      const newAssignment = j.assignmentExpression(
        '=',
        newLeft,
        path.node.right
      )

      j(path).replaceWith(newAssignment)
      hasChanges = true
    }
  })

  // Only return a string if we changed the AST, otherwise return the original source
  return hasChanges ? root.toSource(options) : file.source
}

function isStaticProperty(
  prop:
    | Property
    | ObjectProperty
    | SpreadElement
    | SpreadProperty
    | ObjectMethod
): prop is Property | ObjectProperty {
  return prop.type === 'Property' || prop.type === 'ObjectProperty'
}
