import React from 'react'
import tachyons from 'tachyons/css/tachyons.min.css'

const SomeComponent = () =>
  <div className='sans-serif'>
    <article className='br2 ba dark-gray b--black-10 mv4 w-100 w-50-m w-25-l mw5 center'>
      <img src='http://placekitten.com/g/600/300' className='db w-100 br2 br--top' alt='Photo of a kitten looking menacing.' />
      <div className='pa2 ph3-ns pb3-ns'>
        <div className='dt w-100 mt1'>
          <div className='dtc'>
            <h1 className='f5 f4-ns mv0'>Cat</h1>
          </div>
          <div className='dtc tr'>
            <h2 className='f5 mv0'>$1,000</h2>
          </div>
        </div>
        <p className='f6 lh-copy measure mt2 mid-gray'>
          If it fits, i sits burrow under covers. Destroy couch leave hair everywhere,
          and touch water with paw then recoil in horror.
        </p>
      </div>
    </article>
  </div>

export default () =>
  <div>
    <SomeComponent />
    <style jsx global>{tachyons}</style>
  </div>
