use hashbrown::Equivalent;

#[derive(Hash)]
pub struct StringTupleRef<'a>(pub &'a str, pub &'a str);

impl<'a> Equivalent<(String, String)> for StringTupleRef<'a> {
    fn equivalent(&self, other: &(String, String)) -> bool {
        self.0 == other.0 && self.1 == other.1
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
            s.hash_one(&("abc".to_string(), "def".to_string()))
        );
    }
}
