import deploymentId from './deployment-id.probe'
import inspector from './inspector.probe'

export default function Page() {
  return (
    <>
      <p id="hello">hello world</p>
      <p id="deployment-id">{deploymentId}</p>
      <p id="loader-inspector">{inspector}</p>
    </>
  )
}
