import {
  Button,
  DatePicker,
  Form,
  InputNumber,
  Select,
  Slider,
  Switch,
} from 'antd'
import { Inter } from 'next/font/google'
import type { DatePickerProps } from 'antd'
import { SmileFilled } from '@ant-design/icons'
import Link from 'next/link'

const inter = Inter({ subsets: ['latin'] })

const onDatePickerChange: DatePickerProps['onChange'] = (date, dateString) => {
  console.log(date, dateString)
}

function Home() {
  return (
    <div
      className={inter.className}
      style={{ padding: '100px 0', height: '100vh' }}
    >
      <div className="text-center mb-5">
        <Link href="#" className="logo mr-0">
          <SmileFilled style={{ fontSize: 48 }} />
        </Link>
        <p className="mb-0 mt-3 text-disabled">Welcome to the world !</p>
      </div>
      <div>
        <Form
          layout="horizontal"
          size={'large'}
          labelCol={{ span: 8 }}
          wrapperCol={{ span: 8 }}
        >
          <Form.Item label="Input Number">
            <InputNumber
              min={1}
              max={10}
              style={{ width: 100 }}
              defaultValue={3}
              name="inputNumber"
            />
          </Form.Item>
          <Form.Item label="Switch">
            <Switch defaultChecked />
          </Form.Item>
          <Form.Item label="Slider">
            <Slider defaultValue={70} />
          </Form.Item>
          <Form.Item label="Select">
            <Select
              defaultValue="lucy"
              style={{ width: 192 }}
              options={[
                { value: 'jack', label: 'Jack' },
                { value: 'lucy', label: 'Lucy' },
                { value: 'Yiminghe', label: 'yiminghe' },
                { value: 'disabled', disabled: true, label: 'Disabled' },
              ]}
            />
          </Form.Item>
          <Form.Item label="DatePicker">
            <DatePicker showTime onChange={onDatePickerChange} />
          </Form.Item>
          <Form.Item style={{ marginTop: 48 }} wrapperCol={{ offset: 8 }}>
            <Button type="primary" htmlType="submit">
              OK
            </Button>
            <Button style={{ marginLeft: 8 }}>Cancel</Button>
          </Form.Item>
        </Form>
      </div>
    </div>
  )
}

export default Home
