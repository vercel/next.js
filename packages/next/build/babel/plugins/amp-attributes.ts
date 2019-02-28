import { PluginObj } from '@babel/core'
import { NodePath } from '@babel/traverse'
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
          if (
            attribute.type !== 'JSXAttribute' ||
            typeof attribute.name.name !== 'string'
          ) {
            continue
          }

          switch (attribute.name.name) {
            case 'className':
              attribute.name.name = 'class'
              break
            case 'htmlFor':
              attribute.name.name = 'for'
              break
          }
        }
      },
    },
  }
}
