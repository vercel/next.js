async function main() {
  const { foo } = await import('./dep.js')
  console.log(foo)
}
