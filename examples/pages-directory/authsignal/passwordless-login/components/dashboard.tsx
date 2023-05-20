import { useRouter } from 'next/router'
import { User } from '../lib'
import styles from './dashboard.module.css'

interface Props {
  user: User
}

export const Dashboard = ({ user }: Props) => {
  const router = useRouter()

  const logout = async () => {
    await fetch('/api/logout', {
      method: 'POST',
      credentials: 'same-origin',
    })

    router.push('/')
  }

  return (
    <>
      <header className={styles.header}>
        <div className={styles.logo}>My Example App</div>
        <button onClick={() => logout()}>Log out</button>
      </header>
      <div className={styles.user}>
        <div>
          <div className={styles.label}>Logged in as:</div>
          <div>{user.email}</div>
        </div>
      </div>
    </>
  )
}
