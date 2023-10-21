export const revalidate = 1

async function getData() {
  return {
    message: 'hello from page',
  }
}

export default async function nestedPage(props) {
  const data = await getData()
  return <p id="page-message">{data.message}</p>
}
