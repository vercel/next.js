import fetch from 'isomorphic-unfetch'
import { useRouter } from 'next/router'

const Form = (formId, forNewPet = true) => {
  const router = useRouter()
  const contentType = 'application/json'

  /* The PUT method edits an existing entry in the mongodb database. */
  const putData = async form => {
    try {
      await fetch(`/api/pets/${router.query.id}`, {
        method: 'PUT',
        headers: {
          Accept: contentType,
          'Content-Type': contentType,
        },
        body: JSON.stringify(form),
      })
      router.push('/')
    } catch (error) {
      console.log(error)
    }
  }

  /* The POST method adds a new entry in the mongodb database. */
  const postData = async form => {
    try {
      await fetch('/api/pets', {
        method: 'POST',
        headers: {
          Accept: contentType,
          'Content-Type': contentType,
        },
        body: JSON.stringify(form),
      })
      router.push('/')
    } catch (error) {
      console.log(error)
    }
  }

  const handleSubmit = e => {
    e.preventDefault()
    let form = {}

    // For each field in the pet form, add the value to the form object
    document
      .querySelectorAll(`#${formId} input, #${formId} textarea`)
      .forEach(element => {
        if (element.name === 'age') form[element.name] = parseInt(element.value)
        else if (element.name === 'likes' || element.name === 'dislikes')
          form[element.name] = [element.value]
        else if (element.name === 'poddy_trained') {
          form[element.name] = element.checked
        } else form[element.name] = element.value
      })

    if (forNewPet) postData(form)
    else putData(form)
  }

  return (
    <form action="POST" id={formId} onSubmit={handleSubmit}>
      <label htmlFor="name">Name</label>
      <input type="text" maxLength="20" name="name" required />

      <label htmlFor="owner_name">Owner</label>
      <input type="text" maxLength="20" name="owner_name" required />

      <label htmlFor="species">Species</label>
      <input type="text" maxLength="30" name="species" required />

      <label htmlFor="age">Age</label>
      <input type="number" name="age" />

      <label htmlFor="poddy_trained">Potty Trained</label>
      <input type="checkbox" name="poddy_trained" />

      <label htmlFor="diet">Diet</label>
      <textarea name="diet"></textarea>

      <label htmlFor="image_url">Image URL</label>
      <input type="url" name="image_url" required />

      <label htmlFor="likes">Likes</label>
      <textarea name="likes" maxLength="60"></textarea>

      <label htmlFor="dislikes">Dislikes</label>
      <textarea name="dislikes" maxLength="60"></textarea>

      <button type="submit" className="btn">
        Submit
      </button>
    </form>
  )
}

export default Form
