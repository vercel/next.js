export default async function Page() {
  await fetch('https://next-data-api-endpoint.vercel.app/api/random')
  return <p>hello world</p>
}
