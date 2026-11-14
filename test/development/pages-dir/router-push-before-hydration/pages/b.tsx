export function getServerSideProps() {
  return { props: { value: 'b' } }
}

export default function Page({ value }: { value: string }) {
  return <p id="value">{value}</p>
}
