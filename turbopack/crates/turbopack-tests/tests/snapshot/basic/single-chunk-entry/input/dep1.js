// `dep1` is reached via `import('./dep1')` and itself dynamically imports
// `dep2` — exercising a nested dynamic-import boundary that must also inline.
export function dep1() {
  console.log('dep1')
  import('./dep2').then(({ dep2 }) => {
    dep2()
  })
}
