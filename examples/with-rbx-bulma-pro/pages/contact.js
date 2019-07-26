import {
  Section,
  Title,
  Field,
  Label,
  Control,
  Input,
  Textarea,
  Button
} from 'rbx'
import Layout from '../components/Layout'

const ContactPage = () => (
  <Layout>
    <Section>
      <Title as='h2'>Contact Form Example</Title>
      <Field>
        <Label>Name</Label>
        <Control>
          <Input type='text' name='name' placeholder='your name' />
        </Control>
      </Field>
      <Field>
        <Label>Email</Label>
        <Control>
          <Input type='email' name='email' placeholder='your email' />
        </Control>
      </Field>
      <Field>
        <Label>Subject</Label>
        <Control>
          <Input type='text' name='subject' placeholder='your subject' />
        </Control>
      </Field>
      <Field>
        <Label>Message</Label>
        <Control>
          <Textarea name='message' rows={10} placeholder='your message' />
        </Control>
      </Field>
      <Button.Group align='right'>
        <Button color='primary' key='submit'>
          Submit
        </Button>
      </Button.Group>
    </Section>
  </Layout>
)

export default ContactPage
