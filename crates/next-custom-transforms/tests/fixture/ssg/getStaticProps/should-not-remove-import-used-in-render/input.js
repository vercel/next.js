import { useState, useEffect } from 'react'
import {
  Root,
  Children,
  JSXMemberExpression,
  AttributeValue,
  AttributeJSX,
  ValueInRender,
  ValueInEffect,
  UnusedInRender,
} from '../'

export default function Test() {
  const [x, setX] = useState(ValueInRender.value)
  useEffect(() => {
    setX(ValueInEffect.value)
  }, [])

  return (
    <Root x={x}>
      <div>
        <Children attr={AttributeValue} jsx={<AttributeJSX />} />
        <JSXMemberExpression.Deep.Property />
      </div>
    </Root>
  )
}

export async function getStaticProps() {
  return {
    props: {
      // simulate import usage inside getStaticProps
      used: [
        // these import references should not be removed
        Root.value,
        Children.value,
        AttributeValue.value,
        AttributeJSX.value,
        ValueInRender.value,
        ValueInEffect.value,
        JSXMemberExpression.value,
        // this import reference should be removed
        UnusedInRender.value,
      ],
    },
  }
}
