import React from 'react'
import Page from '../components/page'
import Navbar from '../components/navbar'
import '../styles/index.scss'

const NoSSR = ({ children, placeholder }) =>
  typeof window === 'undefined' ? placeholder : children()

export default class MapPage extends React.Component {
  render () {
    return (
      <Page className='editor'>
        <section>
          <Navbar />
          <div>
            <div className='container has-text-centered'>
              <h1 className='title'>Heavy editor</h1>
              <h1 className='subtitle'>
                But it doesn't pollute bundle of home page
              </h1>
              <NoSSR placeholder={<div className='editor-container' />}>
                {() => {
                  const AceEditor = require('react-ace').default
                  require('brace')
                  require('brace/mode/javascript')
                  require('brace/theme/github')

                  return (
                    <AceEditor
                      className='editor-container'
                      width='300'
                      height='400'
                      mode='javascript'
                      theme='github'
                      name='unique_id'
                      editorProps={{ $blockScrolling: true }}
                    />
                  )
                }}
              </NoSSR>
            </div>
          </div>
        </section>
      </Page>
    )
  }
}
