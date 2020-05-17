import fetch from 'isomorphic-unfetch'
import { useEffect } from 'react'
import { useRouter } from 'next/router'

/* Allows you to view pet card info and delete pet card*/

const Pet = ({ pet }) => {
  const router = useRouter()

  useEffect(() => {
    document.querySelector('#delete-btn').addEventListener('click', () => {
      document.querySelector('.confirmation-box').classList.add('show')
    })
    document.querySelector('#yes-delete-btn').addEventListener('click', () => {
      deletePet()
    })
    document.querySelector('#no-delete-btn').addEventListener('click', () => {
      document.querySelector('.confirmation-box').classList.remove('show')
    })
  })

  const deletePet = async () => {
    const petID = router.query.id
    try {
      await fetch(`/api/pets/${petID}`, {
        method: 'Delete',
      })
      router.push('/')
    } catch (error) {
      console.log(error)
    }
  }

  return (
    <div className="pet-container">
      <>
        <h1>{pet.name}</h1>
        <p>{pet.owner_name}</p>
        <p>{pet.species}</p>
        <p>{pet.age}</p>
        <p>{pet.poddy_trained}</p>
        <p>{pet.diet}</p>
        <p>{pet.image_url}</p>
        <p>{pet.likes}</p>
        <p>{pet.dislikes}</p>
        <button className="btn delete" id="delete-btn" color="red">
          Delete
        </button>
      </>

      <div className="confirmation-box">
        <button className="btn" id="yes-delete-btn">
          Yes
        </button>
        <button className="btn" id="no-delete-btn">
          No
        </button>
      </div>
    </div>
  )
}

Pet.getInitialProps = async ({ query: { id } }) => {
  const res = await fetch(`${process.env.ROOT_URL}/api/pets/${id}`)
  const { data } = await res.json()

  return { pet: data }
}

export default Pet
