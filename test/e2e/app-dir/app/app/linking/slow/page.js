export default async function SlowPage() {
  await new Promise((resolve) => setTimeout(resolve, 1000))
  return <div id="slow-page">Hello from slow page</div>
}
