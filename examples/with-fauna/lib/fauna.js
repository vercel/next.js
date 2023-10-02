import 'server-only'
import { Client, fql } from 'fauna'

const client = new Client({
  secret: process.env.FAUNA_CLIENT_SECRET,
})

export const getAllEntries = async () => {
  try {
    const dbresponse = await client.query(fql`
		Entry.all()
	`)
    return dbresponse.data.data
  } catch (error) {
    throw new Error(error.message)
  }
}

export const createEntry = async (name, message) => {
  try {
    const dbresponse = await client.query(fql`
			Entry.create({
				name: ${name},
				message: ${message},
				createdAt: Time.now(),
			})`)
    return dbresponse.data
  } catch (error) {
    throw new Error(error.message)
  }
}
