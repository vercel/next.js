async function main() {
  const { cat } = await import(/* webpackExports: ["cat"] */ './lib')
  console.log(cat)
}

main()
