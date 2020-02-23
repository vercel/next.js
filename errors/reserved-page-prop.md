# Reserved Page Prop

#### Why This Error Occurred

In a page's data method `getStaticProps`, `getServerProps`, or `getInitialProps` a reserved prop was returned. Currently the only reserved page prop is `url`.

#### Possible Ways to Fix It

Change the name of the prop returned from method to any other name.
