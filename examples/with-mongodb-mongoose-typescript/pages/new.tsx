import Form from '../components/Form'
import { IPet } from '../models/Pet'

const NewPet = () => {
  const petForm: IPet = {
    name: '',
    owner_name: '',
    species: '',
    age: 0,
    poddy_trained: false,
    diet: [],
    image_url: '',
    likes: [],
    dislikes: [],
  }

  return <Form formId="add-pet-form" petForm={petForm} />
}

export default NewPet
