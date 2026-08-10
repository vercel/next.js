export const getServerSideProps = ({ params }) => {
  console.log({ params })

  return {
    props: {
      params,
    },
  }
}

export default function Page(props) {
  return <p id="props">{JSON.stringify(props)}</p>
}
