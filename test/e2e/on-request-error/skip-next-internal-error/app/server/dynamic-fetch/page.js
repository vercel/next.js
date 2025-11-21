export default async function Page() {
  await fetch('https://example.vercel.sh')
  return <p>dynamic page</p>
}
