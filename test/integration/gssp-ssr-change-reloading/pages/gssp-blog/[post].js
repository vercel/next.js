export default function Gssp(props) {
  return (
    <>
      <p id="change">change me</p>
      <p id="props">{JSON.stringify(props)}</p>
    </>
  )
}

export const getServerSideProps = ({ params }) => {
  const count = 1

  return {
    props: {
      count,
      params,
      random: Math.random(),
    },
  }
}
