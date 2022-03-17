use std::{borrow::Cow, collections::{HashMap, hash_map::Entry, BTreeMap}};

use anyhow::{anyhow, bail, Result, Context};
use json::{JsonValue};

use super::options::ConditionValue;

#[derive(Clone, PartialEq, Eq, Hash, Debug)]
pub enum ExportsValue {
    Alternatives(Vec<ExportsValue>),
    Conditional(Vec<(String, ExportsValue)>),
    Result(String),
    Excluded,
}

impl ExportsValue {
    fn replace_wildcard(&self, value: &str) -> Result<Self> {
        Ok(match self {
            ExportsValue::Alternatives(list) => ExportsValue::Alternatives(
                list.iter()
                    .map(|v| v.replace_wildcard(value))
                    .collect::<Result<Vec<_>>>()?,
            ),
            ExportsValue::Conditional(list) => ExportsValue::Conditional(
                list.iter()
                    .map(|(c, v)| Ok((c.clone(), v.replace_wildcard(value)?)))
                    .collect::<Result<Vec<_>>>()?,
            ),
            ExportsValue::Result(v) => {
                if !v.contains("*") {
                    bail!("exports field value need to contain a wildcard (*) when the key contains one");
                }
                ExportsValue::Result(v.replace("*", value))
            }
            ExportsValue::Excluded => ExportsValue::Excluded,
        })
    }

    fn append_to_folder(&self, value: &str) -> Result<Self> {
        Ok(match self {
            ExportsValue::Alternatives(list) => ExportsValue::Alternatives(
                list.iter()
                    .map(|v| v.append_to_folder(value))
                    .collect::<Result<Vec<_>>>()?,
            ),
            ExportsValue::Conditional(list) => ExportsValue::Conditional(
                list.iter()
                    .map(|(c, v)| Ok((c.clone(), v.append_to_folder(value)?)))
                    .collect::<Result<Vec<_>>>()?,
            ),
            ExportsValue::Result(v) => {
                if !v.ends_with("/") {
                    bail!("exports field value need ends with '/' when the key ends with it");
                }
                ExportsValue::Result(v.to_string() + value)
            }
            ExportsValue::Excluded => ExportsValue::Excluded,
        })
    }

    pub fn add_results<'a>(&'a self, conditions: &BTreeMap<String, ConditionValue>, unspecified_condition: &ConditionValue, condition_overrides: &mut HashMap<&'a str, ConditionValue>, target: &mut Vec<&'a str>) -> bool {
        match self {
            ExportsValue::Alternatives(list) => {
                for value in list {
                    if value.add_results(conditions, unspecified_condition, condition_overrides, target) {
                        return true;
                    }
                }
                return false;
            },
            ExportsValue::Conditional(list) => {
                for (condition, value) in list {
                    let condition_value = condition_overrides.get(condition.as_str())
                        .or_else(|| conditions.get(condition))
                        .unwrap_or_else(|| unspecified_condition);
                    match condition_value {
                        ConditionValue::Set => {
                            if value.add_results(conditions, unspecified_condition, condition_overrides, target) {
                                return true;
                            }
                        },
                        ConditionValue::Unset => {},
                        ConditionValue::Unknown => {
                            condition_overrides.insert(condition, ConditionValue::Set);
                            if value.add_results(conditions, unspecified_condition, condition_overrides, target) {
                                condition_overrides.insert(condition, ConditionValue::Unset);
                            } else {
                                condition_overrides.remove(condition.as_str());
                            }
                        },
                    }
                }
                return false;
            },
            ExportsValue::Result(r) => {
                target.push(r);
                return true;
            },
            ExportsValue::Excluded => {
                return true;
            },
        }
    }
}

impl TryFrom<&JsonValue> for ExportsValue {
    type Error = anyhow::Error;
    fn try_from(value: &JsonValue) -> Result<Self> {
        match value {
            JsonValue::Null => Ok(ExportsValue::Excluded),
            JsonValue::Short(s) => Ok(ExportsValue::Result(s.to_string())),
            JsonValue::String(s) => Ok(ExportsValue::Result(s.to_string())),
            JsonValue::Number(_) => Err(anyhow!(
                "numeric values are invalid in exports/imports field"
            )),
            JsonValue::Boolean(_) => Err(anyhow!(
                "boolean values are invalid in exports/imports field"
            )),
            JsonValue::Object(o) => Ok(ExportsValue::Conditional(
                o.iter()
                    .map(|(key, value)| {
                        if key.starts_with(".") || key.starts_with("#") {
                            bail!("invalid key \"{}\" in an conditions object (Did you want to place this request on higher level?)", key);
                        } 
                        Ok((key.to_string(), value.try_into()?))})
                    .collect::<Result<Vec<_>>>()?,
            )),
            JsonValue::Array(a) => Ok(ExportsValue::Alternatives(a.iter().map(|value| Ok(value.try_into()?)).collect::<Result<Vec<_>>>()?)),
        }
    }
}

#[derive(Default, PartialEq, Eq)]
struct PrefixTreeEntry {
    direct_mapping: Option<ExportsValue>,
    wildcard_mapping: Option<(ExportsValue, bool)>,
    children: Option<PrefixTree>,
}

#[derive(Default, PartialEq, Eq)]
struct PrefixTree(HashMap<String, PrefixTreeEntry>);

impl PrefixTree {
    fn lookup<'a>(&'a self, request: &'a str) -> PrefixTreeIterator<'a> {
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
        PrefixTreeIterator::<'a> {
            stack,
            request_parts,
        }
    }

    fn get_or_insert<'a>(&'a mut self, part: &str) -> &'a mut PrefixTreeEntry {
        match self.0.entry(part.to_string()) {
            Entry::Occupied(entry) => entry.into_mut(),
            Entry::Vacant(entry) => entry.insert(PrefixTreeEntry::default()),
        }
    }

    fn insert(&mut self, request: &str, value: ExportsValue) -> Result<()> {
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
                    current = current.children.get_or_insert_default().get_or_insert(last_part);
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
                        let entry = current.children.get_or_insert_default().get_or_insert(last_part);
                        entry.direct_mapping = Some(value);
                    }
                }
            }
        }
        Ok(())
    }

    fn from_json(value: &JsonValue, mut request_filter: impl FnMut(&str) -> bool, shorthand: Option<&str>) -> Result<PrefixTree> {
        if let JsonValue::Object(o) = value {
            let all_requests = o.iter().all(|(key, _)| request_filter(key));
            let all_conditions = o.iter().all(|(key, _)| !key.starts_with(".") && !key.starts_with("#"));
            if all_requests {
                let mut this = Self::default();
                for (key, value) in o.iter() {
                    this.insert(key, value.try_into()?)?;
                }
                Ok(this)
            } else if all_conditions {
                if let Some(key) = shorthand {
                    Ok(PrefixTree([(key.to_string(), PrefixTreeEntry {
                        direct_mapping: Some(value.try_into()?),
                        ..Default::default()
                    })].into_iter().collect()))
                } else {
                    bail!("object need to contain keys that are requests");
                }
            } else {
                bail!("object contains a mix of requests and conditions, but conditions need to be placed below requests");
            }
        } else if let Some(key) = shorthand {
            Ok(PrefixTree([(key.to_string(), PrefixTreeEntry {
                direct_mapping: Some(value.try_into()?),
                ..Default::default()
            })].into_iter().collect()))
        } else {
            bail!("json value must be an object");
        }
    }
}

#[derive(PartialEq, Eq)]
pub struct ExportsField(PrefixTree);

#[derive(PartialEq, Eq)]
pub struct ImportsField(PrefixTree);

impl TryFrom<&JsonValue> for ExportsField {
    type Error = anyhow::Error;

    fn try_from(value: &JsonValue) -> Result<Self> {
        Ok(Self(PrefixTree::from_json(value, |request| request == "." || request.starts_with("./"), Some(".")).with_context(|| anyhow!("failed to parse 'exports' field value"))?))
    }
}

impl TryFrom<&JsonValue> for ImportsField {
    type Error = anyhow::Error;

    fn try_from(value: &JsonValue) -> Result<Self> {
        Ok(Self(PrefixTree::from_json(value, |request| request == "." || request.starts_with("./"), Some(".")).with_context(|| anyhow!("failed to parse 'exports' field value"))?))
    }
}

impl ExportsField {
    pub fn lookup<'a>(&'a self, request: &'a str) -> PrefixTreeIterator<'a> {
        self.0.lookup(request)
    }
}

impl ImportsField {
    pub fn lookup<'a>(&'a self, request: &'a str) -> PrefixTreeIterator<'a> {
        self.0.lookup(request)
    }
}

pub struct PrefixTreeIterator<'a> {
    stack: Vec<&'a PrefixTreeEntry>,
    request_parts: Vec<&'a str>,
}

impl<'a> Iterator for PrefixTreeIterator<'a> {
    type Item = Result<Cow<'a, ExportsValue>>;

    fn next(&mut self) -> Option<Self::Item> {
        while let Some(entry) = self.stack.pop() {
            let i = self.stack.len() + 1;
            if i == self.request_parts.len() {
                if let Some(value) = &entry.direct_mapping {
                    return Some(Ok(Cow::Borrowed(value)));
                }
            } else {
                if let Some((value, wildcard)) = &entry.wildcard_mapping {
                    let remaining = self.request_parts[i + 1..].join("/");
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
