import SingleEntryPlugin from 'webpack/lib/SingleEntryPlugin'
import MultiEntryPlugin from 'webpack/lib/MultiEntryPlugin'
import { detachable } from './detach-plugin'

detachable(SingleEntryPlugin)
detachable(MultiEntryPlugin)

export default class DynamicEntryPlugin {
  apply (compiler) {
    compiler.entryNames = getInitialEntryNames(compiler)
    compiler.addEntry = addEntry
    compiler.removeEntry = removeEntry
    compiler.hasEntry = hasEntry

    compiler.plugin('emit', (compilation, callback) => {
      compiler.cache = compilation.cache
      callback()
    })
  }
}

function getInitialEntryNames (compiler) {
  const entryNames = new Set()
  const { entry } = compiler.options

  if (typeof entry === 'string' || Array.isArray(entry)) {
    entryNames.add('main')
  } else if (typeof entry === 'object') {
    Object.keys(entry).forEach((name) => {
      entryNames.add(name)
    })
  }

  return entryNames
}

function addEntry (entry, name = 'main') {
  const { context } = this.options
  const Plugin = Array.isArray(entry) ? MultiEntryPlugin : SingleEntryPlugin
  this.apply(new Plugin(context, entry, name))
  this.entryNames.add(name)
}

function removeEntry (name = 'main') {
  for (const p of this.getDetachablePlugins()) {
    if (!(p instanceof SingleEntryPlugin || p instanceof MultiEntryPlugin)) continue
    if (p.name !== name) continue

    if (this.cache) {
      for (const id of Object.keys(this.cache)) {
        const m = this.cache[id]
        if (m.name === name) {
          // cache of `MultiModule` is based on `name`,
          // so delete it here for the case
          // a new entry is added with the same name later
          delete this.cache[id]
        }
      }
    }

    this.detach(p)
  }
  this.entryNames.delete(name)
}

function hasEntry (name = 'main') {
  return this.entryNames.has(name)
}
