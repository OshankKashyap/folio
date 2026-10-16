use crate::db::AppError;
use base64::{Engine, engine::general_purpose::STANDARD};
use std::{fs::File, io::Read, path::Path};

const MAX_ICON_BYTES: u64 = 256 * 1024;

pub fn read_icon(path: &Path) -> Result<String, AppError> {
    let invalid = || AppError::invalid("Choose a PNG, JPEG, or WebP image up to 256 KB.");
    let unreadable = || AppError::invalid("Could not read this image. Please try again.");
    let file = File::open(path).map_err(|_| unreadable())?;
    let metadata = file.metadata().map_err(|_| unreadable())?;
    if !metadata.is_file() || metadata.len() > MAX_ICON_BYTES {
        return Err(invalid());
    }
    // Bound the read too: the selected file could grow after the metadata check.
    let mut bytes = Vec::new();
    file.take(MAX_ICON_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| unreadable())?;
    if bytes.len() as u64 > MAX_ICON_BYTES {
        return Err(invalid());
    }
    let mime = if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        "png"
    } else if bytes.starts_with(b"\xff\xd8\xff") {
        "jpeg"
    } else if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP") {
        "webp"
    } else {
        return Err(invalid());
    };
    Ok(format!(
        "data:image/{mime};base64,{}",
        STANDARD.encode(bytes)
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn selected_icons_are_bounded_and_typed_by_content_not_filename() {
        let path = std::env::temp_dir().join(format!("folio-icon-test-{}.png", std::process::id()));
        for (mime, bytes) in [
            ("png", b"\x89PNG\r\n\x1a\n".as_slice()),
            ("jpeg", b"\xff\xd8\xff".as_slice()),
            ("webp", b"RIFF\x04\0\0\0WEBP".as_slice()),
        ] {
            std::fs::write(&path, bytes).unwrap();
            assert_eq!(
                read_icon(&path).unwrap(),
                format!("data:image/{mime};base64,{}", STANDARD.encode(bytes))
            );
        }
        for bytes in [b"<svg></svg>".as_slice(), b"not an image", b"RIFF", b""] {
            std::fs::write(&path, bytes).unwrap();
            let error = serde_json::to_value(read_icon(&path).unwrap_err()).unwrap();
            assert_eq!(
                error["message"],
                "Choose a PNG, JPEG, or WebP image up to 256 KB."
            );
        }
        let mut maximum = vec![0; MAX_ICON_BYTES as usize];
        maximum[..8].copy_from_slice(b"\x89PNG\r\n\x1a\n");
        std::fs::write(&path, &maximum).unwrap();
        assert!(read_icon(&path).is_ok());
        maximum.push(0);
        std::fs::write(&path, maximum).unwrap();
        assert!(read_icon(&path).is_err());
        std::fs::remove_file(&path).unwrap();
        let error = serde_json::to_value(read_icon(&path).unwrap_err()).unwrap();
        assert_eq!(
            error["message"],
            "Could not read this image. Please try again."
        );
        assert!(read_icon(&std::env::temp_dir()).is_err());
    }
}
