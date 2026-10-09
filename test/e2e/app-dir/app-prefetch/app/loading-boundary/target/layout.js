export default function Layout({ children }) {
  return (
    <div>
      <p id="loading-boundary-inner-layout">Inner layout [lb-inner-layout]</p>
      {children}
    </div>
  )
}
