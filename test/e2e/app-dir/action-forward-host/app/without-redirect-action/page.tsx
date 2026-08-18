// This route deliberately does not import the redirecting action, so posting
// that action here exercises both internal self-fetches in sequence.
export default function Page() {
  return <main>without redirect action</main>
}
