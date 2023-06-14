export default function CategoryLayout({ children, params }) {
  return (
    <>
      <h2>
        Category Layout. Params:{' '}
        <span id="category-layout-params">{JSON.stringify(params)}</span>{' '}
      </h2>
      {children}
    </>
  )
}
