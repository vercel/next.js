export function useMDXComponents() {
  return {
    h1: (props) => <h1 style={{ color: 'red' }} {...props} />,
  }
}
