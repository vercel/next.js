import { render } from '@react-three/offscreen'

render(<Scene />)

function Scene() {
  return (
    <mesh>
      <boxGeometry />
      <meshStandardMaterial color="orange" />
    </mesh>
  )
}
