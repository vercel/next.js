import dynamic from 'next/dynamic'

interface WasmAddOneProps {
  add_one(number: Number): Number
}

interface RustComponentProps {
  number: Number
}

const RustComponent = dynamic({
  loader: async () => {
    // Import the wasm module
    // @ts-ignore
    const rustModule: WasmAddOneProps = await import('../add.wasm')

    // Return a React component that calls the add_one method on the wasm module
    return (props: RustComponentProps) => (
      <div>{rustModule.add_one(props.number)}</div>
    )
  },
})

export default RustComponent
