import Link from 'next/link'

const alphabet = Array.from('abcdefghijklmnopqrstuvwxyz')

function getShuffledAlphabet() {
  return alphabet
    .map((value) => ({ value, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ value }) => value)
}

export default async function Page({
  params: { letter },
}: {
  params: { letter: string }
}) {
  await new Promise((r) => setTimeout(r, 250))

  return (
    <>
      <span id="letter-parallel">{letter}</span>
      <ul>
        {getShuffledAlphabet().map((letter) => (
          <li key={letter}>
            <Link href={`/${letter}`}>
              <div>{letter}</div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}
