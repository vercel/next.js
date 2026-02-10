function main() {
  import('./lib').then(({ cat }) => {
    console.log(cat)
  })
}

main()
