import { webpack } from 'next/dist/compiled/webpack/webpack'

export function traverseModules(
  compilation: webpack.Compilation,
  callback: (
    mod: any,
    chunk: webpack.Chunk,
    chunkGroup: typeof compilation.chunkGroups[0],
    modId: string | number
  ) => any
) {
  compilation.chunkGroups.forEach((chunkGroup) => {
    chunkGroup.chunks.forEach((chunk: webpack.Chunk) => {
      const chunkModules = compilation.chunkGraph.getChunkModulesIterable(
        chunk
        // TODO: Update type so that it doesn't have to be cast.
      ) as Iterable<webpack.NormalModule>
      for (const mod of chunkModules) {
        const modId = compilation.chunkGraph.getModuleId(mod)
        callback(mod, chunk, chunkGroup, modId)
        const anyModule = mod as any
        if (anyModule.modules) {
          for (const subMod of anyModule.modules)
            callback(subMod, chunk, chunkGroup, modId)
        }
      }
    })
  })
}
