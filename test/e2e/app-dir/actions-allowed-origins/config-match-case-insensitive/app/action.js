'use server'

export async function testAllowedOriginAction(_prevState, formData) {
  const message = formData.get('message')

  return {
    success: true,
    message,
  }
}
