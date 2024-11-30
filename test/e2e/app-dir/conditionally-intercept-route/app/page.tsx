import Link from 'next/link'

export default function Page() {
  return (
    <>
      <div>
        <Link id="explicitly-not-intercepted" intercept={false} href="route">
          Open route (Non-intercepted);
        </Link>
      </div>
      <div>
        <Link id="explicitly-intercepted" intercept={true} href="route">
          Open route (intercepted);
        </Link>
      </div>
      <div>
        <Link id="default-behavior" href="route">
          Open route (intercepted, default);
        </Link>
      </div>
    </>
  )
}
