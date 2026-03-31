export default function Main({ message, middleware, now }) {
  return (
    <div>
      <h1 className="title">About Page</h1>
      <p className={message}>{message}</p>
      <p className="middleware">{middleware}</p>
      <p className="now">{now}</p>
    </div>
  )
}

export const getServerSideProps = ({ query }) => ({
  props: {
    now: Date.now(),
    middleware: query.middleware || '',
    message: query.message || '',
  },
})
