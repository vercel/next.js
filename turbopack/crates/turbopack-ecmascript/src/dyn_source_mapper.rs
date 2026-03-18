use std::sync::Arc;

use swc_core::{
    common::{
        BytePos, FileName, Loc, SourceMapper, Span, SpanSnippetError, source_map::FileLinesResult,
    },
    ecma::ast::SourceMapperExt,
};

/// A concrete, `Sized` wrapper around `Arc<dyn SourceMapper>`.
///
/// SWC's `Emitter<'a, W, S>` requires `S: Sized + SourceMapper + SourceMapperExt`.
/// Using `Arc<dyn SourceMapper>` directly is not possible because `dyn SourceMapper`
/// is unsized. This newtype satisfies the bound while dispatching all calls through
/// a single vtable, reducing binary size by collapsing all `Emitter` monomorphizations
/// inside `turbopack-ecmascript` to `Emitter<W, DynSourceMapper>`.
pub(crate) struct DynSourceMapper(pub(crate) Arc<dyn SourceMapper>);

impl SourceMapper for DynSourceMapper {
    fn lookup_char_pos(&self, pos: BytePos) -> Loc {
        self.0.lookup_char_pos(pos)
    }

    fn span_to_lines(&self, sp: Span) -> FileLinesResult {
        self.0.span_to_lines(sp)
    }

    fn span_to_string(&self, sp: Span) -> String {
        self.0.span_to_string(sp)
    }

    fn span_to_filename(&self, sp: Span) -> Arc<FileName> {
        self.0.span_to_filename(sp)
    }

    fn merge_spans(&self, sp_lhs: Span, sp_rhs: Span) -> Option<Span> {
        self.0.merge_spans(sp_lhs, sp_rhs)
    }

    fn call_span_if_macro(&self, sp: Span) -> Span {
        self.0.call_span_if_macro(sp)
    }

    fn doctest_offset_line(&self, line: usize) -> usize {
        self.0.doctest_offset_line(line)
    }

    fn span_to_snippet(&self, sp: Span) -> Result<String, Box<SpanSnippetError>> {
        self.0.span_to_snippet(sp)
    }
}

impl SourceMapperExt for DynSourceMapper {
    fn get_code_map(&self) -> &dyn SourceMapper {
        self.0.as_ref()
    }
}
