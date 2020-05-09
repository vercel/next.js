export default function Button({ children }) {
  return <button onClick={() => alert('Clicked!')}>{children}</button>
}
