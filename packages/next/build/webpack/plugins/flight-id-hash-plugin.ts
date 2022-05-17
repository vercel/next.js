// https://stackoverflow.com/questions/7616461/generate-a-hash-from-string-in-javascript
const cyrb53 = function (str: string, seed = 0x71421) {
  let h1 = 0xdeadbeef ^ seed,
    h2 = 0x41c6ce57 ^ seed
  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return 4294967296 * (2097151 & h2) + (h1 >>> 0)
}

export class FlightIdHashPlugin {
  apply(compiler: any) {
    const usedIds = new Set()
    const idMap = new Map()

    compiler.hooks.compilation.tap('FlightIdHashPlugin', (compilation: any) => {
      compilation.hooks.moduleIds.tap('FlightIdHashPlugin', (modules: any) => {
        const chunkGraph = compilation.chunkGraph
        const filteredModules = Array.from(modules).filter((m: any) => {
          if (!m.needId) return false
          if (chunkGraph.getNumberOfModuleChunks(m) === 0) return false
          return chunkGraph.getModuleId(module) === null
        })

        for (const module of filteredModules) {
          let request = (module as any).request || ''

          // Remove resource queries and the loader prefix.
          const flightClientEntry = request.split(
            'next-flight-client-loader.js!'
          )
          if (flightClientEntry[1]) {
            request = flightClientEntry[1]
          }

          let id
          if (idMap.has(request)) {
            id = idMap.get(request)
          } else {
            id = cyrb53(request)
            while (usedIds.has(id)) id++
            idMap.set(request, id)
            usedIds.add(id)
          }

          // We will have to add a special query to differenciate the two module IDs.
          if (flightClientEntry[1]) {
            chunkGraph.setModuleId(module, id.toString(36) + '?sc_client')
          } else {
            chunkGraph.setModuleId(module, id.toString(36))
          }
        }
      })
    })
  }
}
