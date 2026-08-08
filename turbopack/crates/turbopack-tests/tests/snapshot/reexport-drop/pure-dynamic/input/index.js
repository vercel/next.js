async function load() {
  const { a } = await import('./barrel.js')
  console.log(a)
}

load()
