export async function getServerSideProps({ params }) {
  return {
    props: {
      params,
    },
  }
}

export default function DynamicLayout({ children, params }) {
  return (
    <>
      <h1>
        Dynamic Layout. Params:{' '}
        <span id="dynamic-layout-params">{JSON.stringify(params)}</span>
      </h1>
      {children}
    </>
  )
}
