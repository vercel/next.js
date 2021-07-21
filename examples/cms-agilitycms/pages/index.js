//this is just a pointer to the catch-all route and logic for all CMS driven pages (i.e. even rootpage is dynamic from the CMS)
export { default, getStaticProps } from './[...slug]';