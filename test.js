async function main() {
  for (let i = 0; i < 10000000; i++) {
    const p = Promise.resolve()
    new WeakRef(p)
    await p
  }
}

main()
