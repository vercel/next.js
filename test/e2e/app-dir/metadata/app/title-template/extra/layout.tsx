export default function Layout(props) {
  return props.children
}

export const metadata = {
  title: {
    template: '%s | Extra Layout',
    default: 'extra layout default',
  },
}
