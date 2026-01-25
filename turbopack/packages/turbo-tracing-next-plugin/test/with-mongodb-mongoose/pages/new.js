import Form from '../components/Form'

const NewPet = () => {
  const petForm = {
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
