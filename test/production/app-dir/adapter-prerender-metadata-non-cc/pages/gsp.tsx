export function getStaticProps() {
  return { props: { message: 'pages static props' } }
}

export default function Page({ message }: { message: string }) {
  return <p>{message}</p>
}
