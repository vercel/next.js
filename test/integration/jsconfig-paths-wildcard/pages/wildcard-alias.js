import myfile from 'mypackage/myfile'

// prevent static generation
export function getServerSideProps() {
  return {
    props: {},
  }
}

export default function WildcardAlias() {
  return <div>{myfile.hello}</div>
}
