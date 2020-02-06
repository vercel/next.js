import React from 'react'
import { connect } from 'react-redux'

const CharacterInfo = ({
  character,
  error,
  fetchCharacter,
  isFetchedOnServer = false,
}) => (
  <div className="CharacterInfo">
    {error ? (
      <p>We encountered and error.</p>
    ) : (
      <article>
        <h3>Character: {character.name}</h3>
        <p>birth year: {character.birth_year}</p>
        <p>gender: {character.gender}</p>
        <p>skin color: {character.skin_color}</p>
        <p>eye color: {character.eye_color}</p>
      </article>
    )}
    <p>
      (was character fetched on server? - <b>{isFetchedOnServer.toString()})</b>
    </p>
    <style jsx>{`
      article {
        background-color: #528ce0;
        border-radius: 15px;
        padding: 15px;
        width: 250px;
        margin: 15px 0;
        color: white;
      }
      button {
        margin-right: 10px;
      }
    `}</style>
  </div>
)

export default connect(state => ({
  character: state.character,
  error: state.error,
  isFetchedOnServer: state.isFetchedOnServer,
}))(CharacterInfo)
