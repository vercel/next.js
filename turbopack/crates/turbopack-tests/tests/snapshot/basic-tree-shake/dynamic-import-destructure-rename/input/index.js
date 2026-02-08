async function main() {
  const { cat: myCat } = await import('./lib')
  console.log(myCat)
}

main()
