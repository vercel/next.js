import { useRef, useState } from 'react'
import { Canvas, useFrame } from 'react-three-fiber'
import { OrbitControls, Box } from '@react-three/drei'

const MyBox = (props) => {
  const mesh = useRef()

  const [hovered, setHover] = useState(false)
  const [active, setActive] = useState(false)

  useFrame(() => (mesh.current.rotation.x = mesh.current.rotation.y += 0.01))

  return (
    <Box
      args={[1, 1, 1]}
      {...props}
      ref={mesh}
      scale={active ? [6, 6, 6] : [5, 5, 5]}
      onClick={() => setActive(!active)}
      onPointerOver={() => setHover(true)}
      onPointerOut={() => setHover(false)}
    >
      <meshStandardMaterial
        attach="material"
        color={hovered ? '#2b6c76' : '#720b23'}
      />
    </Box>
  )
}

const BoxesPage = () => {
  return [
    <h1>Click on me - Hover me :)</h1>,
    <Canvas camera={{ position: [0, 0, 35] }}>
      <ambientLight intensity={2} />
      <pointLight position={[40, 40, 40]} />
      <MyBox position={[10, 0, 0]} />
      <MyBox position={[-10, 0, 0]} />
      <MyBox position={[0, 10, 0]} />
      <MyBox position={[0, -10, 0]} />
      <OrbitControls />
    </Canvas>,
  ]
}

export default BoxesPage
