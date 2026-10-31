import styles from './styles.module.css'

function All({ params }) {
  return (
    <div id="nested-all-ssg-content" className={styles.test}>
      {JSON.stringify(params)}
    </div>
  )
}

export function getStaticProps({ params }) {
  return { props: { params } }
}

export function getStaticPaths() {
  return {
    paths: [],
    fallback: true,
  }
}

export default All
