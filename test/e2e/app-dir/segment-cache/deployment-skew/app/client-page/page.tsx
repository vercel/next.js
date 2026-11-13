import { ClientComponent } from '../../components/client-component'

export default function ClientPage() {
  return (
    <div>
      <div id="build-id">
        Build ID:{' '}
        {process.env.NEXT_PUBLIC_BUILD_ID ?? process.env.NEXT_DEPLOYMENT_ID}
      </div>
      <ClientComponent />
    </div>
  )
}
