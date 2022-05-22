export async function getServerSideProps() {
  return {
    props: {
      world: 'world',
    },
  }
}

export default function Root({ children, world }) {
  return (
    <html className="this-is-the-document-html">
      <head>
        <title>{`hello ${world}`}</title>
      </head>
      <body className="this-is-the-document-body">{children}</body>
    </html>
  )
}
