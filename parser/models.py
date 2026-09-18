from pydantic import BaseModel
from typing import List, Optional
from datetime import time

class MeetingOption(BaseModel):
    name: str
    subgroups: Optional[str] = None

class Meeting(BaseModel):
    meeting_type: str # "lecture" or "practical"
    day: str
    period: int
    start_time: str
    end_time: str
    location_type: Optional[str] = None # "hall", "lab", "online", "outside"
    location: Optional[str] = None
    instructor: Optional[str] = None
    subgroup: Optional[str] = None
    meeting_option_name: Optional[str] = None 
    raw_text: str # Always keep this for debugging!

class Offering(BaseModel):
    year: Optional[int] = None
    track: Optional[str] = None
    section: Optional[str] = None
    group_number: Optional[int] = None
    group_total: Optional[int] = None
    category: Optional[str] = None
    meetings: List[Meeting] = []

class Course(BaseModel):
    code: Optional[str] = None
    name: str
    normalized_name: str
    offerings: List[Offering] = []

class SemesterData(BaseModel):
    academic_year: str
    term: str
    courses: List[Course] = []