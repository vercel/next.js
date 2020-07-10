import { useRouter } from 'next/router'
import useSWR from 'swr'
import Form from '../../components/Form'

const fetcher = (url) =>
  fetch(url)
    .then((res) => res.json())
    .then((json) => json.data)

const EditPet = () => {
  const router = useRouter()
  const { id } = router.query
  const { data: pet, error } = useSWR(id ? `/api/pets/${id}` : null, fetcher)

  if (error) return <p>Failed to load</p>
  if (!pet) return <p>Loading...</p>

  const petForm = {
    name: pet.name,
    owner_name: pet.owner_name,
    species: pet.species,
    age: pet.age,
    poddy_trained: pet.poddy_trained,
    diet: pet.diet,
    image_url: pet.image_url,
    likes: pet.likes,
    dislikes: pet.dislikes,
  }

  return <Form formId="edit-pet-form" petForm={petForm} forNewPet={false} />
}

export default EditPet
