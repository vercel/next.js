export default function ClearQueryParams(props) {
  return <pre id="my-query-params">{JSON.stringify(props.query)}</pre>
}

/** @type {import('next').GetServerSideProps} */
export const getServerSideProps = (req) => {
  return {
    props: {
      query: { ...req.query },
    },
  }
}
