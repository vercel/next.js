import value from 'http://localhost:12345/value3.js'

export default function Index(props) {
  return (
    <div>
      Hello {value}+{value}
    </div>
  )
}
