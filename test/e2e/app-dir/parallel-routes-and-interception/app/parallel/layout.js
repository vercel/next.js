import './style.css'

export default function Parallel({ foo, bar, children }) {
  return (
    <div id="parallel-layout">
      parallel/layout:
      <div className="parallel" title="@foo">
        {foo}
      </div>
      <div className="parallel" title="@bar">
        {bar}
      </div>
      <div className="parallel" title="children">
        {children}
      </div>
    </div>
  )
}
