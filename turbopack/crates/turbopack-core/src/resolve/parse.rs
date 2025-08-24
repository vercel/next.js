use std::sync::LazyLock;

use anyhow::{Ok, Result};
use regex::Regex;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, TryJoinIterExt, ValueToString, Vc};

use super::pattern::Pattern;

#[turbo_tasks::value(shared)]
#[derive(Hash, Clone, Debug)]
pub enum Request {
    Raw {
        path: Pattern,
        query: RcStr,
        force_in_lookup_dir: bool,
        fragment: RcStr,
    },
    Relative {
        path: Pattern,
        query: RcStr,
        force_in_lookup_dir: bool,
        fragment: RcStr,
    },
    Module {
        module: Pattern,
        path: Pattern,
        query: RcStr,
        fragment: RcStr,
    },
    ServerRelative {
        path: Pattern,
        query: RcStr,
        fragment: RcStr,
    },
    Windows {
        path: Pattern,
        query: RcStr,
        fragment: RcStr,
    },
    Empty,
    PackageInternal {
        path: Pattern,
    },
    Uri {
        protocol: RcStr,
        remainder: RcStr,
        query: RcStr,
        fragment: RcStr,
    },
    DataUri {
        media_type: RcStr,
        encoding: RcStr,
        data: ResolvedVc<RcStr>,
    },
    Unknown {
        path: Pattern,
    },
    Dynamic,
    Alternatives {
        requests: Vec<ResolvedVc<Request>>,
    },
}

/// Splits a string like `foo?bar#baz` into `(Pattern::Constant('foo'), '?bar', '#baz')`
///
/// If the hash or query portion are missing they will be empty strings otherwise they will be
/// non-empty along with their prepender characters
fn split_off_query_fragment(mut raw: &str) -> (Pattern, RcStr, RcStr) {
    // Per the URI spec fragments can contain `?` characters, so we should trim it off first
    // https://datatracker.ietf.org/doc/html/rfc3986#section-3.5

    let hash = match raw.as_bytes().iter().position(|&b| b == b'#') {
        Some(pos) => {
            let (prefix, hash) = raw.split_at(pos);
            raw = prefix;
            RcStr::from(hash)
        }
        None => RcStr::default(),
    };

    let query = match raw.as_bytes().iter().position(|&b| b == b'?') {
        Some(pos) => {
            let (prefix, query) = raw.split_at(pos);
            raw = prefix;
            RcStr::from(query)
        }
        None => RcStr::default(),
    };
    (Pattern::Constant(RcStr::from(raw)), query, hash)
}

static WINDOWS_PATH: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^[A-Za-z]:\\|\\\\").unwrap());
static URI_PATH: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^([^/\\:]+:)(.+)$").unwrap());
static DATA_URI_REMAINDER: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^([^;,]*)(?:;([^,]+))?,(.*)$").unwrap());
static MODULE_PATH: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^((?:@[^/]+/)?[^/]+)(.*)$").unwrap());

impl Request {
    /// Turns the request into a string.
    ///
    /// This is not only used for printing the request to the user, but also for matching inner
    /// assets.
    ///
    /// Note that this is only returns something for the most basic and fully constant patterns.
    pub fn request(&self) -> Option<RcStr> {
        Some(match self {
            Request::Raw {
                path: Pattern::Constant(path),
                ..
            } => path.clone(),
            Request::Relative {
                path: Pattern::Constant(path),
                ..
            } => path.clone(),
            Request::Module {
                module: Pattern::Constant(module),
                path: Pattern::Constant(path),
                ..
            } => format!("{module}{path}").into(),
            Request::ServerRelative {
                path: Pattern::Constant(path),
                ..
            } => path.clone(),
            Request::Windows {
                path: Pattern::Constant(path),
                ..
            } => path.clone(),
            Request::Empty => rcstr!(""),
            Request::PackageInternal {
                path: Pattern::Constant(path),
                ..
            } => path.clone(),
            Request::Uri {
                protocol,
                remainder,
                ..
            } => format!("{protocol}{remainder}").into(),
            Request::Unknown {
                path: Pattern::Constant(path),
            } => path.clone(),
            _ => return None,
        })
    }

    /// Internal construction function.  Should only be called with normalized patterns, or
    /// recursively. Most users should call [Self::parse] instead.
    fn parse_ref(request: Pattern) -> Self {
        match request {
            Pattern::Dynamic | Pattern::DynamicNoSlash => Request::Dynamic,
            Pattern::Constant(r) => Request::parse_constant_pattern(r),
            Pattern::Concatenation(list) => Request::parse_concatenation_pattern(list),
            Pattern::Alternatives(_) => panic!(
                "request should be normalized and alternatives should have already been handled.",
            ),
        }
    }

    fn parse_constant_pattern(r: RcStr) -> Self {
        if r.is_empty() {
            return Request::Empty;
        }

        if let Some(remainder) = r.strip_prefix("//") {
            return Request::Uri {
                protocol: rcstr!("//"),
                remainder: remainder.into(),
                query: RcStr::default(),
                fragment: RcStr::default(),
            };
        }

        if r.starts_with('/') {
            let (path, query, fragment) = split_off_query_fragment(&r);

            return Request::ServerRelative {
                path,
                query,
                fragment,
            };
        }

        if r.starts_with('#') {
            return Request::PackageInternal {
                path: Pattern::Constant(r),
            };
        }

        if r.starts_with("./") || r.starts_with("../") || r == "." || r == ".." {
            let (path, query, fragment) = split_off_query_fragment(&r);

            return Request::Relative {
                path,
                force_in_lookup_dir: false,
                query,
                fragment,
            };
        }

        if WINDOWS_PATH.is_match(&r) {
            let (path, query, fragment) = split_off_query_fragment(&r);

            return Request::Windows {
                path,
                query,
                fragment,
            };
        }

        if let Some(caps) = URI_PATH.captures(&r)
            && let (Some(protocol), Some(remainder)) = (caps.get(1), caps.get(2))
        {
            if let Some(caps) = DATA_URI_REMAINDER.captures(remainder.as_str()) {
                let media_type = caps.get(1).map_or(RcStr::default(), |m| m.as_str().into());
                let encoding = caps.get(2).map_or(RcStr::default(), |e| e.as_str().into());
                let data = caps.get(3).map_or(RcStr::default(), |d| d.as_str().into());

                return Request::DataUri {
                    media_type,
                    encoding,
                    data: ResolvedVc::cell(data),
                };
            }

            return Request::Uri {
                protocol: protocol.as_str().into(),
                remainder: remainder.as_str().into(),
                query: RcStr::default(),
                fragment: RcStr::default(),
            };
        }

        if let Some((module, path)) = MODULE_PATH
            .captures(&r)
            .and_then(|caps| caps.get(1).zip(caps.get(2)))
        {
            let (path, query, fragment) = split_off_query_fragment(path.as_str());

            return Request::Module {
                module: RcStr::from(module.as_str()).into(),
                path,
                query,
                fragment,
            };
        }

        Request::Unknown {
            path: Pattern::Constant(r),
        }
    }

    fn parse_concatenation_pattern(list: Vec<Pattern>) -> Self {
        if list.is_empty() {
            return Request::Empty;
        }

        let mut result = Self::parse_ref(list[0].clone());

        for item in list.into_iter().skip(1) {
            match &mut result {
                Request::Raw { path, .. } => {
                    path.push(item);
                }
                Request::Relative { path, .. } => {
                    path.push(item);
                }
                Request::Module { module, path, .. } => {
                    if path.is_empty() && matches!(item, Pattern::Dynamic) {
                        // TODO ideally this would be more general (i.e. support also
                        // `module-part<dynamic>more-module/subpath`) and not just handle
                        // Pattern::Dynamic, but this covers the common case of
                        // `require('@img/sharp-' + arch + '/sharp.node')`

                        // Insert dynamic between module and path (by adding it to both of them,
                        // because both could happen).
                        module.push(Pattern::DynamicNoSlash);
                    }
                    path.push(item);
                }
                Request::ServerRelative { path, .. } => {
                    path.push(item);
                }
                Request::Windows { path, .. } => {
                    path.push(item);
                }
                Request::Empty => {
                    result = Self::parse_ref(item);
                }
                Request::PackageInternal { path } => {
                    path.push(item);
                }
                Request::DataUri { .. } => {
                    result = Request::Dynamic;
                }
                Request::Uri { .. } => {
                    result = Request::Dynamic;
                }
                Request::Unknown { path } => {
                    path.push(item);
                }
                Request::Dynamic => {}
                Request::Alternatives { .. } => unreachable!(),
            };
        }

        result
    }

    pub fn parse_string(request: RcStr) -> Vc<Self> {
        Self::parse(request.into())
    }

    pub fn parse(mut request: Pattern) -> Vc<Self> {
        // Call normalize before parse_inner to improve cache hits.
        request.normalize();
        Self::parse_inner(request)
    }
}

#[turbo_tasks::value_impl]
impl Request {
    #[turbo_tasks::function]
    async fn parse_inner(request: Pattern) -> Result<Vc<Self>> {
        // Because we are normalized, we should handle alternatives here
        if let Pattern::Alternatives(alts) = request {
            Ok(Self::cell(Self::Alternatives {
                requests: alts
                    .into_iter()
                    // We can call parse_inner directly because these patterns are already
                    // normalized.  We don't call `Self::parse_ref` so we can try to get a cache hit
                    // on the sub-patterns
                    .map(|p| Self::parse_inner(p).to_resolved())
                    .try_join()
                    .await?,
            }))
        } else {
            Ok(Self::cell(Self::parse_ref(request)))
        }
    }

    #[turbo_tasks::function]
    pub fn raw(
        request: Pattern,
        query: RcStr,
        fragment: RcStr,
        force_in_lookup_dir: bool,
    ) -> Vc<Self> {
        Self::cell(Request::Raw {
            path: request,
            force_in_lookup_dir,
            query,
            fragment,
        })
    }

    #[turbo_tasks::function]
    pub fn relative(
        request: Pattern,
        query: RcStr,
        fragment: RcStr,
        force_in_lookup_dir: bool,
    ) -> Vc<Self> {
        Self::cell(Request::Relative {
            path: request,
            force_in_lookup_dir,
            query,
            fragment,
        })
    }

    #[turbo_tasks::function]
    pub fn module(module: Pattern, path: Pattern, query: RcStr, fragment: RcStr) -> Vc<Self> {
        Self::cell(Request::Module {
            module,
            path,
            query,
            fragment,
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
            | Request::DataUri { .. }
            | Request::Uri { .. }
            | Request::Dynamic => self,
            Request::Module {
                module,
                path,
                query: _,
                fragment: _,
            } => {
                let mut pat = module.clone();
                pat.push_front(rcstr!("./").into());
                pat.push(path.clone());
                // TODO add query
                Self::parse(pat)
            }
            Request::PackageInternal { path } => {
                let mut pat = Pattern::Constant(rcstr!("./"));
                pat.push(path.clone());
                Self::parse(pat)
            }
            Request::Unknown { path } => {
                let mut pat = Pattern::Constant(rcstr!("./"));
                pat.push(path.clone());
                Self::parse(pat)
            }
            Request::Alternatives { requests } => {
                let requests = requests
                    .iter()
                    .copied()
                    .map(|v| *v)
                    .map(Request::as_relative)
                    .map(|v| async move { v.to_resolved().await })
                    .try_join()
                    .await?;
                Request::Alternatives { requests }.cell()
            }
        })
    }

    #[turbo_tasks::function]
    pub async fn with_query(self: Vc<Self>, query: RcStr) -> Result<Vc<Self>> {
        Ok(match &*self.await? {
            Request::Raw {
                path,
                query: _,
                force_in_lookup_dir,
                fragment,
            } => Request::raw(path.clone(), query, fragment.clone(), *force_in_lookup_dir),
            Request::Relative {
                path,
                query: _,
                force_in_lookup_dir,
                fragment,
            } => Request::relative(path.clone(), query, fragment.clone(), *force_in_lookup_dir),
            Request::Module {
                module,
                path,
                query: _,
                fragment,
            } => Request::module(module.clone(), path.clone(), query, fragment.clone()),
            Request::ServerRelative {
                path,
                query: _,
                fragment,
            } => Request::ServerRelative {
                path: path.clone(),
                query,
                fragment: fragment.clone(),
            }
            .cell(),
            Request::Windows {
                path,
                query: _,
                fragment,
            } => Request::Windows {
                path: path.clone(),
                query,
                fragment: fragment.clone(),
            }
            .cell(),
            Request::Empty => self,
            Request::PackageInternal { .. } => self,
            Request::DataUri { .. } => self,
            Request::Uri { .. } => self,
            Request::Unknown { .. } => self,
            Request::Dynamic => self,
            Request::Alternatives { requests } => {
                let requests = requests
                    .iter()
                    .copied()
                    .map(|req| req.with_query(query.clone()))
                    .map(|v| async move { v.to_resolved().await })
                    .try_join()
                    .await?;
                Request::Alternatives { requests }.cell()
            }
        })
    }

    #[turbo_tasks::function]
    pub async fn with_fragment(self: Vc<Self>, fragment: RcStr) -> Result<Vc<Self>> {
        Ok(match &*self.await? {
            Request::Raw {
                path,
                query,
                force_in_lookup_dir,
                fragment: _,
            } => Request::Raw {
                path: path.clone(),
                query: query.clone(),
                force_in_lookup_dir: *force_in_lookup_dir,
                fragment,
            }
            .cell(),
            Request::Relative {
                path,
                query,
                force_in_lookup_dir,
                fragment: _,
            } => Request::Relative {
                path: path.clone(),
                query: query.clone(),
                force_in_lookup_dir: *force_in_lookup_dir,
                fragment,
            }
            .cell(),
            Request::Module {
                module,
                path,
                query,
                fragment: _,
            } => Request::Module {
                module: module.clone(),
                path: path.clone(),
                query: query.clone(),
                fragment,
            }
            .cell(),
            Request::ServerRelative {
                path,
                query,
                fragment: _,
            } => Request::ServerRelative {
                path: path.clone(),
                query: query.clone(),
                fragment,
            }
            .cell(),
            Request::Windows {
                path,
                query,
                fragment: _,
            } => Request::Windows {
                path: path.clone(),
                query: query.clone(),
                fragment,
            }
            .cell(),
            Request::Empty => self,
            Request::PackageInternal { .. } => self,
            Request::DataUri { .. } => self,
            Request::Uri { .. } => self,
            Request::Unknown { .. } => self,
            Request::Dynamic => self,
            Request::Alternatives { requests } => {
                let requests = requests
                    .iter()
                    .copied()
                    .map(|req| req.with_fragment(fragment.clone()))
                    .map(|v| async move { v.to_resolved().await })
                    .try_join()
                    .await?;
                Request::Alternatives { requests }.cell()
            }
        })
    }

    #[turbo_tasks::function]
    pub async fn append_path(self: Vc<Self>, suffix: RcStr) -> Result<Vc<Self>> {
        Ok(match &*self.await? {
            Request::Raw {
                path,
                query,
                force_in_lookup_dir,
                fragment,
            } => {
                let mut pat = Pattern::concat([path.clone(), suffix.into()]);
                pat.normalize();
                Self::raw(pat, query.clone(), fragment.clone(), *force_in_lookup_dir)
            }
            Request::Relative {
                path,
                query,
                force_in_lookup_dir,
                fragment,
            } => {
                let mut pat = Pattern::concat([path.clone(), suffix.into()]);
                pat.normalize();
                Self::relative(pat, query.clone(), fragment.clone(), *force_in_lookup_dir)
            }
            Request::Module {
                module,
                path,
                query,
                fragment,
            } => {
                let mut pat = Pattern::concat([path.clone(), suffix.into()]);
                pat.normalize();
                Self::module(module.clone(), pat, query.clone(), fragment.clone())
            }
            Request::ServerRelative {
                path,
                query,
                fragment,
            } => {
                let mut pat = Pattern::concat([path.clone(), suffix.into()]);
                pat.normalize();
                Self::ServerRelative {
                    path: pat,
                    query: query.clone(),
                    fragment: fragment.clone(),
                }
                .cell()
            }
            Request::Windows {
                path,
                query,
                fragment,
            } => {
                let mut pat = Pattern::concat([path.clone(), suffix.into()]);
                pat.normalize();
                Self::Windows {
                    path: pat,
                    query: query.clone(),
                    fragment: fragment.clone(),
                }
                .cell()
            }
            Request::Empty => Self::parse(suffix.into()),
            Request::PackageInternal { path } => {
                let mut pat = Pattern::concat([path.clone(), suffix.into()]);
                pat.normalize();
                Self::PackageInternal { path: pat }.cell()
            }
            Request::DataUri {
                media_type,
                encoding,
                data,
            } => {
                let data = ResolvedVc::cell(format!("{}{}", data.await?, suffix).into());
                Self::DataUri {
                    media_type: media_type.clone(),
                    encoding: encoding.clone(),
                    data,
                }
                .cell()
            }
            Request::Uri {
                protocol,
                remainder,
                query,
                fragment,
            } => {
                let remainder = format!("{remainder}{suffix}").into();
                Self::Uri {
                    protocol: protocol.clone(),
                    remainder,
                    query: query.clone(),
                    fragment: fragment.clone(),
                }
                .cell()
            }
            Request::Unknown { path } => {
                let mut pat = Pattern::concat([path.clone(), suffix.into()]);
                pat.normalize();
                Self::Unknown { path: pat }.cell()
            }
            Request::Dynamic => self,
            Request::Alternatives { requests } => {
                let requests = requests
                    .iter()
                    .map(|req| async { req.append_path(suffix.clone()).to_resolved().await })
                    .try_join()
                    .await?;
                Request::Alternatives { requests }.cell()
            }
        })
    }

    #[turbo_tasks::function]
    pub fn query(&self) -> Vc<RcStr> {
        Vc::cell(match self {
            Request::Windows { query, .. }
            | Request::ServerRelative { query, .. }
            | Request::Module { query, .. }
            | Request::Relative { query, .. }
            | Request::Raw { query, .. } => query.clone(),
            Request::Dynamic
            | Request::Unknown { .. }
            | Request::Uri { .. }
            | Request::DataUri { .. }
            | Request::PackageInternal { .. }
            | Request::Empty => RcStr::default(),
            // TODO: is this correct, should we return the first one instead?
            Request::Alternatives { .. } => RcStr::default(),
        })
    }

    /// Turns the request into a pattern, similar to [Request::request()] but
    /// more complete.
    #[turbo_tasks::function]
    pub async fn request_pattern(self: Vc<Self>) -> Result<Vc<Pattern>> {
        Ok(Pattern::new(match &*self.await? {
            Request::Raw { path, .. } => path.clone(),
            Request::Relative { path, .. } => path.clone(),
            Request::Module { module, path, .. } => {
                let mut path = path.clone();
                path.push_front(module.clone());
                path.normalize();
                path
            }
            Request::ServerRelative { path, .. } => path.clone(),
            Request::Windows { path, .. } => path.clone(),
            Request::Empty => Pattern::Constant(rcstr!("")),
            Request::PackageInternal { path } => path.clone(),
            Request::DataUri {
                media_type,
                encoding,
                data,
            } => Pattern::Constant(
                stringify_data_uri(media_type, encoding, *data)
                    .await?
                    .into(),
            ),
            Request::Uri {
                protocol,
                remainder,
                ..
            } => Pattern::Constant(format!("{protocol}{remainder}").into()),
            Request::Unknown { path } => path.clone(),
            Request::Dynamic => Pattern::Dynamic,
            Request::Alternatives { requests } => Pattern::Alternatives(
                requests
                    .iter()
                    .map(async |r: &ResolvedVc<Request>| -> Result<Pattern> {
                        Ok(r.request_pattern().owned().await?)
                    })
                    .try_join()
                    .await?,
            ),
        }))
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for Request {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<Vc<RcStr>> {
        Ok(Vc::cell(match self {
            Request::Raw {
                path,
                force_in_lookup_dir,
                ..
            } => {
                if *force_in_lookup_dir {
                    format!("in-lookup-dir {}", path.describe_as_string()).into()
                } else {
                    path.describe_as_string().into()
                }
            }
            Request::Relative {
                path,
                force_in_lookup_dir,
                ..
            } => {
                if *force_in_lookup_dir {
                    format!("relative-in-lookup-dir {}", path.describe_as_string()).into()
                } else {
                    format!("relative {}", path.describe_as_string()).into()
                }
            }
            Request::Module { module, path, .. } => {
                if path.could_match_others("") {
                    format!(
                        "module {} with subpath {}",
                        module.describe_as_string(),
                        path.describe_as_string()
                    )
                    .into()
                } else {
                    format!("module \"{}\"", module.describe_as_string()).into()
                }
            }
            Request::ServerRelative { path, .. } => {
                format!("server relative {}", path.describe_as_string()).into()
            }
            Request::Windows { path, .. } => {
                format!("windows {}", path.describe_as_string()).into()
            }
            Request::Empty => rcstr!("empty"),
            Request::PackageInternal { path } => {
                format!("package internal {}", path.describe_as_string()).into()
            }
            Request::DataUri {
                media_type,
                encoding,
                data,
            } => format!(
                "data uri \"{media_type}\" \"{encoding}\" \"{}\"",
                data.await?
            )
            .into(),
            Request::Uri {
                protocol,
                remainder,
                ..
            } => format!("uri \"{protocol}\" \"{remainder}\"").into(),
            Request::Unknown { path } => format!("unknown {}", path.describe_as_string()).into(),
            Request::Dynamic => rcstr!("dynamic"),
            Request::Alternatives { requests } => {
                let vec = requests.iter().map(|i| i.to_string()).try_join().await?;
                vec.iter()
                    .map(|r| r.as_str())
                    .collect::<Vec<_>>()
                    .join(" or ")
                    .into()
            }
        }))
    }
}

pub async fn stringify_data_uri(
    media_type: &RcStr,
    encoding: &RcStr,
    data: ResolvedVc<RcStr>,
) -> Result<String> {
    Ok(format!(
        "data:{media_type}{}{encoding},{}",
        if encoding.is_empty() { "" } else { ";" },
        data.await?
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_module() {
        assert_eq!(
            Request::Module {
                module: rcstr!("foo").into(),
                path: rcstr!("").into(),
                query: rcstr!(""),
                fragment: rcstr!(""),
            },
            Request::parse_ref(rcstr!("foo").into())
        );
        assert_eq!(
            Request::Module {
                module: rcstr!("@org/foo").into(),
                path: rcstr!("").into(),
                query: rcstr!(""),
                fragment: rcstr!(""),
            },
            Request::parse_ref(rcstr!("@org/foo").into())
        );

        assert_eq!(
            Request::Module {
                module: Pattern::Concatenation(vec![
                    Pattern::Constant(rcstr!("foo-")),
                    Pattern::DynamicNoSlash,
                ]),
                path: Pattern::Dynamic,
                query: rcstr!(""),
                fragment: rcstr!(""),
            },
            Request::parse_ref(Pattern::Concatenation(vec![
                Pattern::Constant(rcstr!("foo-")),
                Pattern::Dynamic,
            ]))
        );

        assert_eq!(
            Request::Module {
                module: Pattern::Concatenation(vec![
                    Pattern::Constant(rcstr!("foo-")),
                    Pattern::DynamicNoSlash,
                ]),
                path: Pattern::Concatenation(vec![
                    Pattern::Dynamic,
                    Pattern::Constant(rcstr!("/file")),
                ]),
                query: rcstr!(""),
                fragment: rcstr!(""),
            },
            Request::parse_ref(Pattern::Concatenation(vec![
                Pattern::Constant(rcstr!("foo-")),
                Pattern::Dynamic,
                Pattern::Constant(rcstr!("/file")),
            ]))
        );
        assert_eq!(
            Request::Module {
                module: Pattern::Concatenation(vec![
                    Pattern::Constant(rcstr!("foo-")),
                    Pattern::DynamicNoSlash,
                ]),
                path: Pattern::Concatenation(vec![
                    Pattern::Dynamic,
                    Pattern::Constant(rcstr!("/file")),
                    Pattern::Dynamic,
                    Pattern::Constant(rcstr!("sub")),
                ]),
                query: rcstr!(""),
                fragment: rcstr!(""),
            },
            Request::parse_ref(Pattern::Concatenation(vec![
                Pattern::Constant(rcstr!("foo-")),
                Pattern::Dynamic,
                Pattern::Constant(rcstr!("/file")),
                Pattern::Dynamic,
                Pattern::Constant(rcstr!("sub")),
            ]))
        );

        // TODO see parse_concatenation_pattern
        // assert_eq!(
        //     Request::Alternatives {
        //         requests: vec![
        //             Request::Module {
        //                 module: Pattern::Concatenation(vec![
        //                     Pattern::Constant(rcstr!("prefix")),
        //                     Pattern::Dynamic,
        //                     Pattern::Constant(rcstr!("suffix")),
        //                 ]),
        //                 path: rcstr!("subpath").into(),
        //                 query: rcstr!(""),
        //                 fragment: rcstr!(""),
        //             }
        //             .resolved_cell(),
        //             Request::Module {
        //                 module: Pattern::Concatenation(vec![
        //                     Pattern::Constant(rcstr!("prefix")),
        //                     Pattern::Dynamic,
        //                 ]),
        //                 path: Pattern::Concatenation(vec![
        //                     Pattern::Dynamic,
        //                     Pattern::Constant(rcstr!("suffix/subpath")),
        //                 ]),
        //                 query: rcstr!(""),
        //                 fragment: rcstr!(""),
        //             }
        //             .resolved_cell()
        //         ]
        //     },
        //     Request::parse_ref(Pattern::Concatenation(vec![
        //         Pattern::Constant(rcstr!("prefix")),
        //         Pattern::Dynamic,
        //         Pattern::Constant(rcstr!("suffix/subpath")),
        //     ]))
        // );
    }

    #[test]
    fn test_split_query_fragment() {
        assert_eq!(
            (
                Pattern::Constant(rcstr!("foo")),
                RcStr::default(),
                RcStr::default()
            ),
            split_off_query_fragment("foo")
        );
        // These two cases are a bit odd, but it is important to treat `import './foo?'` differently
        // from `import './foo'`, ditto for fragments.
        assert_eq!(
            (
                Pattern::Constant(rcstr!("foo")),
                rcstr!("?"),
                RcStr::default()
            ),
            split_off_query_fragment("foo?")
        );
        assert_eq!(
            (
                Pattern::Constant(rcstr!("foo")),
                RcStr::default(),
                rcstr!("#")
            ),
            split_off_query_fragment("foo#")
        );
        assert_eq!(
            (
                Pattern::Constant(rcstr!("foo")),
                rcstr!("?bar=baz"),
                RcStr::default()
            ),
            split_off_query_fragment("foo?bar=baz")
        );
        assert_eq!(
            (
                Pattern::Constant(rcstr!("foo")),
                RcStr::default(),
                rcstr!("#stuff?bar=baz")
            ),
            split_off_query_fragment("foo#stuff?bar=baz")
        );

        assert_eq!(
            (
                Pattern::Constant(rcstr!("foo")),
                rcstr!("?bar=baz"),
                rcstr!("#stuff")
            ),
            split_off_query_fragment("foo?bar=baz#stuff")
        );
    }
}
