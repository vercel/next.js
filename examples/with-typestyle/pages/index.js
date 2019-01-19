import React from 'react'
import { style } from 'typestyle'

const className = style({ color: 'red' })
const RedText = ({ text }) => <div className={className}>{text}</div>

export default () => <RedText text='Hello Next.js!' />
