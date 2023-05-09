import styles from './login.module.css'

export const Login = () => (
  <main className={styles.login}>
    <h1 className={styles.title}>My Example App</h1>
    <form method="POST" action="/api/login">
      <label htmlFor="email">Email</label>
      <input id="email" type="email" name="email" required />
      <button type="submit">Log in / Sign up</button>
    </form>
  </main>
)
