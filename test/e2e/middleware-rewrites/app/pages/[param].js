export const getServerSideProps = ({ params, query }) => {
  return { props: { params, query } }
}

export default function Page({ params: { param }, query: { qp } }) {
  return (
    <>
      <p id="props">{param}</p>
      <p id="qp">{qp}</p>
    </>
  )
}
