export default function About() {
  return (
    <div>
      <h1>About Page</h1>
      {/* This <a> should trigger the rule */}
      <a href="/contact">Go to Contact</a>
    </div>
  )
}
