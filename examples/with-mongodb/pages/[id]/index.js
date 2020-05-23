import { useState } from 'react'
import { useRouter } from 'next/router'

/* Allows you to view pet card info and delete pet card*/
const Pet = ({ pet }) => {
  const router = useRouter()
  const [confirm, setConfirm] = useState(false)
  const [message, setMessage] = useState('')

  const open = () => {
    setConfirm(true)
  }
  const close = () => {
    setConfirm(false)
  }

  const deletePet = async () => {
    const petID = router.query.id
    try {
      await fetch(`/api/pets/${petID}`, {
        method: 'Delete',
      })
      router.push('/')
    } catch (error) {
      setMessage('Failed to delete pet.')
    }
  }

  const handleDelete = async () => {
    deletePet()
    close()
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
        <button
          className="btn delete"
          id="delete-btn"
          color="red"
          onClick={open}
        >
          Delete
        </button>
        <p>{message}</p>
      </>

      {confirm && (
        <div className="confirmation-box">
          <button className="btn" id="yes-delete-btn" onClick={handleDelete}>
            Yes
          </button>
          <button className="btn" id="no-delete-btn" onClick={close}>
            No
          </button>
        </div>
      )}
    </div>
  )
}

export async function getStaticPaths() {
  const res = await fetch(`${process.env.VERCEL_URL}/api/pets`)
  const { data } = await res.json()

  const paths = data.map(pet => `/${pet._id}`)
  return { paths, fallback: false }
}

export async function getStaticProps({ params }) {
  const res = await fetch(`${process.env.VERCEL_URL}/api/pets/${params.id}`)
  const { data } = await res.json()

  return {
    props: {
      pet: data,
    },
  }
}

export default Pet
