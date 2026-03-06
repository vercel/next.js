export const markdown = true

export async function getServerSideProps() {
  return {
    props: {},
  }
}

export default function PagesBasicPage() {
  return (
    <main>
      <h1>Pages Basic</h1>
      <p>Pages paragraph</p>
      <button>Ignore me</button>
    </main>
  )
}
