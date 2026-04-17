use hashbrown::Equivalent;
use turbo_rcstr::RcStr;

#[derive(Hash)]
pub struct StringTupleRef<'a>(pub &'a str, pub &'a str);

impl<'a> Equivalent<(RcStr, RcStr)> for StringTupleRef<'a> {
    fn equivalent(&self, other: &(RcStr, RcStr)) -> bool {
        other.0 == self.0 && other.1 == self.1
    }
}

#[cfg(test)]
mod string_tuple_ref_tests {
    use std::hash::RandomState;

    use super::*;

    #[test]
    fn test_string_tuple_ref_hash() {
        use std::hash::BuildHasher;

        let s = RandomState::new();
        assert_eq!(
            s.hash_one(StringTupleRef("abc", "def")),
            s.hash_one(&(RcStr::from("abc"), RcStr::from("def")))
        );
    }
}
