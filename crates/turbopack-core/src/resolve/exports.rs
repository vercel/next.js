use std::collections::{BTreeMap, HashMap};

use anyhow::{anyhow, bail, Result};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::{
    alias_map::{AliasMap, AliasMapLookupIterator, AliasPattern, AliasTemplate},
    options::ConditionValue,
};

/// The result an "exports" field describes. Can represent multiple
/// alternatives, conditional result, ignored result (null mapping) and a plain
/// result.
#[derive(Clone, PartialEq, Eq, Hash, Debug, Serialize, Deserialize)]
pub enum ExportsValue {
    Alternatives(Vec<ExportsValue>),
    Conditional(Vec<(String, ExportsValue)>),
    Result(String),
    Excluded,
}

impl AliasTemplate for ExportsValue {
    type Output<'a> = Result<Self> where Self: 'a;

    fn replace(&self, capture: &str) -> Result<Self> {
        Ok(match self {
            ExportsValue::Alternatives(list) => ExportsValue::Alternatives(
                list.iter()
                    .map(|value| value.replace(capture))
                    .collect::<Result<Vec<_>>>()?,
            ),
            ExportsValue::Conditional(list) => ExportsValue::Conditional(
                list.iter()
                    .map(|(condition, value)| Ok((condition.clone(), value.replace(capture)?)))
                    .collect::<Result<Vec<_>>>()?,
            ),
            ExportsValue::Result(value) => ExportsValue::Result(value.replace('*', capture)),
            ExportsValue::Excluded => ExportsValue::Excluded,
        })
    }
}

impl ExportsValue {
    /// Returns an iterator over all leaf results.
    fn results_mut(&mut self) -> ResultsIterMut<'_> {
        ResultsIterMut { stack: vec![self] }
    }

    /// Walks the [ExportsValue] and adds results to the `target` vector. It
    /// uses the `conditions` to skip or enter conditional results.
    /// The state of conditions is stored within `condition_overrides`, which is
    /// also exposed to the consumer.
    pub fn add_results<'a>(
        &'a self,
        conditions: &BTreeMap<String, ConditionValue>,
        unspecified_condition: &ConditionValue,
        condition_overrides: &mut HashMap<&'a str, ConditionValue>,
        target: &mut Vec<&'a str>,
    ) -> bool {
        match self {
            ExportsValue::Alternatives(list) => {
                for value in list {
                    if value.add_results(
                        conditions,
                        unspecified_condition,
                        condition_overrides,
                        target,
                    ) {
                        return true;
                    }
                }
                false
            }
            ExportsValue::Conditional(list) => {
                for (condition, value) in list {
                    let condition_value = if condition == "default" {
                        &ConditionValue::Set
                    } else {
                        condition_overrides
                            .get(condition.as_str())
                            .or_else(|| conditions.get(condition))
                            .unwrap_or(unspecified_condition)
                    };
                    match condition_value {
                        ConditionValue::Set => {
                            if value.add_results(
                                conditions,
                                unspecified_condition,
                                condition_overrides,
                                target,
                            ) {
                                return true;
                            }
                        }
                        ConditionValue::Unset => {}
                        ConditionValue::Unknown => {
                            condition_overrides.insert(condition, ConditionValue::Set);
                            if value.add_results(
                                conditions,
                                unspecified_condition,
                                condition_overrides,
                                target,
                            ) {
                                condition_overrides.insert(condition, ConditionValue::Unset);
                            } else {
                                condition_overrides.remove(condition.as_str());
                            }
                        }
                    }
                }
                false
            }
            ExportsValue::Result(r) => {
                target.push(r);
                true
            }
            ExportsValue::Excluded => true,
        }
    }
}

struct ResultsIterMut<'a> {
    stack: Vec<&'a mut ExportsValue>,
}

impl<'a> Iterator for ResultsIterMut<'a> {
    type Item = &'a mut String;

    fn next(&mut self) -> Option<Self::Item> {
        while let Some(value) = self.stack.pop() {
            match value {
                ExportsValue::Alternatives(list) => {
                    for value in list {
                        self.stack.push(value);
                    }
                }
                ExportsValue::Conditional(list) => {
                    for (_, value) in list {
                        self.stack.push(value);
                    }
                }
                ExportsValue::Result(r) => return Some(r),
                ExportsValue::Excluded => {}
            }
        }
        None
    }
}

impl TryFrom<&Value> for ExportsValue {
    type Error = anyhow::Error;

    fn try_from(value: &Value) -> Result<Self> {
        match value {
            Value::Null => Ok(ExportsValue::Excluded),
            Value::String(s) => Ok(ExportsValue::Result(s.to_string())),
            Value::Number(_) => Err(anyhow!(
                "numeric values are invalid in exports field entries"
            )),
            Value::Bool(_) => Err(anyhow!(
                "boolean values are invalid in exports field entries"
            )),
            Value::Object(object) => Ok(ExportsValue::Conditional(
                object
                    .iter()
                    .map(|(key, value)| {
                        if key.starts_with('.') {
                            bail!(
                                "invalid key \"{}\" in an export field conditions object. Did you \
                                 mean to place this request at a higher level?",
                                key
                            );
                        }
                        Ok((key.to_string(), value.try_into()?))
                    })
                    .collect::<Result<Vec<_>>>()?,
            )),
            Value::Array(array) => Ok(ExportsValue::Alternatives(
                array
                    .iter()
                    .map(|value| value.try_into())
                    .collect::<Result<Vec<_>>>()?,
            )),
        }
    }
}

/// Content of an "exports" field in a package.json
#[derive(PartialEq, Eq, Serialize, Deserialize)]
pub struct ExportsField(AliasMap<ExportsValue>);

impl TryFrom<&Value> for ExportsField {
    type Error = anyhow::Error;

    fn try_from(value: &Value) -> Result<Self> {
        // The "exports" field can be an object, a string, or an array of strings.
        // https://nodejs.org/api/packages.html#exports
        let map = match value {
            Value::Object(object) => {
                let mut map = AliasMap::new();
                // Conditional exports can also be defined at the top-level of the
                // exports field, where they will apply to the package itself.
                let mut conditions = vec![];

                for (key, value) in object.iter() {
                    // NOTE: Node.js does not allow conditional and non-conditional keys
                    // to be mixed at the top-level, but we do.
                    if key != "." && !key.starts_with("./") {
                        conditions.push((key, value));
                        continue;
                    }

                    let mut value: ExportsValue = value.try_into()?;

                    let pattern = if is_folder_shorthand(key) {
                        expand_folder_shorthand(key, &mut value)?
                    } else {
                        AliasPattern::parse(key)
                    };

                    map.insert(pattern, value);
                }

                if !conditions.is_empty() {
                    map.insert(
                        AliasPattern::Exact(".".to_string()),
                        ExportsValue::Conditional(
                            conditions
                                .into_iter()
                                .map(|(key, value)| Ok((key.to_string(), value.try_into()?)))
                                .collect::<Result<Vec<_>>>()?,
                        ),
                    );
                }

                map
            }
            Value::String(string) => {
                let mut map = AliasMap::new();
                map.insert(
                    AliasPattern::exact("."),
                    ExportsValue::Result(string.to_string()),
                );
                map
            }
            Value::Array(array) => {
                let mut map = AliasMap::new();
                map.insert(
                    AliasPattern::exact("."),
                    // This allows for more complex patterns than the spec allows, since we accept
                    // the following:
                    // [{ "node": "./node.js", "default": "./index.js" }, "./index.js"]
                    ExportsValue::Alternatives(
                        array
                            .iter()
                            .map(|value| value.try_into())
                            .collect::<Result<Vec<_>>>()?,
                    ),
                );
                map
            }
            _ => {
                bail!("\"exports\" field must be an object or a string");
            }
        };
        Ok(Self(map))
    }
}

/// Returns true if the given string is a folder path shorthand.
fn is_folder_shorthand(key: &str) -> bool {
    key.ends_with('/') && key.find('*').is_none()
}

/// The exports field supports a shorthand for folders, where:
///   "./folder/": "./other-folder/"
/// is equivalent to
///   "./folder/*": "./other-folder/*"
/// This is not implemented directly by [`AliasMap`] as it is not
/// shared behavior with the tsconfig.json `paths` field. Instead,
/// we do the expansion here.
fn expand_folder_shorthand(key: &str, value: &mut ExportsValue) -> Result<AliasPattern> {
    // Transform folder patterns into wildcard patterns.
    let pattern = AliasPattern::wildcard(key, "");

    // Transform templates into wildcard patterns as well.
    for result in value.results_mut() {
        if result.ends_with('/') {
            if result.find('*').is_none() {
                result.push('*');
            } else {
                bail!(
                    "invalid exports field value \"{}\" for key \"{}\": \"*\" is not allowed in \
                     folder exports",
                    result,
                    key
                );
            }
        } else {
            bail!(
                "invalid exports field value \"{}\" for key \"{}\": folder exports must end with \
                 \"/\"",
                result,
                key
            );
        }
    }

    Ok(pattern)
}

impl ExportsField {
    /// Looks up a request string in the "exports" field. Returns an iterator of
    /// matching requests. Usually only the first one is relevant, except
    /// when conditions don't match or only partially match.
    pub fn lookup<'a>(&'a self, request: &'a str) -> AliasMapLookupIterator<'a, ExportsValue> {
        self.0.lookup(request)
    }
}
