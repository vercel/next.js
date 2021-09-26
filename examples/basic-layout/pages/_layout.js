function MyLayout({ children, title = 'Layout SSG Borked' }) {
  return (
    <div id="layout">
      <h1>{title}</h1>
      <main>{children}</main>
    </div>
  )
}

export async function getStaticProps(context) {
  return {
    props: {
      title: 'My SSG Layout Title',
    },
    revalidate: 10,
  }
}

export default MyLayout
