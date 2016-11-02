
export default class DetachPlugin {
  apply (compiler) {
    compiler.pluginDetachFns = new Map()
    compiler.plugin = plugin(compiler.plugin)
    compiler.apply = apply
    compiler.detach = detach
    compiler.getDetachablePlugins = getDetachablePlugins
  }
}

export function detachable (Plugin) {
  const { apply } = Plugin.prototype

  Plugin.prototype.apply = function (compiler) {
    const fns = []

    const { plugin } = compiler
    compiler.plugin = function (name, fn) {
      fns.push(plugin.call(this, name, fn))
    }

    // collect the result of `plugin` call in `apply`
    apply.call(this, compiler)

    compiler.plugin = plugin

    return fns
  }
}

function plugin (original) {
  return function (name, fn) {
    original.call(this, name, fn)

    return () => {
      const names = Array.isArray(name) ? name : [name]
      for (const n of names) {
        const plugins = this._plugins[n] || []
        const i = plugins.indexOf(fn)
        if (i >= 0) plugins.splice(i, 1)
      }
    }
  }
}

function apply (...plugins) {
  for (const p of plugins) {
    const fn = p.apply(this)
    if (!fn) continue

    const fns = this.pluginDetachFns.get(p) || new Set()

    const _fns = Array.isArray(fn) ? fn : [fn]
    for (const f of _fns) fns.add(f)

    this.pluginDetachFns.set(p, fns)
  }
}

function detach (...plugins) {
  for (const p of plugins) {
    const fns = this.pluginDetachFns.get(p) || new Set()
    for (const fn of fns) {
      if (typeof fn === 'function') fn()
    }
    this.pluginDetachFns.delete(p)
  }
}

function getDetachablePlugins () {
  return new Set(this.pluginDetachFns.keys())
}
