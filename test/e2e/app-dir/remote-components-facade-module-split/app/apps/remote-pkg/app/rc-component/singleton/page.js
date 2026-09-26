import { ExposeRemoteComponent } from 'remote-components/remote/nextjs/app'
import { RemoteSingletonLoader } from './remote-singleton-loader'

export default function SingletonRemoteComponent() {
  return (
    <ExposeRemoteComponent>
      <RemoteSingletonLoader />
    </ExposeRemoteComponent>
  )
}
