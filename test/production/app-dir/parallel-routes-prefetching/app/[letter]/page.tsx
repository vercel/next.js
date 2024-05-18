export default async function LetterPage({
  params: { letter },
}: {
  params: { letter: string }
}) {
  await new Promise((r) => setTimeout(r, 250))
  return <h1 id="letter-page">{letter}</h1>
}
