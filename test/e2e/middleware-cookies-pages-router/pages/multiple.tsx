export default function Page({ cookies }) {
  return (
    <div>
      <p id="cookie-1">{cookies['cookie-1'] ?? 'not-set'}</p>
      <p id="cookie-2">{cookies['cookie-2'] ?? 'not-set'}</p>
    </div>
  )
}

export function getServerSideProps({ req }) {
  return {
    props: {
      cookies: {
        'cookie-1': req.cookies['cookie-1'] ?? null,
        'cookie-2': req.cookies['cookie-2'] ?? null,
      },
    },
  }
}
