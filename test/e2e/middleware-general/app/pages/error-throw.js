export default function ThrowOnData({ message }) {
  return (
    <div>
      <h1 className="title">Throw on data request</h1>
      <p className={message}>{message}</p>
    </div>
  )
}

export const getServerSideProps = ({ query }) => ({
  props: { message: query.message || '' },
})
