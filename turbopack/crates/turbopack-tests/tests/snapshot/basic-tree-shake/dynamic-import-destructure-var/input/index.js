async function main() {
  var { cat } = await import('./lib')
  console.log(cat)
}

main()
