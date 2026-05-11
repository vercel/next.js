export default async function Page() {
  await new Promise((resolve) => setTimeout(resolve, 100))

  return <div id="delayed-runtime-content">Draft runtime content</div>
}
