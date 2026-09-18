import json
import re
from pathlib import Path

import pymupdf


# =============================================================================
# CONFIG
# =============================================================================

PDF_FILE = Path("Proposed Fall Schedule 2025 - 2026-Updated Sections 21Sept.pdf")
OUTPUT_FILE = Path("parsed_cells_continuation.json")

VALID_DAYS = {
    "Saturday",
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
}

# The six timetable columns in this PDF.
FALLBACK_PERIOD_COLUMNS = [
    (67.80, 189.50),
    (191.06, 317.08),
    (318.65, 444.79),
    (446.23, 572.35),
    (573.79, 692.85),
    (694.30, 813.36),
]

PERIOD_TIMES = {
    1: ("08:30", "10:30"),
    2: ("10:30", "12:30"),
    3: ("12:30", "14:30"),
    4: ("14:30", "16:30"),
    5: ("16:30", "18:30"),
    6: ("18:30", "20:30"),
}


# =============================================================================
# GENERAL HELPERS
# =============================================================================

def normalize_spaces(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def normalize_dashes(text: str) -> str:
    return (
        text.replace("–", "-")
        .replace("—", "-")
        .replace("−", "-")
    )


def rect_key(rect) -> tuple:
    return tuple(
        round(float(v), 2)
        for v in (rect.x0, rect.y0, rect.x1, rect.y1)
    )


def get_start_end_time(period: int):
    return PERIOD_TIMES.get(period, ("00:00", "00:00"))


# =============================================================================
# PDF GEOMETRY
# =============================================================================

def get_rectangle_drawings(page):
    """Return every rectangle drawn in the PDF page."""
    rectangles = []

    for drawing in page.get_drawings():
        for item in drawing.get("items", []):
            if item[0] == "re":
                rectangles.append(item[1])

    return rectangles


def dedupe_rectangles(rectangles):
    seen = set()
    result = []

    for rect in rectangles:
        key = rect_key(rect)
        if key in seen:
            continue
        seen.add(key)
        result.append(rect)

    return result


def detect_period_columns(rectangles):
    """Detect the six timetable columns from the page header."""

    candidates = []

    for rect in rectangles:
        if rect.x0 < 65:
            continue

        # Period header rectangles on pages that explicitly show the header.
        if not (68 <= rect.y0 <= 71):
            continue

        if rect.y1 > 78:
            continue

        if rect.width < 90:
            continue

        candidates.append(rect)

    candidates = dedupe_rectangles(candidates)
    candidates.sort(key=lambda r: r.x0)

    # Cluster near-duplicate drawings.
    clusters = []
    for rect in candidates:
        if not clusters or abs(rect.x0 - clusters[-1][-1].x0) > 1.0:
            clusters.append([rect])
        else:
            clusters[-1].append(rect)

    columns = []
    for cluster in clusters:
        rect = max(cluster, key=lambda r: (r.width, r.height))
        columns.append((float(rect.x0), float(rect.x1)))

    return columns if len(columns) == 6 else FALLBACK_PERIOD_COLUMNS.copy()


def detect_day_regions(page, rectangles):
    """
    Find explicit weekday regions on a page.

    A day label is in the narrow left-hand column. The large rectangle behind
    it tells us the vertical extent of that day.
    """

    words = page.get_text("words")

    day_words = [
        word
        for word in words
        if word[0] < 65 and word[4].strip() in VALID_DAYS
    ]

    left_rectangles = [
        rect
        for rect in rectangles
        if 25 <= rect.x0 <= 32
        and rect.x1 < 70
        and rect.height > 20
    ]

    regions = []

    for word in day_words:
        day = word[4].strip()
        center_y = (word[1] + word[3]) / 2

        matches = [
            rect
            for rect in left_rectangles
            if rect.y0 - 0.5 <= center_y <= rect.y1 + 0.5
        ]

        if not matches:
            continue

        region_rect = max(matches, key=lambda r: r.height)

        regions.append({
            "day": day,
            "rect": region_rect,
        })

    # Deduplicate.
    unique = {}
    for region in regions:
        key = (region["day"], rect_key(region["rect"]))
        unique[key] = region

    return sorted(unique.values(), key=lambda item: item["rect"].y0)


def has_timetable_grid(page, rectangles):
    """Detect whether a page has actual timetable cells below the header."""

    for rect in rectangles:
        if rect.x0 < 65:
            continue
        if rect.x1 > 815:
            continue
        if rect.width < 40:
            continue
        if rect.height < 10:
            continue
        if rect.y0 < 57:
            continue

        return True

    return False


def detect_cells_for_day(rectangles, day_rect):
    """Detect outer physical cells belonging to an explicit day region."""

    cells = []

    for rect in rectangles:
        if rect.x0 < 65:
            continue
        if rect.x1 > 815:
            continue
        if rect.y0 < 77:
            continue
        if rect.height < 10:
            continue
        if rect.width < 40:
            continue

        if rect.y0 < day_rect.y0 - 0.5:
            continue
        if rect.y1 > day_rect.y1 + 0.5:
            continue

        cells.append(rect)

    cells = dedupe_rectangles(cells)
    cells.sort(key=lambda r: (r.y0, r.x0))
    return cells


def detect_cells_for_continuation(rectangles):
    """
    Detect outer cells on a page that contains a continued timetable but no
    new weekday label.

    This intentionally allows y≈57 so the first timetable row on page 5 is
    not thrown away merely because it appears immediately below the repeated
    university header.
    """

    cells = []

    for rect in rectangles:
        if rect.x0 < 65:
            continue
        if rect.x1 > 815:
            continue
        if rect.y0 < 57:
            continue
        if rect.height < 10:
            continue
        if rect.width < 40:
            continue

        cells.append(rect)

    cells = dedupe_rectangles(cells)
    cells.sort(key=lambda r: (r.y0, r.x0))

    # On continuation pages there are often no large period-header cells.
    # If header-like 7-point internal rectangles are present they were already
    # excluded by height >= 10.
    return cells


def get_period_from_cell(cell_rect, period_columns):
    center_x = (cell_rect.x0 + cell_rect.x1) / 2

    for period, (x0, x1) in enumerate(period_columns, start=1):
        if x0 - 1 <= center_x <= x1 + 1:
            return period

    centers = [
        (((x0 + x1) / 2), period)
        for period, (x0, x1) in enumerate(period_columns, start=1)
    ]

    return min(centers, key=lambda item: abs(center_x - item[0]))[1]


# =============================================================================
# WORD EXTRACTION
# =============================================================================

def extract_cell_text(page, cell_rect):
    """Extract only words physically located inside one outer cell."""

    cell_words = []

    for word in page.get_text("words"):
        x0, y0, x1, y1, text = word[:5]

        cx = (x0 + x1) / 2
        cy = (y0 + y1) / 2

        if not (cell_rect.x0 + 0.25 <= cx <= cell_rect.x1 - 0.25):
            continue
        if not (cell_rect.y0 + 0.25 <= cy <= cell_rect.y1 - 0.25):
            continue

        cell_words.append(word)

    if not cell_words:
        return ""

    cell_words.sort(key=lambda w: (w[1], w[0]))

    lines = []
    current = []
    current_y = None

    for word in cell_words:
        y0 = word[1]

        if current_y is None or abs(y0 - current_y) <= 2.5:
            current.append(word)
            if current_y is None:
                current_y = y0
        else:
            current.sort(key=lambda w: w[0])
            line = normalize_spaces(" ".join(w[4] for w in current))
            if line:
                lines.append(line)
            current = [word]
            current_y = y0

    if current:
        current.sort(key=lambda w: w[0])
        line = normalize_spaces(" ".join(w[4] for w in current))
        if line:
            lines.append(line)

    return "\n".join(lines)


# =============================================================================
# FIELD PARSERS
# =============================================================================

def parse_eligible_years(header_line):
    header_line = normalize_dashes(header_line)

    match = re.match(r"^\s*([1-4](?:\s*,\s*[1-4])*)\b", header_line)
    if not match:
        return []

    return [int(x.strip()) for x in match.group(1).split(",")]


def parse_track(header_line):
    for track in ("Special", "GN", "CY", "AI", "BA", "HA", "MA"):
        if re.search(rf"\b{re.escape(track)}\b", header_line, re.IGNORECASE):
            return "Special" if track == "Special" else track.upper()

    return None


def parse_group(header_line):
    match = re.search(
        r"\bg\s*(\d+)\s*/\s*(\d+)\b",
        normalize_dashes(header_line),
        re.IGNORECASE,
    )

    if not match:
        return None, None

    return int(match.group(1)), int(match.group(2))


def parse_subgroup(text):
    match = re.search(
        r"\b(P\s*\d+|S\s*\d+(?:\s*,\s*\d+)?)\b",
        normalize_dashes(text),
        re.IGNORECASE,
    )

    if not match:
        return None

    return re.sub(r"\s+", "", match.group(1)).upper()


def extract_location(lines):
    for line in lines:
        match = re.match(
            r"^(Hall|Lab|online|outside)\s*:\s*(.+?)\s*$",
            normalize_dashes(line),
            re.IGNORECASE,
        )

        if match:
            return match.group(1).lower(), normalize_spaces(match.group(2))

    return None, None


def extract_instructors(text):
    text = normalize_dashes(text)

    pattern = re.compile(
        r"(Dr\.|Eng\.)\s*([A-Za-z][A-Za-z .'-]*?)"
        r"(?=\s*(?:,|-)?\s*(?:Dr\.|Eng\.)|\s+(?:Hall|Lab|online|outside)\s*:|\s+\d{5}\s*:|\s+\d{3}[×xX]{2}\s*:|$)",
        re.IGNORECASE,
    )

    instructors = []

    for match in pattern.finditer(text):
        prefix = match.group(1).capitalize()
        name = normalize_spaces(match.group(2).strip(" -–,|"))

        if name:
            instructors.append(f"{prefix} {name}")

    return list(dict.fromkeys(instructors))


def strip_instructor_suffix(text):
    text = normalize_dashes(text)

    return re.split(
        r"\s+-\s*(?=(?:Dr\.|Eng\.))",
        text,
        maxsplit=1,
        flags=re.IGNORECASE,
    )[0].strip()


def extract_course(lines, flat_text):
    """Extract a course code/name even when PDF text wraps across lines."""

    code_pattern = r"(?:\d{5}|\d{3}[×xX]{2})"
    normalized_flat = normalize_dashes(flat_text)

    # Preferred path: code:name anywhere in the flattened cell text.
    code_match = re.search(
        rf"({code_pattern})\s*:\s*(.+?)"
        rf"(?=\s+(?:Hall|Lab|online|outside)\s*:|$)",
        normalized_flat,
        re.IGNORECASE,
    )

    if code_match:
        code = code_match.group(1)
        raw_name = normalize_spaces(code_match.group(2))

        # Remove trailing instructor suffix.
        raw_name = re.split(
            r"\s+-\s*(?=(?:Dr\.|Eng\.))",
            raw_name,
            maxsplit=1,
            flags=re.IGNORECASE,
        )[0].strip()

        raw_name = raw_name.rstrip("- |ǀ").strip()

        if raw_name:
            return code, raw_name

    # Fallback for entries without a numeric code, e.g.:
    #   Math0 - Dr. Ahmed Said
    no_code_match = re.search(
        r"(?:^|\s)([A-Za-z][A-Za-z0-9&/() .'-]{2,}?)"
        r"\s+-\s+(?=(?:Dr\.|Eng\.))",
        normalized_flat,
        re.IGNORECASE,
    )

    if no_code_match:
        candidate = normalize_spaces(no_code_match.group(1)).strip("- |ǀ")

        # Avoid interpreting section headers as course names.
        if not re.search(
            r"\b(?:Practical|Elective|GN|CY|AI|BA|HA|Special)\b",
            candidate,
            re.IGNORECASE,
        ):
            return None, candidate

    return None, None


# =============================================================================
# CELL RECORD
# =============================================================================

def parse_cell(cell_text, day, period, page_num, source_rect, day_source):
    lines = [line.strip() for line in cell_text.splitlines() if line.strip()]
    if not lines:
        return None

    header_line = lines[0]
    flat_text = normalize_spaces(normalize_dashes(cell_text.replace("\n", " ")))

    # Keep the section label together when the PDF wraps it across lines.
    section_prefix = re.split(
        r"\s+(?=(?:Hall|Lab|online|outside)\s*:|(?:\d{5}|\d{3}[×xX]{2})\s*:)",
        flat_text,
        maxsplit=1,
        flags=re.IGNORECASE,
    )[0].strip()
    if not section_prefix:
        section_prefix = header_line

    years = parse_eligible_years(header_line)
    track = parse_track(header_line)
    group_num, group_total = parse_group(flat_text)

    is_practical = bool(
        re.search(r"\bPractical\b|\bLab\s*:", flat_text, re.IGNORECASE)
    )

    location_type, location = extract_location(lines)
    instructors = extract_instructors(flat_text)
    course_code, course_name = extract_course(lines, flat_text)
    subgroup = parse_subgroup(flat_text)

    start_time, end_time = get_start_end_time(period)

    # Deliberately do not invent missing values.
    record = {
        "course_code": course_code,
        "course_name": course_name,
        "offering": {
            "eligible_years": years,
            "track": track,
            "group_number": group_num,
            "group_total": group_total,
            "raw_section_label": section_prefix,
        },
        "component": {
            "type": "practical" if is_practical else "lecture",
        },
        "option": {
            "label": subgroup,
        },
        "meeting": {
            "day": day,
            "period": period,
            "start_time": start_time,
            "end_time": end_time,
            "location_type": location_type,
            "location": location,
            "instructor": " - ".join(instructors) if instructors else None,
            "raw_text": cell_text.replace("\n", " | "),
            "source_page": page_num,
            "day_source": day_source,
            "source_rect": {
                "x0": round(float(source_rect.x0), 2),
                "y0": round(float(source_rect.y0), 2),
                "x1": round(float(source_rect.x1), 2),
                "y1": round(float(source_rect.y1), 2),
            },
        },
    }

    # Tell downstream code what kind of source cell this is.
    if course_code is None and course_name is None:
        record["status"] = "incomplete_source_cell"
    elif not years and track is None and group_num is None:
        record["status"] = "course_only_source_cell"

    return record


# =============================================================================
# MAIN PROCESSOR WITH PAGE-CONTINUATION SUPPORT
# =============================================================================

def process_pdf(pdf_path: str):
    doc = pymupdf.open(pdf_path)
    records = []

    # This is the crucial state used when a day continues onto another PDF page.
    last_explicit_day = None

    period_columns = None

    try:
        for page_index in range(len(doc)):
            page = doc[page_index]
            page_num = page_index + 1

            rectangles = get_rectangle_drawings(page)

            if period_columns is None:
                period_columns = detect_period_columns(rectangles)

            day_regions = detect_day_regions(page, rectangles)

            if day_regions:
                # Explicit weekday labels take priority.
                print(
                    f"Page {page_num}: explicit days = "
                    f"{[r['day'] for r in day_regions]}"
                )

                for region in day_regions:
                    day = region["day"]
                    last_explicit_day = day

                    cells = detect_cells_for_day(
                        rectangles,
                        region["rect"],
                    )

                    count = 0

                    for cell in cells:
                        text = extract_cell_text(page, cell)
                        if len(text.strip()) < 3:
                            continue

                        period = get_period_from_cell(
                            cell,
                            period_columns,
                        )

                        record = parse_cell(
                            cell_text=text,
                            day=day,
                            period=period,
                            page_num=page_num,
                            source_rect=cell,
                            day_source="explicit_day_label",
                        )

                        if record:
                            records.append(record)
                            count += 1

                    print(
                        f"  {day}: {count} non-empty cells"
                    )

                continue

            # -----------------------------------------------------------------
            # CONTINUATION PAGE
            # -----------------------------------------------------------------
            # No new weekday label exists. If the page has timetable geometry,
            # carry forward the last explicit day rather than dropping page 5.
            # -----------------------------------------------------------------

            if last_explicit_day and has_timetable_grid(page, rectangles):
                day = last_explicit_day

                print(
                    f"Page {page_num}: no weekday label; "
                    f"continuing previous day = {day}"
                )

                cells = detect_cells_for_continuation(
                    rectangles
                )

                count = 0

                for cell in cells:
                    text = extract_cell_text(page, cell)
                    if len(text.strip()) < 3:
                        continue

                    period = get_period_from_cell(
                        cell,
                        period_columns,
                    )

                    record = parse_cell(
                        cell_text=text,
                        day=day,
                        period=period,
                        page_num=page_num,
                        source_rect=cell,
                        day_source="continued_from_previous_page",
                    )

                    if record:
                        records.append(record)
                        count += 1

                print(
                    f"  {day} continuation: {count} non-empty cells"
                )

            else:
                print(
                    f"Page {page_num}: no explicit day and no safe "
                    f"continuation context; skipped."
                )

    finally:
        doc.close()

    return records


# =============================================================================
# ENTRY POINT
# =============================================================================

if __name__ == "__main__":
    pdf_file = PDF_FILE

    if not pdf_file.exists():
        candidates = sorted(
            Path(".").glob("Proposed Fall Schedule 2025 - 2026-Updated Sections 21Sept*.pdf")
        )

        if len(candidates) == 1:
            pdf_file = candidates[0]
        elif len(candidates) == 0:
            raise FileNotFoundError(
                f"Could not find the timetable PDF: {PDF_FILE}"
            )
        else:
            raise RuntimeError(
                "The exact timetable PDF was not found and multiple matching PDFs exist. "
                "Set PDF_FILE to the correct one."
            )

    print(f"Reading: {pdf_file}")

    parsed = process_pdf(str(pdf_file))

    with OUTPUT_FILE.open("w", encoding="utf-8") as file:
        json.dump(parsed, file, indent=4, ensure_ascii=False)

    print()
    print(f"SUCCESS: extracted {len(parsed)} non-empty timetable cells.")
    print(f"Saved to: {OUTPUT_FILE.resolve()}")

    continuation_count = sum(
        1
        for record in parsed
        if record["meeting"].get("day_source") == "continued_from_previous_page"
    )

    incomplete_count = sum(
        1
        for record in parsed
        if record.get("status") == "incomplete_source_cell"
    )

    print(f"Continuation-page records: {continuation_count}")
    print(f"Incomplete source cells: {incomplete_count}")
