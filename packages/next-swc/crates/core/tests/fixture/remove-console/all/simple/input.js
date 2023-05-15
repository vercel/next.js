console.log('remove console test at top level')

export function shouldRemove() {
  console.log('remove console test in function')
  console.error('remove console test in function / error')
}

export function locallyDefinedConsole() {
  let console = {
    log: () => {},
  }
  console.log()
}

export function capturedConsole() {
  let console = {
    log: () => {},
  }
  function innerFunc() {
    console.log()
  }
}

export function overrideInParam(console) {
  console.log('')
}

export function overrideInParamObjectPatPropAssign({ console }) {
  console.log('')
}

export function overrideInParamObjectPatPropKeyValue({ c: console }) {
  console.log('')
}

export function overrideInParamObjectPatPropKeyValueNested({ c: { console } }) {
  console.log('')
}

export function overrideInParamArray([console]) {
  console.log('')
}
