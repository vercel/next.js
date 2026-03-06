export const markdown = true

export async function getServerSideProps(context) {
  return {
    props: {
      message: `hello-${context.query.id ?? 'missing'}`,
    },
  }
}

export async function generateMarkdown(context, { renderDefault }) {
  const defaultMarkdown = await renderDefault()

  return [
    'custom-start',
    `message:${context.props.message}`,
    `query:${context.query.id}`,
    `default:${defaultMarkdown}`,
    'custom-end',
  ].join('\n')
}

export default function PagesCustomPage({ message }) {
  return <p>{message}</p>
}
