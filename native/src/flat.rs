//! Recognize documents made entirely of literal ATX headings, ordinary text, simple list
//! items and top-level fenced code. Any other block or MDX syntax goes to the full parser.
use super::projection::{closes_fence, fence};
use serde_json::{Value, json};

fn ordinary(line: &str) -> bool {
    let mut text = line.trim_start_matches(' ');
    if text.is_empty() {
        return true;
    }
    if text.contains(['<', '{', '}']) {
        return false;
    }
    if let Some(rest) = text
        .strip_prefix("- ")
        .or_else(|| text.strip_prefix("* "))
        .or_else(|| text.strip_prefix("+ "))
    {
        text = rest.trim_start_matches(' ');
    } else if text.as_bytes()[0].is_ascii_digit() {
        let suffix = text.trim_start_matches(|c: char| c.is_ascii_digit());
        let Some(rest) = suffix
            .strip_prefix(". ")
            .or_else(|| suffix.strip_prefix(") "))
        else {
            return false;
        };
        text = rest.trim_start_matches(' ');
    }
    // Other initial characters may open a container, Setext heading, definition or code fence.
    (text.as_bytes().first().is_some_and(u8::is_ascii_alphabetic)
        || (text.starts_with('`') && !text.starts_with("``"))
        || text
            .strip_prefix("**")
            .is_some_and(|s| s.as_bytes().first().is_some_and(u8::is_ascii_alphabetic)))
        && !text.starts_with("import")
        && !text.starts_with("export")
}

pub fn outline(source: &str) -> Option<String> {
    if source.contains(['\r', '\0', '\u{feff}']) {
        return None;
    }
    let mut headings: Vec<Value> = Vec::new();
    let mut open = None;
    for (i, line) in source.split('\n').enumerate() {
        if let Some((marker, width)) = open {
            if closes_fence(line, marker, width) {
                if !line.trim_start_matches(' ').starts_with(marker as char)
                    || line.len() - line.trim_start_matches(' ').len() > 3
                {
                    return None;
                }
                open = None;
            }
        } else if let Some(delimiter) = fence(line) {
            open = Some(delimiter);
        } else if line.starts_with('#') {
            let depth = line.bytes().take_while(|b| *b == b'#').count();
            let label = line[depth..].strip_prefix(' ')?.trim_matches(' ');
            if depth > 6
                || label.is_empty()
                || !label
                    .chars()
                    .all(|c| c.is_alphanumeric() || c == ' ' || c == '-')
            {
                return None;
            }
            headings.push(json!({"type":"heading","depth":depth,"position":{"start":{"line":i+1}},"children":[{"type":"text","value":label}]}));
        } else if !ordinary(line) {
            return None;
        }
    }
    Some(
        serde_json::to_string(&(headings, Vec::<String>::new()))
            .expect("Headings serialize to JSON"),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn defers_ambiguous_blocks_and_supports_ordinary_lists() {
        assert!(outline("# Guide\n\n- First item\n2. Second item\n\n## Setup").is_some());
        for source in [
            "Title\n===",
            "> # Guide",
            "- # Nested",
            "    # Nested",
            "import x from 'q'",
            "x {missing",
            "x <Tag>",
            "# title#",
            "~~~\nx\n        ~~~\n# End",
        ] {
            assert!(outline(source).is_none(), "{source}");
        }
    }
}
