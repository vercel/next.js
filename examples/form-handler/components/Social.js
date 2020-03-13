import { Col, Row } from 'react-bootstrap'

import Input from '../handlers/Input'

const Social = () => {
  return (
    <div>
      <Row>
        <Col lg={8}>
          <Input controlLabel="Facebook" title="social" name="facebook" />
        </Col>
        <Col lg={8}>
          <Input controlLabel="Instagram" title="social" name="instagram" />
        </Col>
        <Col lg={8}>
          <Input controlLabel="Twitter" title="social" name="twitter" />
        </Col>
        <Col lg={8}>
          <Input controlLabel="GitHub" title="social" name="github" />
        </Col>
      </Row>
    </div>
  )
}

export default Social
