'use server'

export async function greet(name: string) {
  console.log('Server: Running greet action')
  return `Hello, ${name}!`
}

export async function addNumbers(a: number, b: number) {
  console.log('Server: Running addNumbers action')
  return a + b
}

export async function submitForm(formData: FormData) {
  console.log('Server: Running submitForm action')
  const name = formData.get('name')
  const email = formData.get('email')
  return { success: true, name, email }
}
