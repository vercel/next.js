export default function Main({ now }) {
  return (
    <div>
      <h1 id="ssg">SSG Page</h1>
      <p id="now">{now}</p>
    </div>
  )
}

export const getStaticProps = () => ({
  props: {
    now: Date.now(),
  },
})
