export default function Main({ message, middleware }) {
  return (
    <div>
      <h1 className="title">About Page</h1>
      <p className={message}>{message}</p>
      <p className="middleware">{middleware}</p>
    </div>
  )
}

export const getServerSideProps = ({ query }) => ({
  props: {
    middleware: query.middleware || '',
    message: query.message || '',
  },
})
