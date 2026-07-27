export default function Page({ message }) {
  return (
    <div>
      <p>This should run the middleware</p>
      <p>{message}</p>
    </div>
  )
}

export const getServerSideProps = () => {
  return {
    props: {
      message: 'Hello, cruel world.',
    },
  }
}
