'use server'

export async function appendName(state, formData) {
  return state + ':' + formData.get('name')
}
