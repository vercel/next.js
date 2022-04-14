const domElements = ['div'];

const styled = () => {};

domElements.forEach(domElement => {
  styled[domElement] = styled(domElement);
});
