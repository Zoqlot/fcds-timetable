import type { MidtermPreferences } from "./types";

export function preferencesKey(sessionId: string) {
  return "fcds-midterm:" + sessionId + ":v1";
}

export function loadPreferences(sessionId: string): Partial<MidtermPreferences> | null {
  try {
    const raw = window.localStorage.getItem(preferencesKey(sessionId));
    return raw ? JSON.parse(raw) as Partial<MidtermPreferences> : null;
  } catch {
    return null;
  }
}

export function savePreferences(sessionId: string, preferences: MidtermPreferences) {
  try {
    window.localStorage.setItem(preferencesKey(sessionId), JSON.stringify(preferences));
  } catch {
    // Private browsing or full storage should never break timetable editing.
  }
}