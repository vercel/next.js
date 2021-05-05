import styles from '../styles/index.module.css'

export default function Home() {
  return (
    <div className={styles.hello}>
      <p>Hello World</p>
    </div>
  )
}

export const getServerSideProps = () => {
  return {
    props: {
      hello: 'world',
    },
  }
}
