# AMP Export Validation

#### Why This Error Occurred

During export we validate AMP pages using [amphtml-validator](https://www.npmjs.com/package/amphtml-validator), when we receive an error from the validator that means an AMP page is invalid so the export is not valid.

#### Possible Ways to Fix It

Look at the error messages telling you the reasons for the error and update it to make the AMP page that caused the error to validate. 

### Useful Links

- [AMP HTML Specification](https://www.ampproject.org/docs/fundamentals/spec)
