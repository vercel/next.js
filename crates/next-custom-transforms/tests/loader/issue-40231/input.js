function loadSomethingWithDynamicImport(param) {
  return import(`something/${param}`).then((r) => r.default)
}

module.exports = { loadSomethingWithDynamicImport }
