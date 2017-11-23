import React from 'react';
import Button from 'antd/lib/button';
import Badge from 'antd/lib/badge';
import antdStyle from 'antd/lib/style/index.css';
import buttonStyle from 'antd/lib/button/style/index.css';
import badgeStyle from 'antd/lib/badge/style/index.css';
import forkAntdStyle from '../styles/fork-antd.scss';
import withStyles from '../hocs/withStyles';

@withStyles(antdStyle, buttonStyle, badgeStyle, forkAntdStyle)
export default class extends React.Component {
  render() {
    let { stars } = this.props;
    return (
      <Badge className="fork-antd-badge" count={stars || 0}>
        <a href="https://github.com/zeit/next.js">
          <Button type="primary">Fork me</Button>
        </a>
      </Badge>
    );
  }
}
