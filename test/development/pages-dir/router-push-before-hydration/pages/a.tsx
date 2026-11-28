export function getServerSideProps() {
  return { props: { value: 'a' } }
}

export default function Page({ value }: { value: string }) {
  return <p id="value">{value}</p>
}
