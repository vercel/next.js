import ReactDOM from 'react-dom'

export default function Index() {
  if (typeof window !== 'undefined') {
    window.didHydrate = true
  }
  return (
    <div>
      <p id="react-dom-version">{ReactDOM.version}</p>
    </div>
  )
}
