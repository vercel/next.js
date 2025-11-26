export default function Page() {
  return 'pages-page (node)'
}

// Use gssp to opt-in dynamic rendering
export function getServerSideProps() {
  return { props: {} }
}
