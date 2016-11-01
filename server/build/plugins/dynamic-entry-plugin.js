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

    this.detach(p)
  }
  this.entryNames.delete(name)
}

function hasEntry (name = 'main') {
  return this.entryNames.has(name)
}
