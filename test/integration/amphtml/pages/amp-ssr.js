export const config = { amp: true }

export default function Page() {
  return (
    <div>
      <p id="only-amp">Only AMP for me...</p>
    </div>
  )
}

export function getServerSideProps() {
  return {
    props: {},
  }
}
