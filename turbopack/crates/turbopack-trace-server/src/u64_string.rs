use std::{fmt::Display, str::FromStr};

use serde::{de, Deserialize, Deserializer, Serializer};

pub fn serialize<T, S>(value: &T, serializer: S) -> Result<S::Ok, S::Error>
where
    T: Display,
    S: Serializer,
{
    serializer.collect_str(value)
}

pub fn deserialize<'de, T, D>(deserializer: D) -> Result<T, D::Error>
where
    T: FromStr,
    T::Err: Display,
    D: Deserializer<'de>,
{
    String::deserialize(deserializer)?
        .parse()
        .map_err(de::Error::custom)
}
