export async function getServerSideProps() {
  await new Promise((resolve) => setTimeout(resolve, 2000))
  return {
    props: {
      message: 'Hello World',
    },
  }
}
export default function DashboardLayout({ children, message }) {
  return (
    <>
      <h1>Dashboard {message}</h1>
      {children}
    </>
  )
}
