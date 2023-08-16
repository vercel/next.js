export default function AboutBypass({ message }) {
  return (
    <div>
      <h1 className="title">About Bypassed Page</h1>
      <p className={message}>{message}</p>
    </div>
  )
}

export const getServerSideProps = ({ query }) => ({
  props: { message: query.message || '' },
})
