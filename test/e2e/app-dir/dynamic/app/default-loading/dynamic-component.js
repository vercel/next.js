const isDevTest = false

const DynamicImportComponent = () => {
  if (isDevTest && typeof window === 'undefined') {
    throw new Error('This component should only be rendered on the client side')
  }
  return (
    <div id="dynamic-component">This is a dynamically imported component</div>
  )
}

export default DynamicImportComponent
