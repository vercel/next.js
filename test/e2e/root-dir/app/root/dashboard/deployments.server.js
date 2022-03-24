export function getServerSideProps({ params }) {
  return {
    props: {
      id: params?.id || null,
    },
  }
}

export default function DeploymentsLayout({ id, children }) {
  return (
    <>
      <h2>Deployments{id ? ` (${id})` : null}</h2>
      {children}
    </>
  )
}
