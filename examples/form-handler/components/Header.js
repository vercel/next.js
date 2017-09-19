import { Col, Row, Jumbotron } from 'react-bootstrap'

const Header = () => {
  return (
    <div>
      <Row style={{ marginTop: '10px' }}>
        <Col lg={8} lgOffset={2}>
          <Jumbotron style={{ borderRadius: '15px' }}>
            <h1 style={{textAlign: 'center'}}>Form Handler</h1>
          </Jumbotron>
        </Col>
      </Row>
    </div>
  )
}

export default Header
