import { useSelector } from 'react-redux'

const useUser = () => {
  return useSelector((state) => ({
    character: state.character,
    error: state.error,
    isFetchedOnServer: state.isFetchedOnServer,
  }))
}

const UserInfo = () => {
  const { character, isFetchedOnServer, error } = useUser()
  const { name, id, username, email, phone, website } = character

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
        (was user fetched on server? - <b>{isFetchedOnServer.toString()})</b>
      </p>
      <p> Please note there are no more than 10 users in the API!</p>
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
