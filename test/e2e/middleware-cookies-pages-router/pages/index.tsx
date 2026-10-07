export default function Page({ fromMiddleware }) {
  return <p id="cookie">{fromMiddleware ?? 'not-set'}</p>
}

export function getServerSideProps({ req }) {
  return {
    props: {
      fromMiddleware: req.cookies['from-middleware'] ?? null,
    },
  }
}
