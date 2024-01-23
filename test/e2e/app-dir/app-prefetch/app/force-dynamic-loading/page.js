export default async function Page() {
  // sleep for 1s
  await new Promise((resolve) => setTimeout(resolve, 1000))
  return <div>Overview</div>
}
