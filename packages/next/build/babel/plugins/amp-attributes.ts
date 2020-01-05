import { NodePath, PluginObj } from '@babel/core'
import { JSXOpeningElement } from '@babel/types'

export default function AmpAttributePatcher(...args: any): PluginObj {
  return {
    visitor: {
      JSXOpeningElement(path: NodePath<JSXOpeningElement>) {
        const openingElement = path.node

        const { name, attributes } = openingElement
        if (!(name && name.type === 'JSXIdentifier')) {
          return
        }

        if (!name.name.startsWith('amp-')) {
          return
        }

        for (const attribute of attributes) {
          if (attribute.type !== 'JSXAttribute') {
            continue
          }

          if (attribute.name.name === 'className') {
            attribute.name.name = 'class'
          }
        }
      },
    },
  }
}
