async function load() {
  const { used } = await import('./lib.js')
  console.log(used)
}

load()
