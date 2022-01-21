# router-url-match-fix

#### Why This Error Occurred

<!-- Explain why the error occurred. Ensure the description makes it clear why the warning/error exists -->

Router is supposed to throw an error when it encounters a url with two forward and back slashes but this is not the behaviour we are looking for as there are many valid urls which have two forward slashes.

#### Possible Ways to Fix It

<!-- Explain how to fix the warning/error, potentially by providing alternative approaches. Ensure this section is actionable by users -->

I have removed the part from regex pattern which was matching two forward slashes and left only the pattern for matching two back slashes.
If this is not the expected behaviour then the error message itself can be removed.

### Useful Links

<!-- Add links to relevant documentation -->
