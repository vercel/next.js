async function main() {
  const { cat } = await import(/* turbopackExports: ["cat"] */ './lib')
  console.log(cat)
}

main()
