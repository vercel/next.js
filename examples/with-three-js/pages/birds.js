import dynamic from 'next/dynamic'
import { Suspense } from 'react'
import { Canvas } from 'react-three-fiber'
import { OrbitControls, StandardEffects } from 'drei'

const Bird = dynamic(() => import('../components/Bird'), { ssr: false })

const Birds = () => {
  return new Array(5).fill().map((_, i) => {
    const x = (15 + Math.random() * 30) * (Math.round(Math.random()) ? -1 : 1)
    const y = -10 + Math.random() * 20
    const z = -5 + Math.random() * 10
    const bird = ['stork', 'parrot', 'flamingo'][Math.round(Math.random() * 2)]
    let speed = bird === 'stork' ? 0.5 : bird === 'flamingo' ? 2 : 5
    let factor =
      bird === 'stork'
        ? 0.5 + Math.random()
        : bird === 'flamingo'
        ? 0.25 + Math.random()
        : 1 + Math.random() - 0.5

    return (
      <Bird
        key={i}
        position={[x, y, z]}
        rotation={[0, x > 0 ? Math.PI : 0, 0]}
        speed={speed}
        factor={factor}
        url={`/glb/${bird}.glb`}
      />
    )
  })
}

const BirdsPage = (props) => {
  return (
    <>
      <Canvas camera={{ position: [0, 0, 35] }}>
        <ambientLight intensity={2} />
        <pointLight position={[40, 40, 40]} />
        <OrbitControls />
        <Suspense fallback={null}>
          <Birds />
          <StandardEffects smaa />
        </Suspense>
      </Canvas>
    </>
  )
}

export default BirdsPage
