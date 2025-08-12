export default function DeploymentsPage(props) {
  return (
    <>
      <p>
        hello from app/dashboard/deployments/[id]/settings. ID is:{' '}
        {props.params.id}
      </p>
    </>
  )
}
