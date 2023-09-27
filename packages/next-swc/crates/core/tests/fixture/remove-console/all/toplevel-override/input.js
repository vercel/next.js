let console = {
  log: (msg) => {},
}

function func1() {
  console.log('remove console test in function')
}

console.log('remove console test at top level')
