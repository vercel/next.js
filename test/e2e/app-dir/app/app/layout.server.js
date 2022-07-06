export async function getServerSideProps() {
  return {
    props: {
      world: 'world',
    },
  }
}

export default function Root({ children, custom, world }) {
  return (
    <html className="this-is-the-document-html">
      <head>
        <title>{`hello ${world}`}</title>
      </head>
      <body className="this-is-the-document-body" style={{ color: '#eee' }}>
        {children}
      </body>
    </html>
  )
}
