import type { DesignSettings, ThemeColors } from "./types";

export const THEMES: { id: string; name: string; colors: ThemeColors }[] = [
  { id: "violet", name: "FCDS Violet", colors: { background: "#F7F5FF", header: "#EEE8FF", title: "#241B43", subtitle: "#756B91", card: "#FFFFFF", cardText: "#29213F", date: "#6D4AFF", timeBadge: "#EFEAFF", timeText: "#5135BC", accent: "#7656E8", border: "#E6DDFD", secondaryText: "#7B748C" } },
  { id: "paper", name: "Warm Paper", colors: { background: "#F5F3EE", header: "#E9E5DA", title: "#283238", subtitle: "#6F8796", card: "#FFFFFF", cardText: "#283238", date: "#B77D6E", timeBadge: "#E8EFED", timeText: "#4F6B6B", accent: "#B77D6E", border: "#E4DED2", secondaryText: "#778087" } },
  { id: "white", name: "Minimal White", colors: { background: "#FFFFFF", header: "#F4F4F5", title: "#18181B", subtitle: "#71717A", card: "#FAFAFA", cardText: "#27272A", date: "#52525B", timeBadge: "#E4E4E7", timeText: "#27272A", accent: "#52525B", border: "#E4E4E7", secondaryText: "#71717A" } },
  { id: "midnight", name: "Midnight", colors: { background: "#111827", header: "#1F2937", title: "#F9FAFB", subtitle: "#A5B4C5", card: "#243244", cardText: "#F9FAFB", date: "#A5B4FC", timeBadge: "#37465C", timeText: "#E0E7FF", accent: "#818CF8", border: "#3A4A60", secondaryText: "#B7C2D0" } },
  { id: "ocean", name: "Ocean", colors: { background: "#EFF8FB", header: "#D8EEF3", title: "#123747", subtitle: "#527B8A", card: "#FFFFFF", cardText: "#173B49", date: "#087E8B", timeBadge: "#D9F1F1", timeText: "#086B75", accent: "#0F8994", border: "#CFE5E9", secondaryText: "#64828B" } },
  { id: "lavender", name: "Lavender", colors: { background: "#F8F5FF", header: "#EDE4FF", title: "#38255C", subtitle: "#8876A5", card: "#FFFFFF", cardText: "#38255C", date: "#8B5CF6", timeBadge: "#F0E9FF", timeText: "#7042C8", accent: "#A78BFA", border: "#E6DAFF", secondaryText: "#897B9D" } },
  { id: "forest", name: "Forest", colors: { background: "#F1F6F0", header: "#DFEADF", title: "#233C2D", subtitle: "#718B76", card: "#FFFFFF", cardText: "#243B2D", date: "#477A53", timeBadge: "#E2F0E4", timeText: "#386746", accent: "#5E986D", border: "#D8E7D9", secondaryText: "#718578" } },
  { id: "peach", name: "Peach", colors: { background: "#FFF6F1", header: "#FFE4D8", title: "#573328", subtitle: "#A77A69", card: "#FFFFFF", cardText: "#573328", date: "#D66B54", timeBadge: "#FFF0E8", timeText: "#AD4D39", accent: "#E78B70", border: "#F3DED3", secondaryText: "#A17F73" } },
  { id: "mono", name: "Monochrome", colors: { background: "#F2F2F2", header: "#DCDCDC", title: "#111111", subtitle: "#555555", card: "#FFFFFF", cardText: "#171717", date: "#333333", timeBadge: "#E7E7E7", timeText: "#222222", accent: "#444444", border: "#D5D5D5", secondaryText: "#666666" } },
];

export const DEFAULT_SETTINGS: DesignSettings = {
  template: "agenda",
  orientation: "square",
  direction: "vertical",
  width: 1080,
  height: 1080,
  theme: "violet",
  colors: THEMES[0].colors,
  cardShape: "rounded",
  cardRadius: 20,
  borderWidth: 4,
  shadow: "strong",
  decoration: "left-stripe",
  backgroundStyle: "solid",
  headerStyle: "banner",
  fontFamily: "Arial",
  titleSize: 48,
  courseSize: 27,
  dateSize: 21,
  timeSize: 21,
  fontWeight: "bold",
  textAlign: "left",
  spacing: "normal",
  margins: 50,
  order: "chronological",
  manualExamOrderIds: [],
  showDate: true,
  showDayName: true,
  showTime: true,
  showBrand: true,
  quality: 92,
};

export const SIZE_PRESETS = [
  { id: "square", label: "Square", width: 1080, height: 1080, orientation: "square" as const },
  { id: "a4-portrait", label: "A4 Portrait", width: 2480, height: 3508, orientation: "portrait" as const },
];

export function normalizeDesignSettings(settings: DesignSettings): DesignSettings {
  const isA4Portrait = settings.width === 2480 && settings.height === 3508;
  return {
    ...settings,
    orientation: isA4Portrait ? "portrait" : "square",
    direction: "vertical",
    width: isA4Portrait ? 2480 : 1080,
    height: isA4Portrait ? 3508 : 1080,
    cardShape: "rounded",
    cardRadius: 20,
    borderWidth: 4,
    shadow: "strong",
    decoration: "left-stripe",
    backgroundStyle: "solid",
    headerStyle: "banner",
    titleSize: Math.round(Math.min(76, Math.max(28, settings.titleSize ?? 48))),
    courseSize: Math.round(Math.min(42, Math.max(16, settings.courseSize ?? 27))),
    dateSize: Math.round(Math.min(32, Math.max(12, settings.dateSize ?? 21))),
    timeSize: Math.round(Math.min(32, Math.max(12, settings.timeSize ?? 21))),
    fontFamily: settings.fontFamily || "Arial",
    fontWeight: "bold",
    spacing: "normal",
    margins: 50,
    order: "chronological",
    manualExamOrderIds: [],
    showDate: true,
    showDayName: true,
    showTime: true,
    showBrand: true,
  };
}