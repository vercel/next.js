import React from 'react'

export function getServerSideProps({ query: { id } }) {
  return { props: { id } }
}
export default function(props) {
  return (
    <div>
      <h1>My {props.id} blog post</h1>
      <p>
        Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod
        tempor incididunt ut labore et dolore magna aliqua.
      </p>
    </div>
  )
}
