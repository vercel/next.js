'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Pets } from '@/models/Pet'

type PetsProps = {
  pets: Pets[]
}

export default function Page() {
  const [pets, setPets] = useState<PetsProps>()
  useEffect(() => {
    const fetchPets = async () => {
      try {
        const res = await fetch('/api')
        if (res.ok) {
          const pets = await res.json()
          setPets(pets.data)
        }
      } catch (e) {
        console.log(e)
      }
    }
    fetchPets()
  }, [])
  return (
    <>
      {pets?.pets?.map((pet: Pets) => (
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
                <Link href={{ pathname: '/[id]/edit', query: { id: pet._id } }}>
                  <button className="btn edit">Edit</button>
                </Link>
                <Link href={{ pathname: '/[id]', query: { id: pet._id } }}>
                  <button className="btn view">View</button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      ))}
    </>
  )
}
