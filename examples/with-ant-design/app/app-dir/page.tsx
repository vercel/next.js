'use client'

import Link from 'next/link'
import { Button, Row, Space, Typography } from 'antd'

const { Title } = Typography

export default function AppDir() {
  return (
    <Row align="middle" justify="center" style={{ height: '100vh' }}>
      <Space direction="vertical" style={{ textAlign: 'center' }}>
        <Title>Welcome to the app directory!</Title>
        <Link href="/">
          <Button type="primary">Go pages directory</Button>
        </Link>
      </Space>
    </Row>
  )
}
