export default function DeploymentsInfoPage(props) {
  if (typeof WebSocket === 'undefined') {
    throw new Error('missing WebSocket constructor!!')
  }

  return (
    <>
      <p>hello from app/dashboard/deployments/info</p>
    </>
  )
}
