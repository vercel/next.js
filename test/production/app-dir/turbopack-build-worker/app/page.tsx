import deploymentId from './deployment-id.probe'

export default function Page() {
  return (
    <>
      <p id="hello">hello world</p>
      <p id="deployment-id">{deploymentId}</p>
    </>
  )
}
