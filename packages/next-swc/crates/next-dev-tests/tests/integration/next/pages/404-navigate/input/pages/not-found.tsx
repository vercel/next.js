export default function Page() {
  return <div>Page</div>
}

export function getStaticProps() {
  return {
    notFound: true,
  }
}
