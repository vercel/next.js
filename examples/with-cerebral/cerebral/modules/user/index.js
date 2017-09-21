import changeName from './signals/changeName'

export default (module) => {
  module.name // Name of module
  module.path // Full path to module
  module.controller // The controller the module is attached to

  return {
    // Define module state, namespaced by module path
    state: {name: 'User'},
    // Define module signals, namespaced by module path
    signals: {changeName},
    // Define submodules, namespaced by module path
    modules: {},
    // Add a global provider when module instantiates
    // provider(context, functionDetails, payload) {}
  }
}
