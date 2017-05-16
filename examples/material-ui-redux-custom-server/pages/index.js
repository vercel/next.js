import App from '@/components/App'

import withRedux from 'next-redux-wrapper'

import { fetchData } from '@/reducer/newsListing';

import { initStore } from '@/store'

// custom component
import CSSTag from '@/components/CSSTag';
import style from '@/styles/index.scss';

// material ui
import { Card, CardActions, CardHeader, CardMedia, CardTitle, CardText } from 'material-ui/Card'
import { BottomNavigation, BottomNavigationItem } from 'material-ui/BottomNavigation'
import FlatButton from 'material-ui/FlatButton'
import Paper from 'material-ui/Paper'

import Apps from 'material-ui/svg-icons/navigation/apps'
import Stars from 'material-ui/svg-icons/action/stars'
import Favorite from 'material-ui/svg-icons/action/favorite'

class Index extends React.Component {
  static getInitialProps(context) {
    const { store, isServer, url } = context;
    return store.dispatch(fetchData({ sortBy: 'latest' })).then((newState) => {
      return { isServer, newState };
    });
  }

  constructor(props) {
    super(props)
    this.state = {
      selectedIndex: 0,
    }
  }

  select = (index) => this.setState({ selectedIndex: index })

  renderBottomNavigation() {
    const { dispatch } = this.props
    return (
      <Paper style={{ position: 'fixed', bottom: 0, zIndex: 1000, width: '100%' }} zDepth={1}>
        <BottomNavigation selectedIndex={this.state.selectedIndex}>
          <BottomNavigationItem
            label="Latest"
            icon={<Apps />}
            onTouchTap={() => {
              dispatch(fetchData({ sortBy: 'latest' }))
              this.select(0)
            }}
          />
          <BottomNavigationItem
            label="Top"
            icon={<Stars />}
            onTouchTap={() => {
              dispatch(fetchData({ sortBy: 'top' }))
              this.select(1)
            }}
          />
          {/*<BottomNavigationItem
            label="Popular"
            icon={<Favorite />}
            onTouchTap={() => {
              dispatch(fetchData({ sortBy: 'popular' }))
              this.select(2)
            }}
          />*/}
        </BottomNavigation>
      </Paper>
    )
  }

  render() {
    const { newsListing: { articles } } = this.props;
    return (
      <App>
        <div className="indexPage">
          <div className="container">
            <div className="row">
              {articles.map(item => (
                <Card key={item.url} className="cardItem">
                  <CardHeader
                    title={item.author}
                    subtitle={item.publishedDate}
                  />

                  <CardMedia overlay={<CardTitle title={item.title} subtitle={item.author} />}>
                    {item.urlToImage && <img src={item.urlToImage} role="presentation" />}
                  </CardMedia>

                  <CardTitle title={item.title} subtitle={item.publishedDate} />

                  <CardText>{item.description}</CardText>

                  <CardActions>
                    <a href={item.url} target="blank">
                      <FlatButton primary={true} label="Detail" />
                    </a>
                  </CardActions>
                </Card>
              ))}
            </div>
          </div>
        </div>
        {this.renderBottomNavigation()}
        <CSSTag style={style} />
      </App>
    )
  }
}

export default withRedux(initStore, (state) => ({
  newsListing: state.newsListing,
}))(Index);

