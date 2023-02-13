import FormCommand from '../commands/FormCommand.js'

export default {
  url: '/about',
  commands: FormCommand,
}

export const sections = {
  contactForm: {
    selector: 'form[class^=About_form]',
    elements: {
      email: {
        selector: '#email',
      },
      message: {
        selector: '#message',
      },
      submitButton: {
        selector: 'button[type=submit]',
      },
    },
  },
}

export const elements = {
  aboutHeading: {
    selector: 'h1',
  },
}
