use arbitrary::Arbitrary;

#[derive(Debug, Arbitrary)]
pub struct Data<'a> {
  pub pat: &'a str,
  pub input: &'a str,
}
