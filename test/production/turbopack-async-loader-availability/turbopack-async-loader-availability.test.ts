import fs from 'fs'
import path from 'path'
import { nextTestSetup } from 'e2e-utils'
import { recursiveReadDir } from 'next/dist/lib/recursive-readdir'
;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
  'turbopack-async-loader-availability',
  () => {
    const { next } = nextTestSetup({
      files: __dirname,
      skipStart: true,
    })

    it('emits stable async loaders without duplicating shared modules', async () => {
      await next.build()

      const staticDir = (await next.hasFile('.next/static/immutable'))
        ? '.next/static/immutable'
        : '.next/static'
      const chunksDir = path.join(next.testDir, staticDir, 'chunks')
      const chunkFiles = (await recursiveReadDir(chunksDir)).filter((file) =>
        file.endsWith('.js')
      )
      const factoryBodiesById = new Map<string, Set<string>>()
      const occurrencesById = new Map<string, number>()
      const loadedChunkPaths = new Set<string>()
      const loaderPatterns = [
        {
          kind: 'resolve',
          pattern:
            /[,[](?<id>\d+),(?<context>[\w$]+)=>\{\k<context>\.v\((?<importer>[\w$]+)=>Promise\.resolve\(\)\.then\(\(\)=>\k<importer>\((?<target>\d+)\)\)\)\}/g,
        },
        {
          kind: 'load',
          pattern:
            /[,[](?<id>\d+),(?<context>[\w$]+)=>\{\k<context>\.v\((?<importer>[\w$]+)=>Promise\.all\(\[(?<chunks>[^\]]*)\]\.map\((?<chunk>[\w$]+)=>\k<context>\.l\(\k<chunk>\)\)\)\.then\(\(\)=>\k<importer>\((?<target>\d+)\)\)\)\}/g,
        },
        {
          kind: 'adaptive',
          pattern:
            /[,[](?<id>\d+),(?<context>[\w$]+)=>\{\k<context>\.v\((?<importer>[\w$]+)=>\(\k<context>\.M\.has\((?<target>\d+)\)\?Promise\.resolve\(\):Promise\.all\(\[(?<chunks>[^\]]*)\]\.map\((?<chunk>[\w$]+)=>\k<context>\.l\(\k<chunk>\)\)\)\)\.then\(\(\)=>\k<importer>\(\k<target>\)\)\)\}/g,
        },
      ]

      for (const file of chunkFiles) {
        const source = fs.readFileSync(path.join(chunksDir, file), 'utf8')
        for (const { kind, pattern } of loaderPatterns) {
          for (const match of source.matchAll(pattern)) {
            const { id, target, chunks } = match.groups!
            const factoryBody =
              chunks === undefined
                ? `${kind}:${target}`
                : `${kind}:[${chunks}]:${target}`
            for (const chunkMatch of chunks?.matchAll(/"([^"]+\.js)"/g) ?? []) {
              loadedChunkPaths.add(chunkMatch[1])
            }
            const factoryBodies = factoryBodiesById.get(id) ?? new Set<string>()
            factoryBodies.add(factoryBody)
            factoryBodiesById.set(id, factoryBodies)
            occurrencesById.set(id, (occurrencesById.get(id) ?? 0) + 1)
          }
        }
      }

      expect(factoryBodiesById.size).toBeGreaterThan(0)
      expect(Math.max(...occurrencesById.values())).toBeGreaterThan(1)
      expect(
        [...factoryBodiesById.values()].some((factoryBodies) => {
          return [...factoryBodies].some((body) => body.startsWith('adaptive:'))
        })
      ).toBe(true)
      expect(
        [...factoryBodiesById].filter(([, factoryBodies]) => {
          return factoryBodies.size > 1
        })
      ).toEqual([])
      expect(loadedChunkPaths.size).toBeGreaterThan(0)
      for (const chunkPath of loadedChunkPaths) {
        const source = fs.readFileSync(
          path.join(next.testDir, '.next', chunkPath),
          'utf8'
        )
        expect(source).not.toContain('turbopack-common-availability-marker')
      }
    })
  }
)
