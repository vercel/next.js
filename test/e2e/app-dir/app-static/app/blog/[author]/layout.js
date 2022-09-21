export default function Layout({ children, params }) {
  return (
    <>
      <p id="author-layout-params">{JSON.stringify(params)}</p>
      {children}
    </>
  )
}

export function generateStaticParams({ params }) {
  console.log('/blog/[author] generateStaticParams', JSON.stringify(params))

  return {
    params: [{ author: 'tim' }, { author: 'seb' }, { author: 'styfle' }],
  }
}
