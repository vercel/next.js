# Duplicate Document Components

#### Why This Error Occurred

<!-- Explain why the error occurred. Ensure the description makes it clear why the warning/error exists -->

In your custom &#x60;pages/\_document&#x60;, more than one &#x60;&lt;Main /&gt;&#x60; or &#x60;&lt;Head /&gt;&#x60; component was rendered. Note that &#x60;&lt;Head /&gt;&#x60; from &#x60;next/document&#x60; is not the same as &#x60;&lt;Head /&gt;&#x60; from &#x60;next/head&#x60;.

#### Possible Ways to Fix It

<!-- Explain how to fix the warning/error, potentially by providing alternative approaches. Ensure this section is actionable by users -->

Ensure that only one of these components is rendered in your &#x60;pages/\_document&#x60;.

### Useful Links

<!-- Add links to relevant documentation -->

- [Custom Document docs](https://nextjs.org/docs/advanced-features/custom-document)
