export async function getServerSideProps({ params }) {
  return {
    props: {
      params,
    },
  }
}

export default function IdPage({ children, params }) {
  return (
    <>
      <p>
        Id Page. Params:{' '}
        <span id="id-page-params">{JSON.stringify(params)}</span>
      </p>
      {children}
    </>
  )
}
