export default function ErrorMessage({ message }) {
  return (
    <>
      <div className="message">{message || 'Unknown error'}</div>
      <style jsx>{`
        .message {
          color: #d61313;
        }
      `}</style>
    </>
  )
}
