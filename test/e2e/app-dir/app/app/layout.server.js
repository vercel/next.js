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
        <div style={{ backgroundColor: '#C14242' }}>{children}</div>
        <div style={{ backgroundColor: '#3F7FBF' }}>{custom}</div>
      </body>
    </html>
  )
}
