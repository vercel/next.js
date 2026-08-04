/**
 * @jest-environment jsdom
 */
import { render } from '@testing-library/react'
import '@testing-library/jest-dom'
import { Draggable } from '../../packages/next/src/next-devtools/dev-overlay/components/errors/dev-tools-indicator/draggable'

describe('Draggable', () => {
  it('opts the drag surface out of browser touch gestures', () => {
    const { container } = render(
      <Draggable padding={20} position="bottom-left" setPosition={() => {}}>
        <div>child</div>
      </Draggable>
    )

    const surface = container.firstElementChild as HTMLElement
    expect(surface.style.touchAction).toBe('none')
  })

  it('keeps touch-action when a style prop is passed', () => {
    const { container } = render(
      <Draggable
        padding={20}
        position="bottom-left"
        setPosition={() => {}}
        style={{ zIndex: 1 }}
      >
        <div>child</div>
      </Draggable>
    )

    const surface = container.firstElementChild as HTMLElement
    expect(surface.style.touchAction).toBe('none')
    expect(surface.style.zIndex).toBe('1')
  })
})
