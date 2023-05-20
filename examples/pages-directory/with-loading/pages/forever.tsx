export async function getServerSideProps() {
  await new Promise((resolve) => {
    setTimeout(resolve, 3000)
  })
  return { props: {} }
}

export default function ForeverPage() {
  return <p>This page was rendered for a while!</p>
}
