async function main() {
  let { cat } = await import('./lib')
  console.log(cat)
}

main()
