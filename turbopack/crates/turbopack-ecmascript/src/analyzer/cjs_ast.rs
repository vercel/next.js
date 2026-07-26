use swc_core::{
    common::Mark,
    ecma::{
        ast::{CallExpr, Callee, Expr, Ident, Lit, MemberExpr, MemberProp, Prop, PropOrSpread},
        utils::prop_name_eq,
    },
};
use turbo_rcstr::RcStr;

use crate::utils::unparen;

/// True if `prop` is the non-computed member property `.<name>`.
fn prop_is(prop: &MemberProp, name: &str) -> bool {
    matches!(prop, MemberProp::Ident(i) if i.sym.as_ref() == name)
}

/// True if `identifier` is the named, unshadowed module-scope (unresolved)
/// binding — e.g. the real CommonJS `module`/`exports`/`require`, not a local
/// shadow. Prevents `let exports = {}; exports.foo = 'a'` from being treated as
/// a write to the global `exports`.
pub(crate) fn is_global(identifier: &Ident, name: &str, unresolved_mark: Mark) -> bool {
    identifier.ctxt.outer() == unresolved_mark && identifier.sym.as_ref() == name
}

/// `module.exports` (the real, unshadowed `module` binding).
pub(crate) fn is_module_dot_exports(member: &MemberExpr, unresolved_mark: Mark) -> bool {
    matches!(unparen(&member.obj), Expr::Ident(o) if is_global(o, "module", unresolved_mark))
        && prop_is(&member.prop, "exports")
}

/// Whether `expr` is the real (unshadowed) `exports` or `module.exports`.
pub(crate) fn is_exports_object(expr: &Expr, unresolved_mark: Mark) -> bool {
    match unparen(expr) {
        Expr::Ident(o) => is_global(o, "exports", unresolved_mark),
        Expr::Member(inner) => is_module_dot_exports(inner, unresolved_mark),
        _ => false,
    }
}

/// `module.exports` or a property chain rooted at it (`module.exports.a.b`).
pub(crate) fn is_module_exports_chain(expr: &Expr, unresolved_mark: Mark) -> bool {
    match unparen(expr) {
        Expr::Member(m) => {
            is_module_dot_exports(m, unresolved_mark)
                || is_module_exports_chain(&m.obj, unresolved_mark)
        }
        _ => false,
    }
}

/// The exported name of `Object.defineProperty(exports, "<name>", { … })` — the
/// shape transpilers emit for named exports and the `__esModule` marker.
pub(crate) fn as_exports_define_property(call: &CallExpr, unresolved_mark: Mark) -> Option<RcStr> {
    let Callee::Expr(callee) = &call.callee else {
        return None;
    };
    let Expr::Member(member) = unparen(callee) else {
        return None;
    };
    let Expr::Ident(obj) = unparen(&member.obj) else {
        return None;
    };
    if !is_global(obj, "Object", unresolved_mark) || !prop_is(&member.prop, "defineProperty") {
        return None;
    }
    let [target, name, descriptor] = &call.args[..] else {
        return None;
    };
    if target.spread.is_some() || name.spread.is_some() || descriptor.spread.is_some() {
        return None;
    }
    if !is_exports_object(&target.expr, unresolved_mark) {
        return None;
    }
    let Expr::Lit(Lit::Str(name)) = unparen(&name.expr) else {
        return None;
    };
    if !matches!(unparen(&descriptor.expr), Expr::Object(_)) {
        return None;
    }
    Some(RcStr::from(name.value.to_string_lossy().into_owned()))
}

/// Whether the `Object.defineProperty` descriptor sets `value: true` (the
/// `__esModule` interop marker).
pub(crate) fn define_property_sets_es_module(call: &CallExpr) -> bool {
    let Some(descriptor) = call.args.get(2) else {
        return false;
    };
    let Expr::Object(descriptor) = unparen(&descriptor.expr) else {
        return false;
    };
    descriptor.props.iter().any(|prop| {
        matches!(prop, PropOrSpread::Prop(prop)
            if matches!(&**prop, Prop::KeyValue(kv)
                if prop_name_eq(&kv.key, "value")
                    && matches!(unparen(&kv.value), Expr::Lit(Lit::Bool(b)) if b.value)))
    })
}

/// Whether `member` writes the module's own CommonJS exports: `exports.<x>`,
/// `module.exports`, or `module.exports.<x>`.
pub(crate) fn is_cjs_export_member(member: &MemberExpr, unresolved_mark: Mark) -> bool {
    match unparen(&member.obj) {
        // `exports.<anything>`, or `module.exports`
        Expr::Ident(obj) => {
            is_global(obj, "exports", unresolved_mark)
                || is_module_dot_exports(member, unresolved_mark)
        }
        // `module.exports.<anything>`
        Expr::Member(inner) => is_cjs_export_member(inner, unresolved_mark),
        _ => false,
    }
}
