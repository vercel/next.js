const slug = (str: string) => {
  return str
    .toLowerCase()
    .replace(/\s/g, "-")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
};

export default slug;
