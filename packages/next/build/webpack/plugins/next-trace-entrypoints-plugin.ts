import nodePath from 'path'
import {nodeFileTrace} from 'next/dist/compiled/@vercel/nft'
import { webpack } from 'next/dist/compiled/webpack/webpack'

const PLUGIN_NAME = 'TraceEntryPointsPlugin'

export class TraceEntryPointsPlugin implements webpack.Plugin {
  private appDir: string
  
  constructor({
    appDir
  }: {
    appDir: string
  }) {
      this.appDir = appDir
  }
  
  apply(compiler: webpack.Compiler) {
    compiler.hooks.compilation.tap(
      PLUGIN_NAME,
      (compilation) => {
        compilation.hooks.finishModules.tapAsync(PLUGIN_NAME, async (stats: any, callback: any) => {
          try {
            const entryRequests = new Set<string>()
            
            compilation.entries.forEach(entry => {
              if (entry?.options?.name?.startsWith('pages/')) {
                entryRequests.add(nodePath.join('/', entry.dependencies[0]?.request))
              }
            })
            
            const entryModules = new Map<string, any>()
            const entryPathToName = new Map<string, string>()
            
            compilation.modules.forEach(mod => {
              const entryName = nodePath.join('/', mod.rawRequest || '')
              
              if (entryRequests.has(entryName)) {
                entryModules.set(entryName, mod)
                entryPathToName.set(mod.resource, entryName)
                console.log('found mod', entryName);
              }
            })
            
            const readFile = (path: string) => {
              const entryName = entryPathToName.get(path)
              
              if (entryName) {
                const mod = entryModules.get(entryName)
                return mod._source._valueAsBuffer
              } 
              
              try {
                return compilation.inputFileSystem.readFileSync(path)
              } catch (e) {
                if (e.code === 'ENOENT' || e.code === 'EISDIR') {
                  return null;
                }
                throw e;
              }
            }
            const readlink = (path: string) => {
              try {
                return compilation.inputFileSystem.readlinkSync(path)
              } catch (e) {
                if (e.code !== 'EINVAL' && e.code !== 'ENOENT' && e.code !== 'UNKNOWN') {
                  console.log('throwing', e);
                  throw e;
                }
                return null;
              }
            }
            const stat = (path: string) => {
              try {
                return compilation.inputFileSystem.statSync(path)
              } catch (e) {
                if (e.code === 'ENOENT') {
                  return null;
                }
                throw e;
              }
            }
            
            // update toTrace to include all module dependencies so local components are traced correctly
            // as well since it can fail to parse the source files we need to look-up the transpiled version
            const toTrace = Array.from(entryPathToName.keys())
            const nftCache = {}
            console.log('tracing', toTrace);
            
            const result = await nodeFileTrace(
              toTrace,
              {
                base: '/',
                cache: nftCache,
                processCwd: this.appDir,
                readFile,
                readlink,
                stat
              }
            )
            
            console.log('trace result', result);
            
            callback()
          } catch (err) {
            console.error('wtf', err);
            callback(err)
          }
        })
        
      }
    )
  }
}
