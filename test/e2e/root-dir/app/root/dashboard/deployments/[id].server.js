export async function getServerSideProps({ params }) {
  return {
    props: {
      id: params.id,
    },
  }
}

export default function DeploymentsPage(props) {
  return (
    <>
      <p>hello from root/dashboard/deployments/[id]. ID is: {props.id}</p>
    </>
  )
}
