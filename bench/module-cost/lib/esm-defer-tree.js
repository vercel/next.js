// A tree where every module uses `import defer` for its children: measures the
// overhead of deferred imports when the whole tree is evaluated.
export function execute() {
  return require('../esm-defer/index.js').default + 1
}
