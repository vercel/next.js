use anyhow::{Ok, Result};
use lazy_static::lazy_static;
use regex::Regex;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, TryJoinIterExt, Value, ValueToString, Vc};

use super::pattern::Pattern;

#[turbo_tasks::value(shared)]
#[derive(Hash, Clone, Debug)]
pub enum Request {
    Raw {
        path: Pattern,
        query: ResolvedVc<RcStr>,
        force_in_lookup_dir: bool,
        fragment: ResolvedVc<RcStr>,
    },
    Relative {
        path: Pattern,
        query: ResolvedVc<RcStr>,
        force_in_lookup_dir: bool,
        fragment: ResolvedVc<RcStr>,
    },
    Module {
        module: RcStr,
        path: Pattern,
        query: ResolvedVc<RcStr>,
        fragment: ResolvedVc<RcStr>,
    },
    ServerRelative {
        path: Pattern,
        query: ResolvedVc<RcStr>,
        fragment: ResolvedVc<RcStr>,
    },
    Windows {
        path: Pattern,
        query: ResolvedVc<RcStr>,
        fragment: ResolvedVc<RcStr>,
    },
    Empty,
    PackageInternal {
        path: Pattern,
    },
    Uri {
        protocol: String,
        remainder: String,
        query: ResolvedVc<RcStr>,
        fragment: ResolvedVc<RcStr>,
    },
    Unknown {
        path: Pattern,
    },
    Dynamic,
    Alternatives {
        requests: Vec<ResolvedVc<Request>>,
    },
}

fn split_off_query_fragment(raw: RcStr) -> (Pattern, Vc<RcStr>, Vc<RcStr>) {
    let Some((raw, query)) = raw.split_once('?') else {
        if let Some((raw, fragment)) = raw.split_once('#') {
            return (
                Pattern::Constant(raw.into()),
                Vc::<RcStr>::default(),
                Vc::cell(fragment.into()),
            );
        }

        return (
            Pattern::Constant(raw),
            Vc::<RcStr>::default(),
            Vc::<RcStr>::default(),
        );
    };

    let (query, fragment) = query.split_once('#').unwrap_or((query, ""));

    (
        Pattern::Constant(raw.into()),
        Vc::cell(format!("?{}", query).into()),
        Vc::cell(format!("#{}", fragment).into()),
    )
}

impl Request {
    /// Turns the request into a string.
    ///
    /// Note that this is only returns something for the most basic and
    /// fully constant patterns.
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
                module,
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
            Request::Empty => "".into(),
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

    pub async fn parse_ref(mut request: Pattern) -> Result<Self> {
        request.normalize();
        Ok(match request {
            Pattern::Dynamic => Request::Dynamic,
            Pattern::Constant(r) => {
                if r.is_empty() {
                    Request::Empty
                } else if r.starts_with('/') {
                    let (path, query, fragment) = split_off_query_fragment(r);

                    Request::ServerRelative {
                        path,
                        query: query.to_resolved().await?,
                        fragment: fragment.to_resolved().await?,
                    }
                } else if r.starts_with('#') {
                    Request::PackageInternal {
                        path: Pattern::Constant(r),
                    }
                } else if r.starts_with("./") || r.starts_with("../") || &*r == "." || &*r == ".." {
                    let (path, query, fragment) = split_off_query_fragment(r);

                    Request::Relative {
                        path,
                        force_in_lookup_dir: false,
                        query: query.to_resolved().await?,
                        fragment: fragment.to_resolved().await?,
                    }
                } else {
                    lazy_static! {
                        static ref WINDOWS_PATH: Regex = Regex::new(r"^[A-Za-z]:\\|\\\\").unwrap();
                        static ref URI_PATH: Regex = Regex::new(r"^([^/\\]+:)(.+)$").unwrap();
                        static ref MODULE_PATH: Regex =
                            Regex::new(r"^((?:@[^/]+/)?[^/]+)(.*)$").unwrap();
                    }

                    if WINDOWS_PATH.is_match(&r) {
                        let (path, query, fragment) = split_off_query_fragment(r);

                        return Ok(Request::Windows {
                            path,
                            query: query.to_resolved().await?,
                            fragment: fragment.to_resolved().await?,
                        });
                    }

                    if let Some(caps) = URI_PATH.captures(&r) {
                        if let (Some(protocol), Some(remainder)) = (caps.get(1), caps.get(2)) {
                            // TODO data uri
                            return Ok(Request::Uri {
                                protocol: protocol.as_str().to_string(),
                                remainder: remainder.as_str().to_string(),
                                query: ResolvedVc::cell(RcStr::default()),
                                fragment: ResolvedVc::cell(RcStr::default()),
                            });
                        }
                    }

                    if let Some((module, path)) = MODULE_PATH
                        .captures(&r)
                        .and_then(|caps| caps.get(1).zip(caps.get(2)))
                    {
                        let (path, query, fragment) =
                            split_off_query_fragment(path.as_str().into());

                        return Ok(Request::Module {
                            module: module.as_str().into(),
                            path,
                            query: query.to_resolved().await?,
                            fragment: fragment.to_resolved().await?,
                        });
                    }

                    Request::Unknown {
                        path: Pattern::Constant(r),
                    }
                }
            }
            Pattern::Concatenation(list) => {
                let mut iter = list.into_iter();
                if let Some(first) = iter.next() {
                    let mut result = Box::pin(Self::parse_ref(first)).await?;
                    match &mut result {
                        Request::Raw { path, .. } => {
                            path.extend(iter);
                        }
                        Request::Relative { path, .. } => {
                            path.extend(iter);
                        }
                        Request::Module { path, .. } => {
                            path.extend(iter);
                        }
                        Request::ServerRelative { path, .. } => {
                            path.extend(iter);
                        }
                        Request::Windows { path, .. } => {
                            path.extend(iter);
                        }
                        Request::Empty => {
                            result =
                                Box::pin(Self::parse_ref(Pattern::Concatenation(iter.collect())))
                                    .await?;
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
                    .map(Value::new)
                    .map(Request::parse)
                    .map(|v| async move { v.to_resolved().await })
                    .try_join()
                    .await?,
            },
        })
    }
}

#[turbo_tasks::value_impl]
impl Request {
    #[turbo_tasks::function]
    pub async fn parse(request: Value<Pattern>) -> Result<Vc<Self>> {
        Ok(Self::cell(Request::parse_ref(request.into_value()).await?))
    }

    #[turbo_tasks::function]
    pub async fn parse_string(request: RcStr) -> Result<Vc<Self>> {
        Ok(Self::cell(Request::parse_ref(request.into()).await?))
    }

    #[turbo_tasks::function]
    pub async fn raw(
        request: Value<Pattern>,
        query: Vc<RcStr>,
        fragment: Vc<RcStr>,
        force_in_lookup_dir: bool,
    ) -> Result<Vc<Self>> {
        Ok(Self::cell(Request::Raw {
            path: request.into_value(),
            force_in_lookup_dir,
            query: query.to_resolved().await?,
            fragment: fragment.to_resolved().await?,
        }))
    }

    #[turbo_tasks::function]
    pub async fn relative(
        request: Value<Pattern>,
        query: Vc<RcStr>,
        fragment: Vc<RcStr>,
        force_in_lookup_dir: bool,
    ) -> Result<Vc<Self>> {
        Ok(Self::cell(Request::Relative {
            path: request.into_value(),
            force_in_lookup_dir,
            query: query.to_resolved().await?,
            fragment: fragment.to_resolved().await?,
        }))
    }

    #[turbo_tasks::function]
    pub async fn module(
        module: RcStr,
        path: Value<Pattern>,
        query: Vc<RcStr>,
        fragment: Vc<RcStr>,
    ) -> Result<Vc<Self>> {
        Ok(Self::cell(Request::Module {
            module,
            path: path.into_value(),
            query: query.to_resolved().await?,
            fragment: fragment.to_resolved().await?,
        }))
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
                fragment: _,
            } => {
                let mut pat = Pattern::Constant(format!("./{module}").into());
                pat.push(path.clone());
                // TODO add query
                Self::parse(Value::new(pat))
            }
            Request::PackageInternal { path } => {
                let mut pat = Pattern::Constant("./".into());
                pat.push(path.clone());
                Self::parse(Value::new(pat))
            }
            Request::Unknown { path } => {
                let mut pat = Pattern::Constant("./".into());
                pat.push(path.clone());
                Self::parse(Value::new(pat))
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
    pub async fn with_query(self: Vc<Self>, query: Vc<RcStr>) -> Result<Vc<Self>> {
        Ok(match &*self.await? {
            Request::Raw {
                path,
                query: _,
                force_in_lookup_dir,
                fragment,
            } => Request::Raw {
                path: path.clone(),
                query: query.to_resolved().await?,
                force_in_lookup_dir: *force_in_lookup_dir,
                fragment: *fragment,
            }
            .cell(),
            Request::Relative {
                path,
                query: _,
                force_in_lookup_dir,
                fragment,
            } => Request::Relative {
                path: path.clone(),
                query: query.to_resolved().await?,
                force_in_lookup_dir: *force_in_lookup_dir,
                fragment: *fragment,
            }
            .cell(),
            Request::Module {
                module,
                path,
                query: _,
                fragment,
            } => Request::Module {
                module: module.clone(),
                path: path.clone(),
                query: query.to_resolved().await?,
                fragment: *fragment,
            }
            .cell(),
            Request::ServerRelative {
                path,
                query: _,
                fragment,
            } => Request::ServerRelative {
                path: path.clone(),
                query: query.to_resolved().await?,
                fragment: *fragment,
            }
            .cell(),
            Request::Windows {
                path,
                query: _,
                fragment,
            } => Request::Windows {
                path: path.clone(),
                query: query.to_resolved().await?,
                fragment: *fragment,
            }
            .cell(),
            Request::Empty => self,
            Request::PackageInternal { .. } => self,
            Request::Uri { .. } => self,
            Request::Unknown { .. } => self,
            Request::Dynamic => self,
            Request::Alternatives { requests } => {
                let requests = requests
                    .iter()
                    .copied()
                    .map(|req| req.with_query(query))
                    .map(|v| async move { v.to_resolved().await })
                    .try_join()
                    .await?;
                Request::Alternatives { requests }.cell()
            }
        })
    }

    #[turbo_tasks::function]
    pub async fn with_fragment(self: Vc<Self>, fragment: Vc<RcStr>) -> Result<Vc<Self>> {
        Ok(match &*self.await? {
            Request::Raw {
                path,
                query,
                force_in_lookup_dir,
                fragment: _,
            } => Request::Raw {
                path: path.clone(),
                query: *query,
                force_in_lookup_dir: *force_in_lookup_dir,
                fragment: fragment.to_resolved().await?,
            }
            .cell(),
            Request::Relative {
                path,
                query,
                force_in_lookup_dir,
                fragment: _,
            } => Request::Relative {
                path: path.clone(),
                query: *query,
                force_in_lookup_dir: *force_in_lookup_dir,
                fragment: fragment.to_resolved().await?,
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
                query: *query,
                fragment: fragment.to_resolved().await?,
            }
            .cell(),
            Request::ServerRelative {
                path,
                query,
                fragment: _,
            } => Request::ServerRelative {
                path: path.clone(),
                query: *query,
                fragment: fragment.to_resolved().await?,
            }
            .cell(),
            Request::Windows {
                path,
                query,
                fragment: _,
            } => Request::Windows {
                path: path.clone(),
                query: *query,
                fragment: fragment.to_resolved().await?,
            }
            .cell(),
            Request::Empty => self,
            Request::PackageInternal { .. } => self,
            Request::Uri { .. } => self,
            Request::Unknown { .. } => self,
            Request::Dynamic => self,
            Request::Alternatives { requests } => {
                let requests = requests
                    .iter()
                    .copied()
                    .map(|req| req.with_fragment(fragment))
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
                Self::raw(Value::new(pat), **query, **fragment, *force_in_lookup_dir)
            }
            Request::Relative {
                path,
                query,
                force_in_lookup_dir,
                fragment,
            } => {
                let mut pat = Pattern::concat([path.clone(), suffix.into()]);
                pat.normalize();
                Self::relative(Value::new(pat), **query, **fragment, *force_in_lookup_dir)
            }
            Request::Module {
                module,
                path,
                query,
                fragment,
            } => {
                let mut pat = Pattern::concat([path.clone(), suffix.into()]);
                pat.normalize();
                Self::module(module.clone(), Value::new(pat), **query, **fragment)
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
                    query: *query,
                    fragment: *fragment,
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
                    query: *query,
                    fragment: *fragment,
                }
                .cell()
            }
            Request::Empty => Self::parse(Value::new(suffix.into())),
            Request::PackageInternal { path } => {
                let mut pat = Pattern::concat([path.clone(), suffix.into()]);
                pat.normalize();
                Self::PackageInternal { path: pat }.cell()
            }
            Request::Uri {
                protocol,
                remainder,
                query,
                fragment,
            } => {
                let remainder = format!("{}{}", remainder, suffix);
                Self::Uri {
                    protocol: protocol.clone(),
                    remainder,
                    query: *query,
                    fragment: *fragment,
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
        match self {
            Request::Raw { query, .. } => **query,
            Request::Relative { query, .. } => **query,
            Request::Module { query, .. } => **query,
            Request::ServerRelative { query, .. } => **query,
            Request::Windows { query, .. } => **query,
            Request::Empty => Vc::<RcStr>::default(),
            Request::PackageInternal { .. } => Vc::<RcStr>::default(),
            Request::Uri { .. } => Vc::<RcStr>::default(),
            Request::Unknown { .. } => Vc::<RcStr>::default(),
            Request::Dynamic => Vc::<RcStr>::default(),
            // TODO: is this correct, should we return the first one instead?
            Request::Alternatives { .. } => Vc::<RcStr>::default(),
        }
    }

    /// Turns the request into a pattern, similar to [Request::request()] but
    /// more complete.
    #[turbo_tasks::function]
    pub async fn request_pattern(self: Vc<Self>) -> Result<Vc<Pattern>> {
        Ok(match &*self.await? {
            Request::Raw { path, .. } => path.clone(),
            Request::Relative { path, .. } => path.clone(),
            Request::Module { module, path, .. } => {
                let mut path = path.clone();
                path.push_front(Pattern::Constant(module.clone()));
                path.normalize();
                path
            }
            Request::ServerRelative { path, .. } => path.clone(),
            Request::Windows { path, .. } => path.clone(),
            Request::Empty => Pattern::Constant("".into()),
            Request::PackageInternal { path } => path.clone(),
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
        }
        .cell())
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
                    format!("in-lookup-dir {path}").into()
                } else {
                    format!("{path}").into()
                }
            }
            Request::Relative {
                path,
                force_in_lookup_dir,
                ..
            } => {
                if *force_in_lookup_dir {
                    format!("relative-in-lookup-dir {path}").into()
                } else {
                    format!("relative {path}").into()
                }
            }
            Request::Module { module, path, .. } => {
                if path.could_match_others("") {
                    format!("module \"{module}\" with subpath {path}").into()
                } else {
                    format!("module \"{module}\"").into()
                }
            }
            Request::ServerRelative { path, .. } => format!("server relative {path}").into(),
            Request::Windows { path, .. } => format!("windows {path}").into(),
            Request::Empty => "empty".into(),
            Request::PackageInternal { path } => format!("package internal {path}").into(),
            Request::Uri {
                protocol,
                remainder,
                ..
            } => format!("uri \"{protocol}\" \"{remainder}\"").into(),
            Request::Unknown { path } => format!("unknown {path}").into(),
            Request::Dynamic => "dynamic".into(),
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
