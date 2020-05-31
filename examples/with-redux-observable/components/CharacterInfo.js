import { useSelector } from 'react-redux'

const UserInfo = ({ error, fetchCharacter, isFetchedOnServer = false }) => {
  const { name, id, username, email, phone, website } = useSelector(
    (state) => state.character
  )

  return (
    <div className="UserInfo">
      {error ? (
        <p>We encountered and error.</p>
      ) : (
        <article>
          <h3>Name: {name}</h3>
          <p>Id: {id}</p>
          <p>Username: {username}</p>
          <p>Email: {email}</p>
          <p>Phone: {phone}</p>
          <p>Website: {website}</p>
        </article>
      )}
      <p>
        (was character fetched on server? -{' '}
        <b>{isFetchedOnServer.toString()})</b>
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
}

export default UserInfo
