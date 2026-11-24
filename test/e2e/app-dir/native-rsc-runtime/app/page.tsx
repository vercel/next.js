export default async function Page() {
  await new Promise((resolve) => setTimeout(resolve, 1))
  return <p>hello world</p>
}
