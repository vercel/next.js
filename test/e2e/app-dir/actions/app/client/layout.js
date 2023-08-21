async function noopAction() {
  'use server'
}

console.log(!!noopAction())

export default function Layout({ children }) {
  return children
}
