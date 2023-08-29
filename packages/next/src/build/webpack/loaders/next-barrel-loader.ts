import type webpack from 'webpack'

const NextBarrelLoader = async function (
  this: webpack.LoaderContext<{
    names: string[]
    wildcard: boolean
  }>
) {
  this.async()
  const { names, wildcard } = this.getOptions()

  const source = await new Promise<string>((resolve, reject) => {
    this.loadModule(
      `__barrel_transform__${wildcard ? '?wildcard' : ''}!=!${
        this.resourcePath
      }`,
      (err, src) => {
        if (err) {
          reject(err)
        } else {
          resolve(src)
        }
      }
    )
  })

  const matches = source.match(
    /^([^]*)export const __next_private_export_map__ = '([^']+)'/
  )

  if (!matches) {
    // This file isn't a barrel and we can't apply any optimizations. Let's re-export everything.
    // Since this loader accepts `names` and the request is keyed with `names`, we can't simply
    // return the original source here. That will create these imports with different names as
    // different modules instances.
    this.callback(null, `export * from ${JSON.stringify(this.resourcePath)}`)
    return
  }

  const wildcardExports = [...source.matchAll(/export \* from "([^"]+)"/g)]

  const prefix = matches[1]
  const exportList = JSON.parse(matches[2]) as [string, string, string][]
  const exportMap = new Map<string, [string, string]>()
  for (const [name, path, orig] of exportList) {
    exportMap.set(name, [path, orig])
  }

  let output = prefix
  let missedNames: string[] = []
  for (const name of names) {
    // If the name matches
    if (exportMap.has(name)) {
      const decl = exportMap.get(name)!

      // In the wildcard case, all exports are from the file itself.
      if (wildcard) {
        decl[0] = this.resourcePath
        decl[1] = name
      }

      if (decl[1] === '*') {
        output += `\nexport * as ${name} from ${JSON.stringify(decl[0])}`
      } else if (decl[1] === 'default') {
        output += `\nexport { default as ${name} } from ${JSON.stringify(
          decl[0]
        )}`
      } else if (decl[1] === name) {
        output += `\nexport { ${name} } from ${JSON.stringify(decl[0])}`
      } else {
        output += `\nexport { ${decl[1]} as ${name} } from ${JSON.stringify(
          decl[0]
        )}`
      }
    } else {
      missedNames.push(name)
    }
  }

  // These are from wildcard exports.
  if (missedNames.length > 0) {
    for (const match of wildcardExports) {
      const path = match[1]

      output += `\nexport * from ${JSON.stringify(
        path.replace('__PLACEHOLDER__', missedNames.join(',') + '&wildcard')
      )}`
    }
  }

  this.callback(null, output)
}

export default NextBarrelLoader
