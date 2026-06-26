export default function Parallel({ children }) {
  return (
    <div>
      parallel/layout:
      <div className="parallel" title="children">
        {children}
      </div>
    </div>
  )
}
