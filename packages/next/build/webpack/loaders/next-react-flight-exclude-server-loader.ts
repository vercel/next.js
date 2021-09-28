// Exclude all server modules in the client bundle.

import * as acorn from 'acorn'

async function parseExportNamesInto(
  transformedSource: string,
  imports: Array<string>
): Promise<void> {
  const { body } = acorn.parse(transformedSource, {
    ecmaVersion: 2019,
    sourceType: 'module',
  }) as any
  for (let i = 0; i < body.length; i++) {
    const node = body[i]
    switch (node.type) {
      case 'ImportDeclaration':
        // When importing from a server component, ignore
        if (!/\.client(\.(js|ts)x?)?/.test(node.source.value)) {
          continue
        }

        let defaultNode = null
        let otherNodes = []

        for (let specifier of node.specifiers) {
          if (specifier.type === 'ImportDefaultSpecifier') {
            defaultNode = specifier.local.name
          } else {
            otherNodes.push(specifier.local.name)
          }
        }

        imports.push(
          `import ${defaultNode ? defaultNode : ''}${
            defaultNode && otherNodes.length ? ',' : ''
          }${otherNodes.length ? `{${otherNodes.join(',')}}` : ''} from '${
            node.source.value
          }'`
        )
        continue
    }
  }
}

export default async function transformSource(source: string): Promise<string> {
  const transformedSource = source
  if (typeof transformedSource !== 'string') {
    throw new Error('Expected source to have been transformed to a string.')
  }

  const imports: string[] = []
  await parseExportNamesInto(transformedSource, imports)

  return imports.join('\n') + '\nexport default () => {}'
}
