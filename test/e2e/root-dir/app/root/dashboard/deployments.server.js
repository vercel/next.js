export function getServerSideProps() {
  return {
    props: {
      message: 'hello',
    },
  }
}

export default function DeploymentsLayout({ message, children }) {
  return (
    <>
      <h2>Deployments {message}</h2>
      {children}
    </>
  )
}
