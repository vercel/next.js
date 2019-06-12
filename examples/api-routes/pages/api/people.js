import { people } from '../../data'

export default (req, res) => {
  const {
    query: { id }
  } = req

  if (id) {
    const filtered = people.filter(p => p.id === id)

    // User with id exists
    if (filtered.length > 0) {
      res.status(200).json(filtered[0])
    } else {
      res.status(404).json({ message: `User with id: ${id} not found.` })
    }
  } else {
    res.status(200).json(people)
  }
}
