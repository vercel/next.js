export default function Account() {
  return (
    <p id="dynamic" className="title">
      Welcome to a /dynamic/[slug]
    </p>
  )
}

export function getServerSideProps() {
  return {
    props: {},
  }
}
