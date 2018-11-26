import React from 'react';
import Link from 'next/link';
import {inject} from 'mobx-react';

@inject(({userStore: {getUserRepositoriesById}}, props) => ({
  repositories: getUserRepositoriesById(props.id),
}))
class Repositories extends React.Component {
  render() {
    const {repositories} = this.props;

    return (
      <div>
        {repositories.map(({name, url, description}) => (
          <section key={name} className="repository">
            <Link href={url}>
              <a>{name}</a>
            </Link>
            <div>{description}</div>
          </section>
        ))}
      </div>
    );
  }
}

export default Repositories;
