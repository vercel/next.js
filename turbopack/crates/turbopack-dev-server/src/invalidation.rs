use std::fmt::{Display, Formatter};

use hyper::{Method, Uri};
use turbo_tasks::{util::StaticOrArc, FxIndexSet, InvalidationReason, InvalidationReasonKind};

/// Computation was caused by a request to the server.
#[derive(PartialEq, Eq, Hash)]
pub struct ServerRequest {
    pub method: Method,
    pub uri: Uri,
}

impl InvalidationReason for ServerRequest {
    fn kind(&self) -> Option<StaticOrArc<dyn InvalidationReasonKind>> {
        Some(StaticOrArc::Static(&SERVER_REQUEST_KIND))
    }
}

impl Display for ServerRequest {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        write!(f, "{} {}", self.method, self.uri.path())
    }
}

/// Invalidation kind for [ServerRequest]
#[derive(PartialEq, Eq, Hash)]
struct ServerRequestKind;

static SERVER_REQUEST_KIND: ServerRequestKind = ServerRequestKind;

impl InvalidationReasonKind for ServerRequestKind {
    fn fmt(
        &self,
        reasons: &FxIndexSet<StaticOrArc<dyn InvalidationReason>>,
        f: &mut Formatter<'_>,
    ) -> std::fmt::Result {
        let example = reasons
            .into_iter()
            .map(|reason| reason.as_any().downcast_ref::<ServerRequest>().unwrap())
            .min_by_key(|reason| reason.uri.path().len())
            .unwrap();
        write!(
            f,
            "{} requests ({} {}, ...)",
            reasons.len(),
            example.method,
            example.uri.path()
        )
    }
}

/// Side effect that was caused by a request to the server.
#[derive(PartialEq, Eq, Hash)]
pub struct ServerRequestSideEffects {
    pub method: Method,
    pub uri: Uri,
}

impl InvalidationReason for ServerRequestSideEffects {
    fn kind(&self) -> Option<StaticOrArc<dyn InvalidationReasonKind>> {
        Some(StaticOrArc::Static(&SERVER_REQUEST_SIDE_EFFECTS_KIND))
    }
}

impl Display for ServerRequestSideEffects {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        write!(f, "side effects of {} {}", self.method, self.uri.path())
    }
}

/// Invalidation kind for [ServerRequestSideEffects]
#[derive(PartialEq, Eq, Hash)]
struct ServerRequestSideEffectsKind;

static SERVER_REQUEST_SIDE_EFFECTS_KIND: ServerRequestSideEffectsKind =
    ServerRequestSideEffectsKind;

impl InvalidationReasonKind for ServerRequestSideEffectsKind {
    fn fmt(
        &self,
        reasons: &FxIndexSet<StaticOrArc<dyn InvalidationReason>>,
        f: &mut Formatter<'_>,
    ) -> std::fmt::Result {
        let example = reasons
            .into_iter()
            .map(|reason| {
                reason
                    .as_any()
                    .downcast_ref::<ServerRequestSideEffects>()
                    .unwrap()
            })
            .min_by_key(|reason| reason.uri.path().len())
            .unwrap();
        write!(
            f,
            "side effects of {} requests ({} {}, ...)",
            reasons.len(),
            example.method,
            example.uri.path()
        )
    }
}
