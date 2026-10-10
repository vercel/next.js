'use server'

export async function greet(
  boundArg: string,
  _prevState: unknown,
  formData: FormData
) {
  return { boundArg, name: formData.get('name') }
}

export async function greetPreBound(_prevState: unknown, formData: FormData) {
  return { boundArg: 'bound-arg', name: formData.get('name') }
}
