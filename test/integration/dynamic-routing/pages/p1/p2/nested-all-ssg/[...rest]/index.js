import styles from './styles.module.css'

function All({ params }) {
  return (
    <div id="nested-all-ssg-content" className={styles.test}>
      {JSON.stringify(params)}
    </div>
  )
}

export function unstable_getStaticProps({ params }) {
  return { props: { params } }
}

export default All
