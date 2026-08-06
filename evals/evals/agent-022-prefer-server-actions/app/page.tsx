import ContactForm from './ContactForm'

// Example of existing server action
async function updateProfile(formData: FormData) {
  'use server'

  const name = formData.get('name') as string
  const email = formData.get('email') as string

  // Simulate database update
  console.log('Updating profile:', { name, email })
}

export default function Page() {
  return (
    <div>
      <h1>Dashboard</h1>

      <form action={updateProfile}>
        <input name="name" placeholder="Name" required />
        <input name="email" type="email" placeholder="Email" required />
        <button type="submit">Update Profile</button>
      </form>

      <ContactForm />
    </div>
  )
}
