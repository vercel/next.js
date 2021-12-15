export const getServerSideProps = ({ params }) => {
  return { props: params }
}

export default function Page({ param }) {
  return <p id="props">{param}</p>
}
