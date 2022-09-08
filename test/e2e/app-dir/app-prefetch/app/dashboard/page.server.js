export async function getServerSideProps() {
  await new Promise((resolve) => setTimeout(resolve, 3000))
  return {
    props: {
      message: 'Welcome to the dashboard',
    },
  }
}
export default function DashboardPage({ message }) {
  return (
    <>
      <p>{message}</p>
    </>
  )
}
