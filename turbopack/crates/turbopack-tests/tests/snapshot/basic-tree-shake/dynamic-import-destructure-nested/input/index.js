async function main() {
  const {
    dogRef: { get },
  } = await import('./lib')
  console.log(get())
}

main()
