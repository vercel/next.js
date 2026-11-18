export function getServerSideProps() {
  return { props: { secret: 'private server-side props' } }
}

export default function PagesSecure({ secret }: { secret: string }) {
  return <p>{secret}</p>
}
