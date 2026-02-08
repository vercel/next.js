async function main() {
  const { default: defaultValue } = await import('./lib')
  console.log(defaultValue)
}

main()
