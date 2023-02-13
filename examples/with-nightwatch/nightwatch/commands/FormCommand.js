export default class FormCommand {
  setEmail() {
    this.section.contactForm.setValue('@email', 'test@example.com')

    return this
  }

  setMessage() {
    this.section.contactForm.setValue('@message', 'This is a test message.')

    return this
  }

  submit() {
    this.section.contactForm.click('@submitButton')

    return this
  }

  fillAndSubmitForm() {
    return this.setEmail().setMessage().submit()
  }
}
