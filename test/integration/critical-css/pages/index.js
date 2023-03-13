import styles from '../styles/index.module.css'
import Hello from '../components/hello'

export default function Home() {
  return (
    <div className={styles.hello}>
      <p>Hello World</p>
      <Hello />
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
