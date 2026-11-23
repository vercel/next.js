export default function Page() {
  return (
    <>
      <p id="hello">hello world</p>
      <p id="deployment-id">{process.env.BUILD_WORKER_SEEN_DEPLOYMENT_ID}</p>
    </>
  )
}
