'use server'

export async function testCsrfActionLog(_prevState, formData) {
  const message = formData.get('message')

  return {
    success: true,
    message,
  }
}
