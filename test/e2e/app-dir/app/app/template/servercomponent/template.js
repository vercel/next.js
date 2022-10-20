export default function Template({ children }) {
  return (
    <>
      <h1>
        Template <span id="performance-now">{performance.now()}</span>
      </h1>
      {children}
    </>
  )
}
