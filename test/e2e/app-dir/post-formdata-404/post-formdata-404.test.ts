import { nextTestSetup } from 'e2e-utils'

describe('post-formdata-404', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should return 404 for POST with multipart/form-data to a non-existent route', async () => {
    const formData = new FormData()
    formData.append('name', 'test')

    const res = await next.fetch('/non-existent-route', {
      method: 'POST',
      body: formData,
    })

    expect(res.status).toBe(404)
  })

  it('should return 404 for POST with multipart/form-data to an existing route without server actions', async () => {
    const formData = new FormData()
    formData.append('name', 'test')

    const res = await next.fetch('/', {
      method: 'POST',
      body: formData,
    })

    expect(res.status).toBe(404)
  })
})
