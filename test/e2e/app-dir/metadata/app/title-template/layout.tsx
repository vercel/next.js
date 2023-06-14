export default function Layout(props) {
  return props.children
}

export const metadata = {
  title: {
    template: '%s | Layout',
    default: 'title template layout default',
  },
}
