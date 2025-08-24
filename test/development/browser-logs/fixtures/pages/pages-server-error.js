function throwPagesServerError() {
  throw new Error('Server error in pages router')
}

function callPagesServerError() {
  throwPagesServerError()
}

export async function getServerSideProps() {
  callPagesServerError()

  return {
    props: {},
  }
}

export default function PagesServerError() {
  return <div></div>
}
