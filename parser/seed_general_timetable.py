import json
import os
from collections import defaultdict
from pathlib import Path

from dotenv import load_dotenv
from supabase import Client, create_client

# ------------------------------------------------------------
# CONFIG
# ------------------------------------------------------------

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
JSON_PATH = SCRIPT_DIR / "general_timetable_manual.json"

# The new PDFs do not state the academic year in the extracted timetable header.
# Change these three values if the university labels this timetable differently.
ACADEMIC_YEAR = "2026/2027"
TERM = "Fall"
DISPLAY_NAME = "Fall 2026/27"

TRACK = "GN"
SEMESTER_STATUS = "published"
SOURCE_NAME = (
    "Alexandria University General Timetables - "
    "Level 1, Level 2, Level 3, Level 4"
)
PARSER_VERSION = "manual-general-v1"

# ------------------------------------------------------------
# ENVIRONMENT
# ------------------------------------------------------------

load_dotenv(PROJECT_ROOT / ".env.local")

SUPABASE_URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

supabase: Client = create_client(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
)


def normalize_schedule_code(code):
    if code is None:
        return None

    code = str(code).strip()
    return code or None


# Supabase stores `meetings.period` as SMALLINT (1-6), while the new manual
# timetable JSON keeps the original row-header time label for readability.
# Convert the label to the numeric period only at the database boundary.
PERIOD_MAP = {
    "8:30 – 10:30": 1,
    "10:30 – 12:30": 2,
    "12:30 – 2:30": 3,
    "2:30 - 4:30": 4,
    "4:30 – 6:30": 5,
    "6:30 – 8:30": 6,
}


def db_location_type(location_type):
    """Normalize manual-JSON location types to the existing DB vocabulary.

    The legacy timetable schema uses `hall` for normal FCDS/Hall rooms and
    `lab` for laboratories. The new manual JSON initially called normal
    FCDS rooms `room`, so normalize that value only at the DB boundary.
    """
    if location_type is None:
        return None

    value = str(location_type).strip().lower()

    mapping = {
        "room": "hall",
        "hall": "hall",
        "lab": "lab",
    }

    try:
        return mapping[value]
    except KeyError:
        raise ValueError(
            f"Unsupported database location_type: {location_type!r}. "
            "Expected one of: hall, lab, or null."
        )


def period_number(period):
    if isinstance(period, int):
        return period

    if period is None:
        raise ValueError("Meeting period is missing")

    value = str(period).strip()
    if value.isdigit():
        number = int(value)
        if 1 <= number <= 6:
            return number

    # Normalize hyphens/spaces just in case a PDF extraction variation appears.
    normalized = value.replace("–", "-").replace("—", "-").replace("  ", " ")
    for label, number in PERIOD_MAP.items():
        if normalized == label.replace("–", "-"):
            return number

    raise ValueError(f"Unknown meeting period label: {period!r}")


def find_catalog_course(cell):
    """Resolve a normal course to course_catalog.

    Priority:
      1. timetable schedule_code restored from the existing catalog
      2. normalized course name (used for Math 0)

    TTC deliberately has no code and no catalog match.
    """
    source_code = normalize_schedule_code(cell.get("course_code"))

    if source_code:
        result = (
            supabase.table("course_catalog")
            .select(
                "id, canonical_code, schedule_code, name, "
                "normalized_name, catalog_category"
            )
            .eq("schedule_code", source_code)
            .limit(1)
            .execute()
        )

        if result.data:
            return result.data[0]

    course_name = (cell.get("course_name") or "").strip()
    if course_name:
        result = (
            supabase.table("course_catalog")
            .select(
                "id, canonical_code, schedule_code, name, "
                "normalized_name, catalog_category"
            )
            .eq("normalized_name", course_name.lower())
            .limit(1)
            .execute()
        )

        if result.data:
            return result.data[0]

    return None


def get_or_create_timetable_course(catalog_course, source_name):
    """Reuse the timetable course linked to a catalog course."""
    catalog_id = catalog_course["id"]

    result = (
        supabase.table("courses")
        .select("id, code, name, catalog_course_id")
        .eq("catalog_course_id", catalog_id)
        .limit(1)
        .execute()
    )

    if result.data:
        return result.data[0]["id"]

    payload = {
        "code": catalog_course.get("schedule_code"),
        "name": catalog_course["name"],
        "normalized_name": catalog_course["name"].strip().lower(),
        "catalog_course_id": catalog_id,
    }

    result = supabase.table("courses").insert(payload).execute()
    return result.data[0]["id"]


def get_or_create_unlinked_course(source_name):
    """Create/reuse an intentionally unlinked timetable course (TTC)."""
    result = (
        supabase.table("courses")
        .select("id, code, name, catalog_course_id")
        .eq("name", source_name)
        .limit(20)
        .execute()
    )

    for row in result.data or []:
        if row.get("catalog_course_id") is None:
            return row["id"]

    # No catalog code is known for TTC, so code remains NULL intentionally.
    result = supabase.table("courses").insert(
        {
            "code": None,
            "name": source_name,
            "normalized_name": source_name.strip().lower(),
            "catalog_course_id": None,
        }
    ).execute()

    return result.data[0]["id"]


def get_or_create_semester():
    result = (
        supabase.table("semesters")
        .select("id")
        .eq("academic_year", ACADEMIC_YEAR)
        .eq("term", TERM)
        .limit(1)
        .execute()
    )

    if result.data:
        semester_id = result.data[0]["id"]

        # Keep metadata aligned with this import.
        supabase.table("semesters").update(
            {
                "display_name": DISPLAY_NAME,
                "status": SEMESTER_STATUS,
                "source_pdf_name": SOURCE_NAME,
                "parser_version": PARSER_VERSION,
            }
        ).eq("id", semester_id).execute()

        return semester_id

    result = supabase.table("semesters").insert(
        {
            "academic_year": ACADEMIC_YEAR,
            "term": TERM,
            "display_name": DISPLAY_NAME,
            "status": SEMESTER_STATUS,
            "source_pdf_name": SOURCE_NAME,
            "parser_version": PARSER_VERSION,
        }
    ).execute()

    return result.data[0]["id"]


def get_or_create_semester_course(semester_id, course_id, source_code, source_name):
    result = (
        supabase.table("semester_courses")
        .select("id")
        .eq("semester_id", semester_id)
        .eq("course_id", course_id)
        .limit(1)
        .execute()
    )

    if result.data:
        return result.data[0]["id"]

    result = supabase.table("semester_courses").insert(
        {
            "semester_id": semester_id,
            "course_id": course_id,
            "source_code": source_code,
            "source_name": source_name,
        }
    ).execute()

    return result.data[0]["id"]


def main(dry_run=False):
    with JSON_PATH.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)

    cells = payload["cells"] if isinstance(payload, dict) else payload

    print(f"Loaded {len(cells)} manual timetable cells.")
    print(f"Target semester: {DISPLAY_NAME} ({ACADEMIC_YEAR} / {TERM})")
    print(f"Track: {TRACK}")

    # Validate all source location types before doing any database writes.
    raw_location_types = sorted(
        {
            cell.get("meeting", {}).get("location_type")
            for cell in cells
        },
        key=lambda value: "" if value is None else str(value),
    )
    normalized_location_types = []
    for value in raw_location_types:
        normalized_location_types.append((value, db_location_type(value)))
    print(
        "Location types: "
        + ", ".join(
            f"{raw!r} -> {normalized!r}"
            for raw, normalized in normalized_location_types
        )
    )

    # --------------------------------------------------------
    # RESOLVE COURSES + BUILD OFFERING TREE IN MEMORY
    # --------------------------------------------------------

    resolved_courses = {}
    unresolved = []

    # Keyed by catalog ID for linked courses, or by ('unlinked', name) for TTC.
    course_tree = {}

    for cell in cells:
        course_name = (cell.get("course_name") or "").strip()
        course_code = normalize_schedule_code(cell.get("course_code"))

        if not course_name:
            continue

        catalog_course = find_catalog_course(cell)

        is_ttc = course_name.lower().startswith(
            "technology transfer and commercialization"
        )

        if catalog_course:
            course_key = ("catalog", catalog_course["id"])
            resolved_courses[course_key] = {
                "catalog": catalog_course,
                "course_name": catalog_course["name"],
                "source_code": catalog_course.get("schedule_code"),
                "unlinked": False,
            }
        elif is_ttc:
            course_key = ("unlinked", course_name)
            resolved_courses[course_key] = {
                "catalog": None,
                "course_name": course_name,
                "source_code": None,
                "unlinked": True,
            }
        else:
            unresolved.append(
                {
                    "course_code": course_code,
                    "course_name": course_name,
                    "level": cell.get("level"),
                    "page": cell.get("meeting", {}).get("source_page"),
                }
            )
            continue

        offering_group_key_base = (
            course_key,
            int(cell["level"]),
            TRACK,
            int(cell.get("group_total") or len(cell.get("groups") or [])),
        )

        for group_number in cell.get("groups") or []:
            offering_key = offering_group_key_base + (int(group_number),)

            offering = course_tree.setdefault(
                offering_key,
                {
                    "course_key": course_key,
                    "level": int(cell["level"]),
                    "track": TRACK,
                    "group_number": int(group_number),
                    "group_total": int(
                        cell.get("group_total")
                        or len(cell.get("groups") or [])
                    ),
                    "raw_section_label": cell.get("raw_section_label"),
                    "components": defaultdict(lambda: defaultdict(list)),
                    "category": (
                        catalog_course.get("catalog_category")
                        if catalog_course
                        else None
                    ),
                },
            )

            # The existing database constraint only accepts `lecture` and
            # `practical` as component types. The new PDFs use `section` for
            # group/section choices, but these behave exactly like the old
            # one-choice practical options in the current schema. Normalize
            # `section` to `practical` at the database boundary.
            source_component_type = cell["component_type"]
            component_type = (
                "practical"
                if source_component_type == "section"
                else source_component_type
            )
            option_label = cell.get("option_label") or "Default"

            # A merged cell applies to every group listed by the source PDF.
            meeting = dict(cell["meeting"])
            meeting["subgroup"] = cell.get("section_label") or option_label

            # Avoid exact duplicate rows if the source ever contains a duplicate cell.
            meeting_key = json.dumps(meeting, ensure_ascii=False, sort_keys=True)
            existing_keys = {
                json.dumps(x, ensure_ascii=False, sort_keys=True)
                for x in offering["components"][component_type][option_label]
            }
            if meeting_key not in existing_keys:
                offering["components"][component_type][option_label].append(meeting)

    if dry_run:
        print("\nDRY RUN — no database writes were made.")
        print(f"Resolved courses: {len(resolved_courses)}")
        print(f"Offerings to create: {len(course_tree)}")
        print(f"Unresolved non-TTC courses: {len(unresolved)}")
        if unresolved:
            for item in unresolved:
                print(
                    "  unresolved: "
                    f"level={item['level']} code={item['course_code']} "
                    f"name={item['course_name']} page={item['page']}"
                )
        return

    if unresolved:
        print("\nERROR: Non-TTC timetable cells could not be matched to course_catalog.")
        for item in unresolved:
            print(
                "  unresolved: "
                f"level={item['level']} code={item['course_code']} "
                f"name={item['course_name']} page={item['page']}"
            )
        raise SystemExit(1)

    semester_id = get_or_create_semester()
    print(f"Using semester id: {semester_id}")

    inserted_meetings = 0
    inserted_options = 0
    inserted_components = 0
    inserted_offerings = 0
    inserted_semester_courses = 0

    # --------------------------------------------------------
    # INSERT COURSES / OFFERINGS / COMPONENTS / OPTIONS / MEETINGS
    # --------------------------------------------------------

    course_ids = {}
    semester_course_ids = {}

    for course_key, course_info in resolved_courses.items():
        if course_info["unlinked"]:
            course_id = get_or_create_unlinked_course(course_info["course_name"])
        else:
            course_id = get_or_create_timetable_course(
                course_info["catalog"],
                course_info["course_name"],
            )

        course_ids[course_key] = course_id

        semester_course_id_before = (
            supabase.table("semester_courses")
            .select("id")
            .eq("semester_id", semester_id)
            .eq("course_id", course_id)
            .limit(1)
            .execute()
        )

        semester_course_id = get_or_create_semester_course(
            semester_id,
            course_id,
            course_info["source_code"],
            course_info["course_name"],
        )
        semester_course_ids[course_key] = semester_course_id

        if not semester_course_id_before.data:
            inserted_semester_courses += 1

    for offering in course_tree.values():
        course_key = offering["course_key"]
        semester_course_id = semester_course_ids[course_key]

        existing_offering = (
            supabase.table("offerings")
            .select("id")
            .eq("semester_course_id", semester_course_id)
            .eq("group_number", offering["group_number"])
            .eq("group_total", offering["group_total"])
            .eq("track", offering["track"])
            .limit(1)
            .execute()
        )

        if existing_offering.data:
            offering_id = existing_offering.data[0]["id"]
        else:
            result = supabase.table("offerings").insert(
                {
                    "semester_course_id": semester_course_id,
                    "eligible_years": [offering["level"]],
                    "track": offering["track"],
                    "group_number": offering["group_number"],
                    "group_total": offering["group_total"],
                    "category": offering["category"],
                    "raw_section_label": offering["raw_section_label"],
                }
            ).execute()
            offering_id = result.data[0]["id"]
            inserted_offerings += 1

        for component_type, options in offering["components"].items():
            selection_mode = "all" if component_type == "lecture" else "one"

            # Reuse a component of this type for the same offering.
            existing_component = (
                supabase.table("offering_components")
                .select("id")
                .eq("offering_id", offering_id)
                .eq("component_type", component_type)
                .limit(1)
                .execute()
            )

            if existing_component.data:
                component_id = existing_component.data[0]["id"]
            else:
                result = supabase.table("offering_components").insert(
                    {
                        "offering_id": offering_id,
                        "component_type": component_type,
                        "selection_mode": selection_mode,
                    }
                ).execute()
                component_id = result.data[0]["id"]
                inserted_components += 1

            for option_label, meetings in options.items():
                option_query = (
                    supabase.table("meeting_options")
                    .select("id")
                    .eq("component_id", component_id)
                )
                if option_label == "Default":
                    option_query = option_query.is_("raw_option_label", "null")
                else:
                    option_query = option_query.eq("raw_option_label", option_label)

                existing_option = (
                    option_query.limit(1).execute()
                )

                if existing_option.data:
                    option_id = existing_option.data[0]["id"]
                else:
                    subgroups = [] if option_label == "Default" else [option_label]
                    result = supabase.table("meeting_options").insert(
                        {
                            "component_id": component_id,
                            "name": (
                                f"{component_type.capitalize()} Option: "
                                f"{option_label}"
                            ),
                            "subgroups": subgroups,
                            "raw_option_label": (
                                None if option_label == "Default" else option_label
                            ),
                        }
                    ).execute()
                    option_id = result.data[0]["id"]
                    inserted_options += 1

                for meeting in meetings:
                    period = period_number(meeting["period"])

                    # Do not duplicate a meeting when rerunning the script for the
                    # same target semester and offering/component/option.
                    duplicate = (
                        supabase.table("meetings")
                        .select("id")
                        .eq("meeting_option_id", option_id)
                        .eq("day", meeting["day"])
                        .eq("period", period)
                        .eq("start_time", meeting["start_time"])
                        .eq("end_time", meeting["end_time"])
                        .limit(1)
                        .execute()
                    )

                    if duplicate.data:
                        continue

                    supabase.table("meetings").insert(
                        {
                            "meeting_option_id": option_id,
                            "meeting_type": component_type,
                            "day": meeting["day"],
                            "period": period,
                            "start_time": meeting["start_time"],
                            "end_time": meeting["end_time"],
                            "location_type": db_location_type(
                                meeting.get("location_type")
                            ),
                            "location": meeting.get("location"),
                            "instructor": meeting.get("instructor"),
                            "subgroup": meeting.get("subgroup"),
                            "raw_text": meeting.get("raw_text"),
                            "source_page": meeting.get("source_page"),
                        }
                    ).execute()
                    inserted_meetings += 1

    linked_count = sum(1 for info in resolved_courses.values() if not info["unlinked"])
    unlinked_count = sum(1 for info in resolved_courses.values() if info["unlinked"])

    print("\nImport complete.")
    print(f"  Courses resolved:            {len(resolved_courses)}")
    print(f"  Catalog-linked courses:     {linked_count}")
    print(f"  Intentionally unlinked:     {unlinked_count} (TTC)")
    print(f"  New semester_courses:        {inserted_semester_courses}")
    print(f"  New offerings:               {inserted_offerings}")
    print(f"  New components:              {inserted_components}")
    print(f"  New meeting options:         {inserted_options}")
    print(f"  New meetings:                {inserted_meetings}")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="Seed Alexandria University General-track timetable from manual JSON."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate and summarize the JSON without writing to Supabase.",
    )
    args = parser.parse_args()
    main(dry_run=args.dry_run)
