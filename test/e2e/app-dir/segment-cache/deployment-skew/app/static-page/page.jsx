export default function TargetPage() {
  return (
    <div id="build-id">
      Build ID:{' '}
      {process.env.NEXT_PUBLIC_BUILD_ID ?? process.env.NEXT_DEPLOYMENT_ID}
    </div>
  )
}
