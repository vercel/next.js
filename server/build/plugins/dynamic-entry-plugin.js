import SingleEntryPlugin from 'webpack/lib/SingleEntryPlugin'
import MultiEntryPlugin from 'webpack/lib/MultiEntryPlugin'

export default class DynamicEntryPlugin {
  apply (compiler) {
    compiler.entryNames = getInitialEntryNames(compiler)
    compiler.addEntry = addEntry
    compiler.removeEntry = removeEntry
    compiler.hasEntry = hasEntry
    compiler.createCompilation = createCompilation(compiler.createCompilation)
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
  this.entryNames.delete(name)
}

function hasEntry (name = 'main') {
  return this.entryNames.has(name)
}

function createCompilation (original) {
  return function (...args) {
    const compilation = original.apply(this, args)
    compilation.addEntry = compilationAddEntry(compilation.addEntry)
    return compilation
  }
}

function compilationAddEntry (original) {
  return function (context, entry, name, callback) {
    if (!this.compiler.entryNames.has(name)) {
      // skip removed entry
      callback()
      return
    }

    return original.call(this, context, entry, name, callback)
  }
}
