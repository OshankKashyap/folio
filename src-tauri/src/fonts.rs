use std::process::{Command, Output};

const DETECTION_FAILED: &str = "System font detection is unavailable.";

fn first_family(value: &str) -> Option<&str> {
    let family = value
        .split(',')
        .next()?
        .trim()
        .trim_matches(['\'', '"'])
        .trim();
    (!family.is_empty()).then_some(family)
}

fn parse_output(output: std::io::Result<Output>) -> Result<String, &'static str> {
    let output = output.map_err(|_| DETECTION_FAILED)?;
    if !output.status.success() {
        return Err(DETECTION_FAILED);
    }
    let text = std::str::from_utf8(&output.stdout).map_err(|_| DETECTION_FAILED)?;
    first_family(text)
        .map(str::to_owned)
        .ok_or(DETECTION_FAILED)
}

fn match_font(family: &str) -> Result<String, &'static str> {
    // Pass a literal family, not fontconfig pattern properties or shell arguments.
    let pattern = family
        .replace('\\', "\\\\")
        .replace('-', "\\-")
        .replace(':', "\\:");
    parse_output(
        Command::new("fc-match")
            .args(["--format=%{family}", "--", &pattern])
            .output(),
    )
}

pub fn default_font() -> Result<String, &'static str> {
    let css = include_str!("../../src/routes/app.css");
    let (_, stack) = css
        .split_once("--default-app-font:")
        .ok_or(DETECTION_FAILED)?;
    let family =
        first_family(stack.split(';').next().ok_or(DETECTION_FAILED)?).ok_or(DETECTION_FAILED)?;
    match_font(family)
}

fn families_match(requested: &str, resolved: &str) -> bool {
    match (first_family(requested), first_family(resolved)) {
        (Some(requested), Some(resolved)) => requested
            .to_lowercase()
            .split_whitespace()
            .eq(resolved.to_lowercase().split_whitespace()),
        _ => false,
    }
}

pub fn is_available(family: &str) -> Result<bool, &'static str> {
    let Some(requested) = first_family(family) else {
        return Ok(false);
    };
    if requested.chars().count() > 200 || requested.chars().any(char::is_control) {
        return Ok(false);
    }
    let resolved = match_font(requested)?;
    Ok(families_match(requested, &resolved))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(unix)]
    use std::os::unix::process::ExitStatusExt;
    #[cfg(windows)]
    use std::os::windows::process::ExitStatusExt;

    fn output(status: i32, stdout: &[u8]) -> std::io::Result<Output> {
        Ok(Output {
            status: std::process::ExitStatus::from_raw(status as _),
            stdout: stdout.to_vec(),
            stderr: Vec::new(),
        })
    }

    #[test]
    fn parses_fc_match_family_output() {
        assert_eq!(
            parse_output(output(0, b"Noto Sans Display\n")),
            Ok("Noto Sans Display".into())
        );
        assert_eq!(
            parse_output(output(0, b"Noto Sans,Noto Sans Regular\n")),
            Ok("Noto Sans".into())
        );
    }

    #[test]
    fn compares_first_families_without_accepting_substitution() {
        for (requested, resolved, expected) in [
            ("Inter", "Inter", true),
            ("  INTER  ", "inter", true),
            ("\" Noto  Sans \"", "noto sans", true),
            (
                "'Noto Sans', sans-serif",
                "Noto Sans,Noto Sans Regular",
                true,
            ),
            ("Missing Font", "Noto Sans", false),
            ("Noto Sans", "Noto Sans Display", false),
            ("", "Noto Sans", false),
            ("Inter", "", false),
        ] {
            assert_eq!(families_match(requested, resolved), expected);
        }
    }

    #[test]
    fn handles_missing_command_failed_status_empty_and_invalid_output() {
        assert!(parse_output(Err(std::io::Error::from(std::io::ErrorKind::NotFound))).is_err());
        for result in [
            output(256, b"Inter"),
            output(0, b""),
            output(0, b" \n"),
            output(0, &[0xff]),
        ] {
            assert!(parse_output(result).is_err());
        }
        assert_eq!(is_available(""), Ok(false));
        assert_eq!(is_available("Bad\nFont"), Ok(false));
        assert_eq!(is_available(&"x".repeat(201)), Ok(false));
    }
}
