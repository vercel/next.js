import { useSelector } from "react-redux";
import { useRematchDispatch } from "../shared/utils";
import { initializeStore } from "../shared/store";
import CounterDisplay from "../shared/components/counter-display";
import Header from "../shared/components/header";

const Github = (props) => {
  const github = useSelector((state) => state.github);
  const { users, isLoading } = github;
  const { fetchUsers } = useRematchDispatch((dispatch) => ({
    fetchUsers: dispatch.github.fetchUsers,
  }));

  const { usersList } = props;
  return (
    <div>
      <Header />
      <h1> Github users </h1>
      <p>
        Server rendered github user list. You can also reload the users from the
        api by clicking the <b>Get users</b> button below.
      </p>
      <h1> Users passed as property from getStaticProps</h1>
      {usersList.map((user) => (
        <div key={user.login}>
          <a href={user.html_url}>
            <img height="45" width="45" src={user.avatar_url} />
            <span> Username - {user.login}</span>
          </a>
          <br />
        </div>
      ))}
      {isLoading ? <p>Loading ...</p> : null}
      <p>
        <button onClick={fetchUsers}>Get users</button>
      </p>
      {users.length === 0 ? null : <h1> Users fetched from async function</h1>}
      {users.map((user) => (
        <div key={user.login}>
          <a href={user.html_url}>
            <img height="45" width="45" src={user.avatar_url} />
            <span> Username - {user.login}</span>
          </a>
          <br />
        </div>
      ))}
      <br />
      <CounterDisplay />
    </div>
  );
};

export async function getStaticProps() {
  const store = initializeStore();
  const usersList = await store.dispatch.github.fetchUsers();

  return {
    props: {
      usersList,
    },
  };
}

export default Github;
