import Form from '../../components/Form'

const EditPet = ({ pet }) => {
  const form = {
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
  return Form('edit-pet-form', form, false)
}

export async function getStaticPaths() {
  const res = await fetch(`${process.env.VERCEL_URL}/api/pets`)
  const { data } = await res.json()

  const paths = data.map(pet => `/${pet._id}/edit`)
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

export default EditPet
