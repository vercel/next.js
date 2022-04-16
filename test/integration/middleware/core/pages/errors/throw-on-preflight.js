export default function ThrowOnPreflight({ message }) {
  return (
    <div>
      <h1 className="title">Throw on preflight request</h1>
      <p className={message}>{message}</p>
    </div>
  )
}

export const getServerSideProps = ({ query }) => ({
  props: { message: query.message || '' },
})
