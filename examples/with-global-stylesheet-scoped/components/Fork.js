import React from 'react';
import fork from '../styles/fork.scss';
import material from '../styles/material.deep_purple-blue.min.css';
import withStyles from '../hocs/withStyles';

@withStyles(material, fork)
export default class extends React.Component {
  render() {
    let { stars } = this.props;
    return (
      <div>
        <div
          className="material-icons mdl-badge mdl-badge--overlap"
          data-badge={stars || 0}
        >
          <a href="https://github.com/zeit/next.js">
            <button className="mdl-button mdl-js-button mdl-button--raised mdl-button--colored">
              Fork me
            </button>
          </a>
        </div>
      </div>
    );
  }
}
