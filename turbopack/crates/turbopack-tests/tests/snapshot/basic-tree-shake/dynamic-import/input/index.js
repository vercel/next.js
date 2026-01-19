async function main() {
  const lib = await import('./lib')
  console.log(lib.cat)
}

main()
