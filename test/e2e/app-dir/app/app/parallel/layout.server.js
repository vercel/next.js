import './style.css'

export default function Parallel({ foo, bar, baz, children }) {
  return (
    <div>
      parallel/layout1:
      <div className="parallel" title="@foo">
        {foo}
      </div>
      <div className="parallel" title="@bar">
        {bar}
      </div>
      <div className="parallel" title="@baz">
        {baz}
      </div>
      <div className="parallel" title="children">
        {children}
      </div>
    </div>
  )
}
