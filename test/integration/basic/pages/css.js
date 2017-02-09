import React from 'react'
import style from 'next/css'

export default () => <div id='red-box' className={styles}>This is red</div>

const styles = style({ color: 'red' })
