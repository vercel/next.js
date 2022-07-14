export async function getServerSideProps({ params }) {
  return {
    props: {
      params,
    },
  }
}

export default function IdLayout({ children, params }) {
  return (
    <>
      <h3>
        Id Layout. Params:{' '}
        <span id="id-layout-params">{JSON.stringify(params)}</span>
      </h3>
      {children}
    </>
  )
}
