use std::{borrow::Cow, io::Write, ops::ControlFlow, sync::Arc};

use flate2::{Compression, write::GzEncoder};
use turbopack_trace_server::{
    QueryOptions, SortMode, TraceParser, protocol::ProtocolSession, query_spans, read_trace_bytes,
    read_trace_bytes_with_progress, store_container::StoreContainer,
};
use turbopack_trace_utils::tracing::TraceRow;

fn raw_trace() -> Vec<u8> {
    let rows = [
        TraceRow::Start {
            ts: 100,
            id: 1,
            parent: None,
            name: Cow::Borrowed("compile"),
            target: Cow::Borrowed("test"),
            values: Vec::new(),
        },
        TraceRow::Enter {
            ts: 100,
            id: 1,
            thread_id: 1,
        },
        TraceRow::Exit {
            ts: 200,
            id: 1,
            thread_id: 1,
        },
        TraceRow::End { ts: 200, id: 1 },
    ];
    let mut bytes = b"TRACEv0".to_vec();
    for row in rows {
        bytes.extend(postcard::to_allocvec(&row).unwrap());
    }
    bytes
}

fn root_names(store: &Arc<StoreContainer>) -> Vec<String> {
    query_spans(
        store,
        QueryOptions {
            parent: None,
            aggregated: false,
            sort: SortMode::ExecutionOrder,
            search: None,
            page: 1,
        },
    )
    .spans
    .into_iter()
    .map(|span| span.name)
    .collect()
}

#[test]
fn parses_raw_trace_across_arbitrary_chunks() {
    let bytes = raw_trace();
    let expected = read_trace_bytes(&bytes).unwrap();

    let store = Arc::new(StoreContainer::new());
    let mut parser = TraceParser::new(store.clone());
    for chunk in bytes.chunks(3) {
        parser.push(chunk).unwrap();
    }
    parser.finish().unwrap();

    assert_eq!(root_names(&store), root_names(&expected));
    assert_eq!(root_names(&store), ["test compile"]);
}

#[test]
fn parses_gzip_trace() {
    let raw = raw_trace();
    let mut encoder = GzEncoder::new(Vec::new(), Compression::fast());
    encoder.write_all(&raw).unwrap();
    let gzip = encoder.finish().unwrap();

    let store = read_trace_bytes(&gzip).unwrap();
    assert_eq!(root_names(&store), ["test compile"]);
}

#[test]
fn reports_raw_and_gzip_load_progress() {
    let raw = raw_trace();
    let mut encoder = GzEncoder::new(Vec::new(), Compression::fast());
    encoder.write_all(&raw).unwrap();
    let gzip = encoder.finish().unwrap();

    for (input, is_compressed) in [(&raw, false), (&gzip, true)] {
        let mut reports = Vec::new();
        read_trace_bytes_with_progress(input, |progress| {
            reports.push((
                progress.bytes_read,
                progress.total_bytes,
                progress.uncompressed_bytes_read,
                progress.done,
                progress.stats(),
            ));
            ControlFlow::Continue(())
        })
        .unwrap();

        let final_report = reports.last().unwrap();
        assert_eq!(final_report.0, input.len());
        assert_eq!(final_report.1, input.len());
        assert_eq!(final_report.2, raw.len());
        assert!(final_report.3);
        assert!(final_report.4.contains("1 spans"));
        assert!(reports[..reports.len() - 1].iter().all(|report| !report.3));
        if is_compressed {
            assert_ne!(final_report.0, final_report.2);
        } else {
            assert_eq!(final_report.0, final_report.2);
        }
    }
}

#[test]
fn progress_callback_can_abort_loading() {
    let error = read_trace_bytes_with_progress(&raw_trace(), |_| ControlFlow::Break(()))
        .err()
        .unwrap()
        .to_string();

    assert!(error.contains("aborted by the progress callback"));
}

#[test]
fn rejects_unsupported_or_incomplete_input() {
    let error = read_trace_bytes(&[0x28, 0xb5, 0x2f, 0xfd])
        .err()
        .unwrap()
        .to_string();
    assert!(error.contains("zstd-compressed traces are not supported"));

    let mut incomplete = raw_trace();
    incomplete.pop();
    let error = read_trace_bytes(&incomplete).err().unwrap().to_string();
    assert!(error.contains("incomplete"));
}

#[test]
fn implements_existing_viewer_protocol_without_a_transport() {
    let store = read_trace_bytes(&raw_trace()).unwrap();
    let mut session = ProtocolSession::new(store);

    let responses = session
        .handle_text(
            r#"{"type":"view-rect","viewRect":{"x":0,"y":0,"width":10000000,"height":20,"horizontalPixels":1000,"query":"","viewMode":"aggregated","valueMode":"duration","valueFilter":null,"countFilter":null}}"#,
        )
        .unwrap();
    assert!(
        responses
            .last()
            .unwrap()
            .contains(r#""type":"view-lines-count""#)
    );
    assert!(
        responses[..responses.len() - 1]
            .iter()
            .all(|response| response.contains(r#""type":"view-line""#))
    );

    // View mutations are retained while updates are backpressured.
    assert!(
        session
            .handle_text(r#"{"type":"view-mode","id":"1","mode":"raw-spans","inherit":false}"#,)
            .unwrap()
            .is_empty()
    );
    assert!(
        session
            .handle_text(r#"{"type":"reset-view-mode","id":"1"}"#)
            .unwrap()
            .is_empty()
    );

    // A query response is immediate even while a view update is waiting for an ack.
    let responses = session.handle_text(r#"{"type":"query","id":"1"}"#).unwrap();
    assert_eq!(responses.len(), 1);
    assert!(responses[0].contains(r#""type":"query-result""#));

    // The skipped view update is delivered after acknowledgement.
    let responses = session.handle_text(r#"{"type":"ack"}"#).unwrap();
    assert!(
        responses
            .last()
            .unwrap()
            .contains(r#""type":"view-lines-count""#)
    );

    assert!(session.handle_text("not json").is_err());
    assert!(
        session
            .handle_text(r#"{"type":"view-mode","id":"1","mode":"unknown","inherit":false}"#)
            .is_err()
    );
}
