"use client";

import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import type { DesignSettings, MidtermExam } from "@/lib/midterm/types";
import { dayLabel, timeLabel, sortExams } from "@/lib/midterm/conflicts";

type Props = {
  exams: MidtermExam[];
  settings: DesignSettings;
  title: string;
  subtitle: string;
  footer: string;
  studentName: string;
  canvasRef: RefObject<HTMLCanvasElement | null>;
};

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, width: number, height: number,
  radius: number
) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines = 2) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? line + " " + word : word;
    if (ctx.measureText(candidate).width <= maxWidth || !line) line = candidate;
    else {
      lines.push(line);
      line = word;
      if (lines.length >= maxLines - 1) break;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length) {
    let last = lines[maxLines - 1];
    while (last.length && ctx.measureText(last + "…").width > maxWidth) {
      last = last.slice(0, -1);
    }
    lines[maxLines - 1] = last.trimEnd() + "…";
  }
  return lines;
}

function drawText(
  ctx: CanvasRenderingContext2D, text: string,
  x: number, y: number, maxWidth: number,
  font: string, color: string, align: CanvasTextAlign = "left",
  maxLines = 2, lineHeight = 1.25
) {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "top";
  const lines = wrapText(ctx, text, maxWidth, maxLines);
  const fontSize = Number(font.match(/([\d.]+)px/)?.[1] ?? 16);
  lines.forEach((line, index) => ctx.fillText(line, x, y + index * fontSize * lineHeight, maxWidth));
  return lines.length * fontSize * lineHeight;
}

function drawExamCard(
  ctx: CanvasRenderingContext2D,
  exam: MidtermExam,
  x: number, y: number, width: number, height: number,
  settings: DesignSettings,
  compact = false
) {
  const c = settings.colors;
  const radius = settings.cardShape === "square" ? 2
    : settings.cardShape === "pill" ? Math.min(48, height / 2)
      : settings.cardRadius;

  if (settings.shadow !== "none") {
    ctx.save();
    ctx.shadowColor = settings.shadow === "strong" ? "rgba(0,0,0,.18)" : "rgba(0,0,0,.07)";
    ctx.shadowBlur = settings.shadow === "strong" ? 18 : 8;
    ctx.shadowOffsetY = settings.shadow === "strong" ? 7 : 3;
    roundedRect(ctx, x, y, width, height, radius);
    ctx.fillStyle = c.card;
    ctx.fill();
    ctx.restore();
  } else {
    roundedRect(ctx, x, y, width, height, radius);
    ctx.fillStyle = c.card;
    ctx.fill();
  }

  if (settings.borderWidth > 0) {
    ctx.lineWidth = settings.borderWidth;
    ctx.strokeStyle = c.border;
    roundedRect(ctx, x, y, width, height, radius);
    ctx.stroke();
  }

  const stripeWidth = Math.max(5, compact ? 5 : 7);
  if (settings.decoration === "left-stripe") {
    ctx.save();
    roundedRect(ctx, x, y, width, height, radius);
    ctx.clip();
    ctx.fillStyle = c.accent;
    ctx.fillRect(x, y, stripeWidth, height);
    ctx.restore();
  } else if (settings.decoration === "top-stripe") {
    ctx.save();
    roundedRect(ctx, x, y, width, height, radius);
    ctx.clip();
    ctx.fillStyle = c.accent;
    ctx.fillRect(x, y, width, stripeWidth);
    ctx.restore();
  }

  const pad = compact ? 12 : 20;
  const left = x + pad + (settings.decoration === "left-stripe" ? stripeWidth : 0);
  const right = x + width - pad;
  let cursorY = y + pad + (settings.decoration === "top-stripe" ? stripeWidth : 0);
  const available = Math.max(30, right - left);
  const courseFont = Math.max(13, settings.courseSize * (compact ? 0.82 : 1));
  const dateFont = Math.max(11, settings.dateSize * (compact ? 0.78 : 1));
  const timeFont = Math.max(11, settings.timeSize * (compact ? 0.82 : 1));
  const align = settings.textAlign as CanvasTextAlign;
  const textX = align === "center" ? (left + right) / 2 : align === "right" ? right : left;

  if (settings.showDate || settings.showDayName) {
    const dateText = [
      settings.showDayName ? dayLabel(exam.date, { weekday: "long" }).toUpperCase() : "",
      settings.showDate ? dayLabel(exam.date, { month: "short", day: "numeric" }).toUpperCase() : "",
    ].filter(Boolean).join("  ·  ");
    cursorY += drawText(ctx, dateText, textX, cursorY, available, "700 " + dateFont + "px " + settings.fontFamily, c.date, align, 1) + (compact ? 5 : 9);
  }

  const nameHeight = drawText(
    ctx, exam.courseName, textX, cursorY, available,
    (settings.fontWeight === "normal" ? "400 " : settings.fontWeight === "medium" ? "600 " : "700 ") +
      courseFont + "px " + settings.fontFamily,
    c.cardText, align, compact ? 2 : 3, 1.16
  );
  cursorY += nameHeight + (compact ? 4 : 8);

  if (settings.showCourseCode && exam.courseCode && height > 75) {
    cursorY += drawText(ctx, exam.courseCode, textX, cursorY, available,
      "600 " + Math.max(10, dateFont - 2) + "px " + settings.fontFamily,
      c.secondaryText, align, 1) + (compact ? 3 : 6);
  }
  if (settings.showYearLabel && exam.yearLevel && height > 90) {
    cursorY += drawText(ctx, "YEAR " + exam.yearLevel, textX, cursorY, available,
      "700 " + Math.max(10, dateFont - 3) + "px " + settings.fontFamily,
      c.secondaryText, align, 1) + 4;
  }

  if (settings.showTime) {
    const label = timeLabel(exam.startTime) + " – " + timeLabel(exam.endTime);
    const badgeY = Math.min(y + height - timeFont - pad * 1.55, Math.max(cursorY + 2, y + height - timeFont - pad * 1.5));
    ctx.font = "700 " + timeFont + "px " + settings.fontFamily;
    const badgeWidth = Math.min(available, ctx.measureText(label).width + (compact ? 18 : 28));
    const badgeX = align === "center" ? textX - badgeWidth / 2 : align === "right" ? right - badgeWidth : left;
    const badgeHeight = timeFont + (compact ? 12 : 18);
    roundedRect(ctx, badgeX, badgeY, badgeWidth, badgeHeight, Math.min(14, badgeHeight / 2));
    ctx.fillStyle = c.timeBadge;
    ctx.fill();
    ctx.fillStyle = c.timeText;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, badgeX + badgeWidth / 2, badgeY + badgeHeight / 2, badgeWidth - 8);
  }
}

function renderCanvas(
  canvas: HTMLCanvasElement, exams: MidtermExam[], settings: DesignSettings,
  title: string, subtitle: string, footer: string, studentName: string
) {
  const width = settings.width;
  const height = settings.height;
  if (width * height > 18000000) return;
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const scale = Math.min(width, height) / 1080;
  ctx.scale(scale, scale);
  const W = width / scale;
  const H = height / scale;
  const c = settings.colors;

  ctx.fillStyle = c.background;
  if (settings.backgroundStyle === "gradient") {
    const gradient = ctx.createLinearGradient(0, 0, W, H);
    gradient.addColorStop(0, c.background);
    gradient.addColorStop(1, c.header);
    ctx.fillStyle = gradient;
  }
  ctx.fillRect(0, 0, W, H);

  if (settings.backgroundStyle === "pattern") {
    ctx.save();
    ctx.globalAlpha = 0.13;
    ctx.strokeStyle = c.accent;
    ctx.lineWidth = 1;
    for (let p = -H; p < W; p += 34) {
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p + H, H);
      ctx.stroke();
    }
    ctx.restore();
  }

  const margin = Math.min(settings.margins, W * 0.12, H * 0.1);
  const contentW = W - margin * 2;
  const align = settings.textAlign as CanvasTextAlign;
  const titleX = align === "center" ? W / 2 : align === "right" ? W - margin : margin;
  let headerBottom = margin + 18;
  if (settings.headerStyle === "banner") {
    const bannerH = Math.min(210, Math.max(145, H * 0.14));
    ctx.fillStyle = c.header;
    roundedRect(ctx, margin / 2, margin / 2, W - margin, bannerH, 28);
    ctx.fill();
    headerBottom = margin / 2 + bannerH;
  } else if (settings.headerStyle === "plain") {
    ctx.fillStyle = c.header;
    ctx.fillRect(0, 0, W, Math.min(H * 0.17, 190));
    headerBottom = Math.min(H * 0.17, 190);
  }

  if (settings.showBrand) {
    ctx.font = "700 15px " + settings.fontFamily;
    ctx.fillStyle = c.accent;
    ctx.textAlign = align;
    ctx.textBaseline = "top";
    ctx.fillText("FCDS  /  MIDTERM EXAMS", titleX, margin + (settings.headerStyle === "minimal" ? 0 : 10));
  }
  const titleY = margin + (settings.showBrand ? 29 : 4);
  drawText(ctx, title || "MY MIDTERM EXAMS", titleX, titleY, contentW,
    "800 " + settings.titleSize + "px " + settings.fontFamily, c.title, align, 2, 1.08);
  drawText(ctx, subtitle, titleX, titleY + settings.titleSize * 1.2 + 8, contentW,
    "500 19px " + settings.fontFamily, c.subtitle, align, 2);
  if (studentName.trim()) {
    drawText(ctx, studentName.trim(), titleX, titleY + settings.titleSize * 1.2 + 40,
      contentW, "600 17px " + settings.fontFamily, c.secondaryText, align, 1);
  }

  const ordered = sortExams(exams, settings.order, settings.manualExamOrderIds);
  const bottomSpace = settings.showFooter ? 74 : margin;
  const top = Math.max(headerBottom + 34, titleY + settings.titleSize * 1.2 + 68);
  const availableH = Math.max(150, H - top - bottomSpace);
  const gap = settings.spacing === "compact" ? 12 : settings.spacing === "spacious" ? 26 : 18;

  const drawAgenda = () => {
    const columns = settings.direction === "horizontal" ? (W > H ? 3 : 2) : 1;
    const cardGap = gap;
    const cardW = (contentW - cardGap * (columns - 1)) / columns;
    const rows = Math.ceil(ordered.length / columns);
    const cardH = Math.max(70, (availableH - cardGap * Math.max(0, rows - 1)) / Math.max(1, rows));
    ordered.forEach((exam, index) => {
      const col = index % columns;
      const row = Math.floor(index / columns);
      drawExamCard(ctx, exam, margin + col * (cardW + cardGap), top + row * (cardH + cardGap),
        cardW, Math.min(cardH, 250), settings, cardH < 130);
    });
  };

  const drawDayCells = (calendar: boolean) => {
    const dates = Array.from(new Set(ordered.map((exam) => exam.date))).sort();
    const cols = settings.orientation === "landscape" ? (settings.direction === "vertical" ? 3 : 6) : 2;
    const rows = Math.ceil(dates.length / cols);
    const cellGap = gap;
    const cellW = (contentW - cellGap * (cols - 1)) / cols;
    const cellH = (availableH - cellGap * Math.max(0, rows - 1)) / Math.max(rows, 1);
    dates.forEach((date, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const x = margin + col * (cellW + cellGap);
      const y = top + row * (cellH + cellGap);
      roundedRect(ctx, x, y, cellW, cellH, settings.cardRadius);
      ctx.fillStyle = calendar ? c.header : c.card;
      ctx.fill();
      ctx.strokeStyle = c.border;
      ctx.lineWidth = Math.max(1, settings.borderWidth);
      ctx.stroke();
      const examsOfDay = ordered.filter((exam) => exam.date === date);
      let eventTop = y + 14;
      if (settings.showDayName) {
        const dayTitle = dayLabel(date, { weekday: "long" }).toUpperCase();
        drawText(ctx, dayTitle, x + 14, eventTop, cellW - 28,
          "800 " + Math.max(12, settings.dateSize) + "px " + settings.fontFamily, c.date, "left", 1);
        eventTop += Math.max(22, settings.dateSize + 7);
      }
      if (settings.showDate) {
        drawText(ctx, dayLabel(date, { month: "long", day: "numeric" }), x + 14, eventTop,
          cellW - 28, "500 15px " + settings.fontFamily, c.secondaryText, "left", 1);
        eventTop += 24;
      }
      eventTop += 5;
      const innerGap = Math.max(7, gap * 0.55);
      const eventH = Math.max(52, (cellH - (eventTop - y) - 11 - innerGap * Math.max(0, examsOfDay.length - 1)) /
        Math.max(1, examsOfDay.length));
      examsOfDay.forEach((exam, eventIndex) => {
        drawExamCard(ctx, exam, x + 9, eventTop + eventIndex * (eventH + innerGap),
          cellW - 18, Math.min(eventH, 150), settings, true);
      });
    });
  };

  if (!ordered.length) {
    drawText(ctx, "Select exams to see your personal timetable.", W / 2, top + 40,
      contentW, "600 24px " + settings.fontFamily, c.secondaryText, "center", 2);
  } else if (settings.template === "agenda") {
    drawAgenda();
  } else if (settings.template === "day-columns") {
    drawDayCells(false);
  } else if (settings.template === "calendar-grid") {
    drawDayCells(true);
  } else {
    const columns = settings.direction === "vertical" ? (W > H ? 2 : 2) : (W > H ? 4 : 3);
    const cardGap = gap;
    const cardW = (contentW - cardGap * (columns - 1)) / columns;
    const rows = Math.ceil(ordered.length / columns);
    const cardH = Math.max(90, (availableH - cardGap * Math.max(0, rows - 1)) / Math.max(1, rows));
    ordered.forEach((exam, index) => {
      const col = index % columns;
      const row = Math.floor(index / columns);
      drawExamCard(ctx, exam, margin + col * (cardW + cardGap), top + row * (cardH + cardGap),
        cardW, Math.min(cardH, 240), settings, cardH < 145);
    });
  }

  if (settings.showFooter && footer.trim()) {
    ctx.strokeStyle = c.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(margin, H - margin - 42);
    ctx.lineTo(W - margin, H - margin - 42);
    ctx.stroke();
    drawText(ctx, footer, titleX, H - margin - 28, contentW,
      "600 16px " + settings.fontFamily, c.secondaryText, align, 1);
  }
}

export default function TimetableCanvas({
  exams, settings, title, subtitle, footer, studentName, canvasRef
}: Props) {
  const internalRef = useRef<HTMLCanvasElement>(null);
  const ref = canvasRef || internalRef;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    renderCanvas(canvas, exams, settings, title, subtitle, footer, studentName);
  }, [exams, settings, title, subtitle, footer, studentName, ref]);

  return (
    <canvas
      ref={ref}
      aria-label="Live preview of your personalized midterm exam timetable"
      className="block h-auto w-full rounded-xl shadow-sm"
      style={{ maxHeight: "72vh", objectFit: "contain", background: settings.colors.background }}
    />
  );
}