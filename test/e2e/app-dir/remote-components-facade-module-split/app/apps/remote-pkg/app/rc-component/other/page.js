import { ExposeRemoteComponent } from 'remote-components/remote/nextjs/app'
import { OtherProbe } from './other-probe'

export default function OtherRemoteComponent() {
  return (
    <ExposeRemoteComponent>
      <OtherProbe />
    </ExposeRemoteComponent>
  )
}
