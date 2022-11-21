const size = {
  mobile: '480px',
  tablet: '768px',
  desktop: '1024px',
};

const theme = {
  mobile: `@media (max-width: ${size.mobile})`,
  tablet: `@media (min-width: ${size.tablet})`,
  desktop: `@media (min-width: ${size.desktop})`,
};

export default theme