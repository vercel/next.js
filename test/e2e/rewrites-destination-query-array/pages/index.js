export function getServerSideProps(context) {
  return {
    props: {
      query: context.query,
    },
  }
}

export default function Page(props) {
  return (
    <>
      <p id="items">{props.query.items.join(',')}</p>
    </>
  )
}
