function main() {
  import('./lib').then(function ({ cat, default: def }) {
    console.log(cat, def)
  })
}

main()
