export default function Page() {
  return (
    <main>
      <h1>Trivia game: What is the output?</h1>
      <ul>
        <li>1 - 2 - 3 {/* Works - Dont work - Works */}</li>
        <li>1 - 3 - 2 {/* Works - Dont work - Works */}</li>
        <li>3 - 1 - 2 - 3 {/* Nothing - Works - Works - Works */}</li>
        <li>3 - 2 {/* Nothing - Makes 1 work */}</li>
        <li>2 - 1 {/* Nothing - Makes 1 work */}</li>
      </ul>
    </main>
  )
}
