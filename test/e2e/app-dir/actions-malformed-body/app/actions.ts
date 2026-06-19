'use server'

// A trivial, recognized Server Action. We only need it to exist so that its
// action id is registered in the server module map -- the tests then send
// *malformed* request bodies to this valid id to exercise the decode error
// paths in `handleAction`.
export async function echo(formData: FormData) {
  return { received: formData.get('value') }
}
