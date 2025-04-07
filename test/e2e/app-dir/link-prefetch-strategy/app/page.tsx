import Link from 'next/link'

export default function Page() {
  return (
    <div>
      <Link id="viewport" href="/test/viewport">
        Viewport
      </Link>
      <Link id="predict" href="/test/predict" prefetch="predict">
        Predict
      </Link>
      <Link id="intent" href="/test/intent" prefetch="intent">
        Intent
      </Link>
    </div>
  )
}
