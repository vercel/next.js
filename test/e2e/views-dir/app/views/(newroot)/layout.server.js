export async function getServerSideProps() {
  return {
    props: {
      world: 'world',
    },
  }
}

export default function Root({ children, world }) {
  return (
    <html className="this-is-another-document-html">
      <head>
        <title>{`hello ${world}`}</title>
      </head>
      <body className="this-is-another-document-body">{children}</body>
    </html>
  )
}
