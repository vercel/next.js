import { nextTestSetup } from 'e2e-utils'

describe('app-api', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should display the api routes mapped with the current url', async () => {
    const url = `http://localhost:${next.appPort}`
    const res = await next.fetch('/')
    const json = await res.json()
    expect(json).toEqual([
      { path: `${url}/pokemon`, description: "gotta catch 'em all!" },
      {
        path: `${url}/pokemon?type=grass`,
        description: 'sort pokemon by grass type',
      },
      { path: `${url}/pokemon/25`, description: "who's that pokemon?" },
    ])
  })

  it('should return a list of pokemon', async () => {
    const res = await next.fetch('/pokemon')
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(Array.isArray(json)).toBe(true)
    expect(json.length).toBeGreaterThan(0)
    expect(json[0]).toHaveProperty('id')
    expect(json[0]).toHaveProperty('name')
    expect(json[0]).toHaveProperty('url')
  })

  it('should filter pokemon by type', async () => {
    const type = 'fire'
    const res = await next.fetch(`/pokemon?type=${type}`)
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(Array.isArray(json)).toBe(true)
    json.forEach((pokemon) => {
      expect(pokemon.type).toContain(type)
    })
  })

  it('should return an error for invalid type', async () => {
    const invalidType = 'invalid'
    const res = await next.fetch(`/pokemon?type=${invalidType}`)
    const json = await res.json()
    expect(res.status).toBe(400)
    expect(json).toHaveProperty('error')
    expect(json.error).toBe(`Invalid type: '${invalidType}'`)
    expect(json).toHaveProperty('types')
    expect(Array.isArray(json.types)).toBe(true)
  })

  it('should return a specific pokemon by id', async () => {
    const pokemonId = 25
    const res = await next.fetch(`/pokemon/${pokemonId}`)
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toHaveProperty('id', pokemonId)
    expect(json).toHaveProperty('name', 'pikachu')
  })
})
