import { submitApplication } from './actions'

export default function ApplyPage() {
  return (
    <main>
      <h1>Work at Northwind</h1>
      <p>
        We&apos;re hiring across engineering and support. Tell us who you are
        and we&apos;ll be in touch within a week.
      </p>
      <form action={submitApplication}>
        <label htmlFor="name" style={{ display: 'block', fontWeight: 600 }}>
          Full name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          style={{
            display: 'block',
            margin: '0.5rem 0 1rem',
            padding: '0.5rem',
            width: '100%',
            maxWidth: 320,
          }}
        />
        <button type="submit" style={{ padding: '0.5rem 1.25rem' }}>
          Submit application
        </button>
      </form>
    </main>
  )
}
