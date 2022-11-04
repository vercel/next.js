import Link from 'next/link'
import styles from '../styles/Home.module.css'

export default function Form() {
  return (
    <div className="container">
      <h1 className={styles.title}>
        Form <Link href="/">without</Link> JavaScript.
      </h1>
      <p className={styles.description}>
        Get started by looking at{' '}
        <code className={styles.code}>pages/no-js-form.js</code>
      </p>

      {/*
       * action: The action attribute defines where the data gets sent.
       * Its value must be a valid relative or absolute URL.
       * If this attribute isn't provided, the data will be sent to the URL
       * of the page containing the form — the current page.
       * method: The HTTP method to submit the form with. (case insensitive)
       */}
      <form action="/api/form" method="post">
        <label htmlFor="first">First Name</label>
        <input type="text" id="first" name="first" required />
        <label htmlFor="last">Last Name</label>
        <input type="text" id="last" name="last" required />
        <button type="submit">Submit</button>
      </form>
    </div>
  )
}
