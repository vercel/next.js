import { Book } from '../interfaces'

export const sampleIsbns = ['9780747532699', '9780747538486', '9780747549505']

export async function fetchBooks(): Promise<Book[]> {
  const requestUrl = `https://openlibrary.org/api/books?bibkeys=${sampleIsbns
    .map((isbn) => `ISBN:${isbn}`)
    .join(',')}&format=json&jscmd=data`

  try {
    const response = await fetch(requestUrl)
    const data: { [isbn: string]: Book } = await response.json()
    const books = Object.entries(data).map(([isbn, book]) => ({
      ...book,
      isbn: isbn.replace('ISBN:', ''),
    }))
    return books
  } catch (error) {
    throw new Error(`Error fetching books: ${error}`)
  }
}
