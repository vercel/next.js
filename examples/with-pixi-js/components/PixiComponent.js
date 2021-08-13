import React, { useState } from 'react'
import { Stage, Container, Sprite, useTick } from '@inlet/react-pixi'
import { settings, SCALE_MODES } from 'pixi.js'

settings.SCALE_MODE = SCALE_MODES.NEAREST

const VercelLogo = () => {
  const [rotation, setRotation] = useState(0)
  useTick((delta) => delta && setRotation(rotation + 0.1 * delta))

  return <Sprite image="/logo.jpg" anchor={0.5} scale={1} rotation={rotation} />
}

const PixiComponent = () => {
  return (
    <Stage width={500} height={500}>
      <Container position={[250, 250]}>
        <VercelLogo />
      </Container>
    </Stage>
  )
}

export default PixiComponent
