import styles from './page1.module.css'

function Page1(props) {
  return (
    <p id="page-text" className={styles.abc}>
      1
    </p>
  )
}

export async function getServerSideProps() {
  await new Promise((resolve) => setTimeout(resolve, 5000))
  return { props: {} }
}

export default Page1
