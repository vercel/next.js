import { useEffect } from 'react'
import fetch from 'isomorphic-unfetch'
import Form from '../../components/Form'

const EditPet = ({ pet }) => {
  useEffect(() => {
    document
      .querySelectorAll('#edit-pet-form input, #edit-pet-form textarea')
      .forEach(element => {
        if (element.name === 'poddy_trained')
          element.checked = pet[element.name]
        else element.value = pet[element.name]
      })
  })

  return Form('edit-pet-form', false)
}

EditPet.getInitialProps = async ({ query: { id } }) => {
  const res = await fetch(`${process.env.VERCEL_URL}/api/pets/${id}`)
  const { data } = await res.json()

  return { pet: data }
}

export default EditPet
