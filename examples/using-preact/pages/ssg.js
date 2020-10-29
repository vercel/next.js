export default function SSG({ framework }) {
  return <div>{framework} ssg example</div>
}

export function getStaticProps() {
  return {
    props: { framework: 'preact' },
  }
}
