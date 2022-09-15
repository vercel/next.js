export async function getServerSideProps() {
  await new Promise((resolve) => setTimeout(resolve, 400))
  return {
    props: {
      message: 'Hello World',
    },
  }
}
export default function DashboardLayout({ children, message }) {
  return (
    <>
      <h1 id="dashboard-layout">Dashboard {message}</h1>
      {children}
    </>
  )
}
