class FormCommand {
  setEmail() {
    this.page.setValue("#email", "test@example.com");

    return this;
  }

  setMessage() {
    this.page.setValue("#message", "This is a test message.");

    return this;
  }

  submitData() {
    this.page.section.contactForm.click("@submitButton");

    return this;
  }

  fillAndSubmitForm() {
    return this.setEmail().setMessage().submitData();
  }
}

module.exports = {
  url: function () {
    return this.api.launchUrl + "/about";
  },
  commands: FormCommand,

  elements: {
    aboutHeading: {
      selector: "h1",
    },
  },

  sections: {
    contactForm: {
      selector: "[class^=About_form]",
      elements: {
        email: {
          selector: "#email",
        },
        message: {
          selector: "#message",
        },
        submitButton: {
          selector: "[class^=About_formButton]",
        },
      },
    },
  },
};
