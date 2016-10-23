import React from 'react'
import { style } from 'next/css'

export default () => <div className={styles}>This is red</div>

const styles = style({ color: 'red' })
