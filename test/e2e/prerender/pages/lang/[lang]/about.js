export default ({ lang }) => <p id="about">About: {lang}</p>

export const getStaticProps = ({ params: { lang } }) => ({
  props: {
    lang,
  },
})

export const getStaticPaths = () => ({
  paths: ['en', 'es', 'fr', 'de'].map((p) => `/lang/${p}/about`),
  fallback: false,
})
