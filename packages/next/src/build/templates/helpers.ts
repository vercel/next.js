/**
 * Hoists a name from a module or promised module.
 *
 * @param module the module to hoist the name from
 * @param name the name to hoist
 * @returns the value on the module (or promised module)
 */
export function hoist(module: any, name: string) {
  // If the name is available in the module, return it.
  if (name in module) {
    return module[name]
  }

  // If a property called `then` exists, assume it's a promise and
  // return a promise that resolves to the name.
  if ('then' in module && typeof module.then === 'function') {
    return module.then((mod: any) => hoist(mod, name))
  }

  // If we're trying to hoise the default export, and the module is a function,
  // return the module itself.
  if (typeof module === 'function' && name === 'default') {
    return module
  }

  // Otherwise, return undefined.
  return undefined
}
