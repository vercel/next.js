#![no_main]

use std::str::FromStr;

use bincode::{Decode, Encode};
use either::Either;
use libfuzzer_sys::fuzz_target;
use mime::Mime;
use smallvec::SmallVec;
use turbo_bincode::{turbo_bincode_decode, turbo_bincode_encode};

fn roundtrip<T>(data: &[u8], label: &str)
where
    T: Encode + Decode<()> + PartialEq + std::fmt::Debug,
{
    let Ok(val) = turbo_bincode_decode::<T>(data) else {
        return;
    };
    let enc = turbo_bincode_encode(&val).unwrap_or_else(|e| panic!("{label} encode: {e:?}"));
    let dec = turbo_bincode_decode::<T>(&enc)
        .unwrap_or_else(|e| panic!("{label} roundtrip decode: {e:?}"));
    assert_eq!(val, dec, "{label} roundtrip mismatch");
    let enc2 = turbo_bincode_encode(&dec).unwrap_or_else(|e| panic!("{label} re-encode: {e:?}"));
    assert_eq!(enc, enc2, "{label} double-encode mismatch");
}

fn read_varint(data: &[u8]) -> Option<(u64, usize)> {
    let first = *data.first()?;
    match first {
        0x00..=0xFA => Some((first as u64, 1)),
        0xFB => {
            let b = data.get(1..3)?;
            Some((u16::from_le_bytes([b[0], b[1]]) as u64, 3))
        }
        0xFC => {
            let b = data.get(1..5)?;
            Some((u32::from_le_bytes([b[0], b[1], b[2], b[3]]) as u64, 5))
        }
        0xFD => {
            let b = data.get(1..9)?;
            Some((u64::from_le_bytes([b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7]]), 9))
        }
        _ => None,
    }
}

fn mime_option_is_safe(data: &[u8]) -> bool {
    let Some(&tag) = data.first() else {
        return true;
    };
    if tag == 0 {
        return true;
    }
    if tag != 1 {
        return true;
    }
    let rest = &data[1..];
    match read_varint(rest) {
        Some((len, consumed)) => {
            let remaining = rest.len().saturating_sub(consumed);
            len <= remaining as u64 && len <= 65536
        }
        None => true,
    }
}

#[derive(Encode, Decode, PartialEq, Debug)]
struct WrapEitherFixed(
    #[bincode(with = "turbo_bincode::either")] Either<u64, u64>,
);

#[derive(Encode, Decode, PartialEq, Debug)]
struct WrapMimeOption(
    #[bincode(with = "turbo_bincode::mime_option")] Option<Mime>,
);

fuzz_target!(|data: &[u8]| {
    if data.len() > 1 << 16 {
        return;
    }

    roundtrip::<WrapEitherFixed>(data, "EitherFixed");

    if mime_option_is_safe(data) {
        roundtrip::<WrapMimeOption>(data, "MimeOption");
    }

    let limit = data.len().min(16);
    for i in 0..limit {
        let s = &data[..i];
        let _ = turbo_bincode_decode::<WrapEitherFixed>(s);
        if mime_option_is_safe(s) {
            let _ = turbo_bincode_decode::<WrapMimeOption>(s);
        }
    }

    {
        #[derive(Encode, Decode, PartialEq, Debug)]
        struct WrapSmallVec(
            #[bincode(with = "turbo_bincode::smallvec")] SmallVec<[u8; 16]>,
        );
        let sv: SmallVec<[u8; 16]> = data.iter().take(64).copied().collect();
        let wrapped = WrapSmallVec(sv);
        let enc = turbo_bincode_encode(&wrapped).expect("smallvec encode");
        let dec = turbo_bincode_decode::<WrapSmallVec>(&enc).expect("smallvec decode");
        assert_eq!(wrapped, dec, "smallvec roundtrip");
        let enc2 = turbo_bincode_encode(&dec).expect("smallvec re-encode");
        assert_eq!(enc, enc2, "smallvec double-encode");
    }

    if data.len() <= 256 {
        if let Ok(s) = std::str::from_utf8(data) {
            if let Ok(mime) = Mime::from_str(s) {
                let wrapped = WrapMimeOption(Some(mime));
                let enc = turbo_bincode_encode(&wrapped).expect("mime encode");
                if mime_option_is_safe(&enc) {
                    let dec = turbo_bincode_decode::<WrapMimeOption>(&enc)
                        .expect("mime roundtrip decode");
                    assert_eq!(wrapped, dec, "mime roundtrip mismatch");
                }
            }
        }
    }
});