import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import {inject, observer} from 'mobx-react';

import Nav from '../components/Nav';
import Repositories from '../components/Repositories';

class User extends React.Component {
  static async getInitialProps({store: {userStore}, query}) {
    const {id} = query;
    const userPromise = userStore.fetchUser(id);
    const userRepositoriesPromise = userStore.fetchUserRepositories(id);

    await userPromise;
    await userRepositoriesPromise;

    const user = userStore.getUserById(id);

    if (!user) {
      return {
        statusCode: 404,
      };
    }

    return {
      user,
    };
  }

  render() {
    const {user} = this.props;

    return (
      <div>
        <Nav />
        <Head>
          <title>{user.name}</title>
        </Head>
        <section className="wrapper-detail">
          <div className="basic">
            <img src={user.image} alt={user.id} />
            <h3>
              <div>{user.name}</div>
              <small>
                <em>{user.id}</em>
              </small>
            </h3>

            <div>{user.tagline}</div>
            <hr />
            <div>🏡 {user.location}</div>
            <div>✉️ {user.email}</div>
          </div>
          <div className="repositories">
            <Repositories id={user.id} />
          </div>
        </section>
      </div>
    );
  }
}

export default User;
