use anyhow::Result;
use indexmap::IndexMap;
use lazy_static::lazy_static;
use regex::Regex;
use turbo_tasks::{TryJoinIterExt, Value, ValueToString, Vc};

use super::pattern::{Pattern, QueryMap};

#[turbo_tasks::value]
#[derive(Hash, Clone, Debug)]
pub enum Request {
    Raw {
        path: Pattern,
        force_in_context: bool,
    },
    Relative {
        path: Pattern,
        force_in_context: bool,
    },
    Module {
        module: String,
        path: Pattern,
        query: Vc<QueryMap>,
    },
    ServerRelative {
        path: Pattern,
    },
    Windows {
        path: Pattern,
    },
    Empty,
    PackageInternal {
        path: Pattern,
    },
    Uri {
        protocol: String,
        remainder: String,
    },
    Unknown {
        path: Pattern,
    },
    Dynamic,
    Alternatives {
        requests: Vec<Vc<Request>>,
    },
}

impl Request {
    pub fn request(&self) -> Option<String> {
        Some(match self {
            Request::Raw {
                path: Pattern::Constant(path),
                ..
            } => path.to_string(),
            Request::Relative {
                path: Pattern::Constant(path),
                ..
            } => path.to_string(),
            Request::Module {
                module,
                path: Pattern::Constant(path),
                query: _,
            } => format!("{module}{path}"),
            Request::ServerRelative {
                path: Pattern::Constant(path),
            } => path.to_string(),
            Request::Windows {
                path: Pattern::Constant(path),
            } => path.to_string(),
            Request::Empty => "".to_string(),
            Request::PackageInternal {
                path: Pattern::Constant(path),
            } => path.to_string(),
            Request::Uri {
                protocol,
                remainder,
            } => format!("{protocol}{remainder}"),
            Request::Unknown {
                path: Pattern::Constant(path),
            } => path.to_string(),
            _ => return None,
        })
    }

    pub fn parse_ref(mut request: Pattern) -> Self {
        request.normalize();
        match request {
            Pattern::Dynamic => Request::Dynamic,
            Pattern::Constant(ref r) => {
                if r.is_empty() {
                    Request::Empty
                } else if r.starts_with('/') {
                    Request::ServerRelative { path: request }
                } else if r.starts_with('#') {
                    Request::PackageInternal { path: request }
                } else if r.starts_with("./") || r.starts_with("../") || r == "." || r == ".." {
                    Request::Relative {
                        path: request,
                        force_in_context: false,
                    }
                } else {
                    lazy_static! {
                        static ref WINDOWS_PATH: Regex =
                            Regex::new(r"^([A-Za-z]:\\|\\\\)").unwrap();
                        static ref URI_PATH: Regex = Regex::new(r"^([^/\\]+:)(.+)").unwrap();
                        static ref MODULE_PATH: Regex =
                            Regex::new(r"^((?:@[^/]+/)?[^/]+)([^?]*)(.*)").unwrap();
                    }
                    if WINDOWS_PATH.is_match(r) {
                        return Request::Windows { path: request };
                    }
                    if let Some(caps) = URI_PATH.captures(r) {
                        if let (Some(protocol), Some(remainder)) = (caps.get(1), caps.get(2)) {
                            // TODO data uri
                            return Request::Uri {
                                protocol: protocol.as_str().to_string(),
                                remainder: remainder.as_str().to_string(),
                            };
                        }
                    }
                    if let Some(caps) = MODULE_PATH.captures(r) {
                        if let (Some(module), Some(path), query) =
                            (caps.get(1), caps.get(2), caps.get(3))
                        {
                            return Request::Module {
                                module: module.as_str().to_string(),
                                path: path.as_str().to_string().into(),
                                query: Vc::cell(query.map(|q| {
                                    IndexMap::from_iter(qstring::QString::from(q.as_str()))
                                })),
                            };
                        }
                    }
                    Request::Unknown { path: request }
                }
            }
            Pattern::Concatenation(list) => {
                let mut iter = list.into_iter();
                if let Some(first) = iter.next() {
                    let mut result = Self::parse_ref(first);
                    match &mut result {
                        Request::Raw { path, .. } => {
                            path.extend(iter);
                        }
                        Request::Relative { path, .. } => {
                            path.extend(iter);
                        }
                        Request::Module {
                            module: _,
                            path,
                            query: _,
                        } => {
                            path.extend(iter);
                        }
                        Request::ServerRelative { path } => {
                            path.extend(iter);
                        }
                        Request::Windows { path } => {
                            path.extend(iter);
                        }
                        Request::Empty => {
                            result = Request::parse_ref(Pattern::Concatenation(iter.collect()))
                        }
                        Request::PackageInternal { path } => {
                            path.extend(iter);
                        }
                        Request::Uri { .. } => {
                            result = Request::Dynamic;
                        }
                        Request::Unknown { path } => {
                            path.extend(iter);
                        }
                        Request::Dynamic => {}
                        Request::Alternatives { .. } => unreachable!(),
                    };
                    result
                } else {
                    Request::Empty
                }
            }
            Pattern::Alternatives(list) => Request::Alternatives {
                requests: list
                    .into_iter()
                    .map(|p| Request::parse(Value::new(p)))
                    .collect(),
            },
        }
    }
}

#[turbo_tasks::value_impl]
impl Request {
    #[turbo_tasks::function]
    pub fn parse(request: Value<Pattern>) -> Vc<Self> {
        Self::cell(Request::parse_ref(request.into_value()))
    }

    #[turbo_tasks::function]
    pub fn parse_string(request: String) -> Vc<Self> {
        Self::cell(Request::parse_ref(request.into()))
    }

    #[turbo_tasks::function]
    pub fn raw(request: Value<Pattern>, force_in_context: bool) -> Vc<Self> {
        Self::cell(Request::Raw {
            path: request.into_value(),
            force_in_context,
        })
    }

    #[turbo_tasks::function]
    pub fn relative(request: Value<Pattern>, force_in_context: bool) -> Vc<Self> {
        Self::cell(Request::Relative {
            path: request.into_value(),
            force_in_context,
        })
    }

    #[turbo_tasks::function]
    pub fn module(module: String, path: Value<Pattern>, query: Vc<QueryMap>) -> Vc<Self> {
        Self::cell(Request::Module {
            module,
            path: path.into_value(),
            query,
        })
    }

    #[turbo_tasks::function]
    pub async fn as_relative(self: Vc<Self>) -> Result<Vc<Self>> {
        let this = self.await?;
        Ok(match &*this {
            Request::Empty
            | Request::Raw { .. }
            | Request::ServerRelative { .. }
            | Request::Windows { .. }
            | Request::Relative { .. }
            | Request::Uri { .. }
            | Request::Dynamic => self,
            Request::Module {
                module,
                path,
                query: _,
            } => {
                let mut pat = Pattern::Constant(format!("./{module}"));
                pat.push(path.clone());
                // TODO add query
                Self::parse(Value::new(pat))
            }
            Request::PackageInternal { path } => {
                let mut pat = Pattern::Constant("./".to_string());
                pat.push(path.clone());
                Self::parse(Value::new(pat))
            }
            Request::Unknown { path } => {
                let mut pat = Pattern::Constant("./".to_string());
                pat.push(path.clone());
                Self::parse(Value::new(pat))
            }
            Request::Alternatives { requests } => {
                let requests = requests.iter().copied().map(Request::as_relative).collect();
                Request::Alternatives { requests }.cell()
            }
        })
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for Request {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<Vc<String>> {
        Ok(Vc::cell(match self {
            Request::Raw {
                path,
                force_in_context,
            } => {
                if *force_in_context {
                    format!("in-context {path}")
                } else {
                    format!("{path}")
                }
            }
            Request::Relative {
                path,
                force_in_context,
            } => {
                if *force_in_context {
                    format!("relative-in-context {path}")
                } else {
                    format!("relative {path}")
                }
            }
            Request::Module {
                module,
                path,
                query: _,
            } => {
                if path.could_match_others("") {
                    format!("module \"{module}\" with subpath {path}")
                } else {
                    format!("module \"{module}\"")
                }
            }
            Request::ServerRelative { path } => format!("server relative {path}"),
            Request::Windows { path } => format!("windows {path}"),
            Request::Empty => "empty".to_string(),
            Request::PackageInternal { path } => format!("package internal {path}"),
            Request::Uri {
                protocol,
                remainder,
            } => format!("uri \"{protocol}\" \"{remainder}\""),
            Request::Unknown { path } => format!("unknown {path}"),
            Request::Dynamic => "dynamic".to_string(),
            Request::Alternatives { requests } => {
                let vec = requests.iter().map(|i| i.to_string()).try_join().await?;
                vec.iter()
                    .map(|r| r.as_str())
                    .collect::<Vec<_>>()
                    .join(" or ")
            }
        }))
    }
}
