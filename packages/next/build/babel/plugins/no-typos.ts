import {
  PluginObj,
  types as BabelTypes,
  NodePath,
} from 'next/dist/compiled/babel/core'

import {
  SERVER_PROPS_ID,
  STATIC_PROPS_ID,
} from '../../../next-server/lib/constants'

const NEXT_EXPORT_FUNCTIONS = [
  'getStaticProps',
  'getStaticPaths',
  'getServerSideProps',
]

// 0 is the exact match
const THRESHOLD = 1

// the minimum number of operations required to convert string a to string b.
function minDistance(a: string, b: string): number {
  const m = a.length
  const n = b.length

  if (m < n) {
    return minDistance(b, a)
  }

  if (n === 0) {
    return m
  }

  let previousRow = Array.from({ length: n + 1 }, (_, i) => i)

  for (let i = 0; i < m; i++) {
    const s1 = a[i]
    let currentRow = [i + 1]
    for (let j = 0; j < n; j++) {
      const s2 = b[j]
      const insertions = previousRow[j + 1] + 1
      const deletions = currentRow[j] + 1
      const substitutions = previousRow[j] + Number(s1 !== s2)
      currentRow.push(Math.min(insertions, deletions, substitutions))
    }
    previousRow = currentRow
  }
  return previousRow[previousRow.length - 1]
}

function checkTypos(name: string) {
  if (name === SERVER_PROPS_ID || name === STATIC_PROPS_ID) {
    return
  }

  const potentialTypos = NEXT_EXPORT_FUNCTIONS.map((o) => ({
    option: o,
    distance: minDistance(o, name),
  }))
    .filter(({ distance }) => distance <= THRESHOLD && distance > 0)
    .sort((a, b) => a.distance - b.distance)

  if (potentialTypos.length) {
    throw new Error(
      `${name} may be a typo. Did you mean ${potentialTypos[0].option}?`
    )
  }
}

export default function NoTypos(): PluginObj<any> {
  return {
    visitor: {
      Program: {
        enter(path, state) {
          path.traverse(
            {
              ExportNamedDeclaration(exportNamedPath) {
                const decl = exportNamedPath.get('declaration') as NodePath<
                  | BabelTypes.FunctionDeclaration
                  | BabelTypes.VariableDeclaration
                >
                if (decl == null || decl.node == null) {
                  return
                }
                switch (decl.node.type) {
                  case 'FunctionDeclaration': {
                    const name = decl.node.id!.name
                    checkTypos(name)
                    break
                  }
                  case 'VariableDeclaration': {
                    const inner = decl.get('declarations') as NodePath<
                      BabelTypes.VariableDeclarator
                    >[]
                    inner.forEach((d) => {
                      if (d.node.id.type !== 'Identifier') {
                        return
                      }
                      const name = d.node.id.name
                      checkTypos(name)
                    })
                    break
                  }
                  default: {
                    break
                  }
                }
              },
            },
            state
          )
        },
      },
    },
  }
}
