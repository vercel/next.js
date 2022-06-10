use std::{
    borrow::Cow,
    collections::{hash_map::Entry, HashMap},
};

use anyhow::{bail, Result};
use json::JsonValue;
use serde::{Deserialize, Serialize};
use turbo_tasks::trace::TraceRawVcs;

#[derive(Debug, Clone, PartialEq, Eq, TraceRawVcs, Serialize, Deserialize)]
struct PrefixTreeEntry<T> {
    direct_mapping: Option<T>,
    wildcard_mapping: Option<(T, bool)>,
    children: Option<PrefixTree<T>>,
}

impl<T> Default for PrefixTreeEntry<T> {
    fn default() -> Self {
        Self {
            direct_mapping: None,
            wildcard_mapping: None,
            children: None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, TraceRawVcs, Serialize, Deserialize)]
pub struct PrefixTree<T>(HashMap<String, PrefixTreeEntry<T>>);

impl<T> Default for PrefixTree<T> {
    fn default() -> Self {
        Self(Default::default())
    }
}

impl<T> PrefixTree<T> {
    pub fn new() -> Self {
        Default::default()
    }

    pub fn lookup<'a>(&'a self, request: &'a str) -> PrefixTreeIterator<'a, T> {
        let request_parts = request.split("/").collect::<Vec<_>>();
        let mut current = self;
        let mut stack = Vec::new();
        for part in request_parts.iter() {
            if let Some(entry) = current.0.get(*part) {
                stack.push(entry);
                if let Some(children) = &entry.children {
                    current = children;
                } else {
                    break;
                }
            } else {
                break;
            }
        }
        PrefixTreeIterator::<'a, T> {
            stack,
            request_parts,
        }
    }

    fn get_or_insert<'a>(&'a mut self, part: &str) -> &'a mut PrefixTreeEntry<T> {
        match self.0.entry(part.to_string()) {
            Entry::Occupied(entry) => entry.into_mut(),
            Entry::Vacant(entry) => entry.insert(PrefixTreeEntry::default()),
        }
    }

    pub fn insert(&mut self, request: &str, value: T) -> Result<()> {
        let mut split = request.split("/");
        let mut last_part = split.next().unwrap();
        if last_part.is_empty() {
            bail!("empty request key is not valid");
        }
        if last_part == "*" {
            bail!("wildcard (*) only request key is not valid (Did you mean \"./*\" instead?)");
        }
        let mut current = self.get_or_insert(last_part);
        match split.next() {
            None => {
                current.direct_mapping = Some(value);
            }
            Some(second) => {
                last_part = second;
                for part in split {
                    current = current
                        .children
                        .get_or_insert_default()
                        .get_or_insert(last_part);
                    last_part = part;
                }
                match last_part {
                    "" => {
                        // it's a folder mapping "abc/"
                        current.wildcard_mapping = Some((value, false));
                    }
                    "*" => {
                        // it's a wildcard mapping "abc/*"
                        current.wildcard_mapping = Some((value, true));
                    }
                    _ => {
                        // it's a direct mapping
                        let entry = current
                            .children
                            .get_or_insert_default()
                            .get_or_insert(last_part);
                        entry.direct_mapping = Some(value);
                    }
                }
            }
        }
        Ok(())
    }
}

impl<'a, T: TryFrom<&'a JsonValue, Error = anyhow::Error>> PrefixTree<T> {
    pub fn from_json(
        value: &'a JsonValue,
        mut request_filter: impl FnMut(&str) -> bool,
        shorthand: Option<&str>,
    ) -> Result<PrefixTree<T>> {
        if let JsonValue::Object(o) = value {
            let all_requests = o.iter().all(|(key, _)| request_filter(key));
            if all_requests {
                let mut this = Self::default();
                for (key, value) in o.iter() {
                    this.insert(key, value.try_into()?)?;
                }
                Ok(this)
            } else if let Some(key) = shorthand {
                Ok(PrefixTree(
                    [(
                        key.to_string(),
                        PrefixTreeEntry {
                            direct_mapping: Some(value.try_into()?),
                            ..Default::default()
                        },
                    )]
                    .into_iter()
                    .collect(),
                ))
            } else {
                bail!("object need to contain keys that are requests");
            }
        } else if let Some(key) = shorthand {
            Ok(PrefixTree(
                [(
                    key.to_string(),
                    PrefixTreeEntry {
                        direct_mapping: Some(value.try_into()?),
                        ..Default::default()
                    },
                )]
                .into_iter()
                .collect(),
            ))
        } else {
            bail!("json value must be an object");
        }
    }
}

pub struct PrefixTreeIterator<'a, T> {
    stack: Vec<&'a PrefixTreeEntry<T>>,
    request_parts: Vec<&'a str>,
}

impl<'a, T: Clone + WildcardReplacable> Iterator for PrefixTreeIterator<'a, T> {
    type Item = Result<Cow<'a, T>>;

    fn next(&mut self) -> Option<Self::Item> {
        while let Some(entry) = self.stack.pop() {
            let i = self.stack.len() + 1;
            if i == self.request_parts.len() {
                if let Some(value) = &entry.direct_mapping {
                    return Some(Ok(Cow::Borrowed(value)));
                }
            } else {
                if let Some((value, wildcard)) = &entry.wildcard_mapping {
                    let remaining = self.request_parts[i..].join("/");
                    return Some(
                        (if *wildcard {
                            value.replace_wildcard(&remaining)
                        } else {
                            value.append_to_folder(&remaining)
                        })
                        .map(|v| Cow::Owned(v)),
                    );
                }
            }
        }
        None
    }
}

pub trait WildcardReplacable: Sized {
    fn replace_wildcard(&self, value: &str) -> Result<Self>;
    fn append_to_folder(&self, value: &str) -> Result<Self>;
}
