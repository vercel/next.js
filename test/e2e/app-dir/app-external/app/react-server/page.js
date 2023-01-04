import Detector from './detector'
import ClientDetector from './client-detector'

export default function Page() {
  return (
    <div>
      Server: <Detector />
      <br />
      Client: <ClientDetector />
      <br />
    </div>
  )
}
