function MyLayout({ children }) {
  return (
    <div id="layout">
      <h1>My Layout</h1>
      <main>{children}</main>
    </div>
  )
}

export async function getStaticProps(context) {
  console.log('Fetching _layout props!')
  return {
    props: {
      layouy: true,
    },
    revalidate: 10,
  }
}

export default MyLayout
