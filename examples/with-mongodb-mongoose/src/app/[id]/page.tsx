import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Pet, { Pets } from '@/models/Pet'

/* Allows you to view pet card info and delete pet card*/
export default function PetPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [pet, setPet] = useState<Pets>()
  const [message, setMessage] = useState('')
  useEffect(() => {
    const fetchPetById = async (id: string) => {
      try {
        const pet = await Pet.findById(id).lean()
        const serializedPet = JSON.parse(JSON.stringify(pet))
        setPet(serializedPet)
      } catch (e) {
        console.log(e)
      }
    }
    fetchPetById(searchParams.get('id')!)
  }, [searchParams])
  const handleDelete = async () => {
    const petID = searchParams.get('id')

    try {
      await fetch(`/api/pets/${petID}`, {
        method: 'Delete',
      })
      router.push('/')
    } catch (error) {
      setMessage('Failed to delete the pet.')
    }
  }

  return (
    pet && (
      <div key={pet._id}>
        <div className="card">
          <img src={pet.image_url} />
          <h5 className="pet-name">{pet.name}</h5>
          <div className="main-content">
            <p className="pet-name">{pet.name}</p>
            <p className="owner">Owner: {pet.owner_name}</p>

            {/* Extra Pet Info: Likes and Dislikes */}
            <div className="likes info">
              <p className="label">Likes</p>
              <ul>
                {pet.likes.map((data, index) => (
                  <li key={index}>{data} </li>
                ))}
              </ul>
            </div>
            <div className="dislikes info">
              <p className="label">Dislikes</p>
              <ul>
                {pet.dislikes.map((data, index) => (
                  <li key={index}>{data} </li>
                ))}
              </ul>
            </div>

            <div className="btn-container">
              <Link href={`/${pet._id}/edit`}>
                <button className="btn edit">Edit</button>
              </Link>
              <button className="btn delete" onClick={handleDelete}>
                Delete
              </button>
            </div>
          </div>
        </div>
        {message && <p>{message}</p>}
      </div>
    )
  )
}
