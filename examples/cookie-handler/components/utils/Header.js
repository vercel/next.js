import {Component} from 'react'
import { Col, Jumbotron, Button } from 'react-bootstrap'
import { connect } from 'react-redux'

class Header extends Component {
  logOut () {
    document.cookie = 'name=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;'
    document.location.pathname = '/'
  }

  render () {
    const { title, pathname } = this.props
    return (
      <div>
        <Col lg={8} lgOffset={2}>
          <Jumbotron style={{ borderRadius: '15px' }}>
            <h1 style={{textAlign: 'center'}}>{title}</h1>
            <h2 style={{textAlign: 'center'}}>{pathname}</h2>
            <h3>
              <p style={{textAlign: 'center'}}>
                <Button bsStyle='primary' onClick={this.logOut}>
                  Delete Name
                </Button>
              </p>
            </h3>
          </Jumbotron>
        </Col>
      </div>
    )
  }
}

const mapStateToProps = (state) => {
  return {
    state
  }
}

export default connect(mapStateToProps)(Header)
