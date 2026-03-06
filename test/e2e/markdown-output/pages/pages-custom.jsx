export const markdown = true

export async function getServerSideProps(context) {
  return {
    props: {
      message: `hello-${context.query.id ?? 'missing'}`,
    },
  }
}

export function generateMarkdown(context, { content }) {
  return [
    'custom-start',
    `message:${context.props.message}`,
    `query:${context.query.id}`,
    `default:${content}`,
    'custom-end',
  ].join('\n')
}

export default function PagesCustomPage({ message }) {
  return <p>{message}</p>
}
