async function main() {
  const { cat } = await import('./lib')
  console.log(cat)
}

main()
