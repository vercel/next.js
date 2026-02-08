async function main() {
  const cat = (await import('./lib')).cat
  console.log(cat)
}

main()
