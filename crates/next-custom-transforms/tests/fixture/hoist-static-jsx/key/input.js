export function List() {
  return (
    <ul>
      <li key="a">A</li>
      <li key={dynamicKey()}>B</li>
    </ul>
  )
}
