use serde::{Deserialize, Deserializer, Serializer, de};

pub fn serialize<S>(value: &u64, serializer: S) -> Result<S::Ok, S::Error>
where
    S: Serializer,
{
    if *value == 0 {
        serializer.serialize_str("")
    } else {
        serializer.collect_str(&value)
    }
}

pub fn deserialize<'de, D>(deserializer: D) -> Result<u64, D::Error>
where
    D: Deserializer<'de>,
{
    let str = &String::deserialize(deserializer)?;
    if str.is_empty() {
        Ok(0)
    } else {
        str.parse().map_err(de::Error::custom)
    }
}
