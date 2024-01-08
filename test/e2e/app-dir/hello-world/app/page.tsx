export default async function Page() {
  try {
    await fetch('http://locahost:3000/xxxx')
  } catch (e) {
    throw e
  }
  return 'page'
}
