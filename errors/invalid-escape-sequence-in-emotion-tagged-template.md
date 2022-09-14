# Invalid escape sequence in Emotion tagged template

#### Why This Error Occurred

<!-- Explain why the error occurred. Ensure the description makes it clear why the warning/error exists -->

One or more escape sequence in an Emotion tagged template was incorrect. This prevented correct parsing before transformations were applied.

#### Possible Ways to Fix It

<!-- Explain how to fix the warning/error, potentially by providing alternative approaches. Ensure this section is actionable by users -->

Look for `\\` in the string to find the broken escape sequence(s). For example, `\\u` must be followed by four hex digits.

### Useful Links

<!-- Add links to relevant documentation -->

- [Next.js compiler Emotion configuration](https://nextjs.org/docs/advanced-features/compiler#emotion)
- [ECMAScript 2023 syntax for string literals](https://tc39.es/ecma262/multipage/ecmascript-language-lexical-grammar.html#sec-literals-string-literals)
