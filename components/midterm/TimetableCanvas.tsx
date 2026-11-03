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
  compact = false,
  condensedDate = false
) {
  const c = settings.colors;
  const radius = 20;

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

  ctx.save();
  roundedRect(ctx, x, y, width, height, radius);
  ctx.clip();

  const pad = condensedDate ? 7 : compact ? 12 : 20;
  const left = x + pad + stripeWidth;
  const right = x + width - pad;
  let cursorY = y + pad;
  const available = Math.max(30, right - left);
  const courseFont = settings.courseSize;
  const timeFont = settings.timeSize;
  const dateFont = settings.dateSize;
  const align = settings.textAlign as CanvasTextAlign;
  const textX = align === "center" ? (left + right) / 2 : align === "right" ? right : left;

  if (condensedDate) {
    const dateLabel = dayLabel(exam.date, { weekday: "long" }).toUpperCase() + " · " +
      dayLabel(exam.date, { month: "short", day: "numeric" }).toUpperCase();
    cursorY += drawText(ctx, dateLabel, textX, cursorY, available,
      "700 " + dateFont + "px " + settings.fontFamily, c.date, align, 1) + 2;
  } else {
    cursorY += drawText(ctx, dayLabel(exam.date, { weekday: "long" }).toUpperCase(), textX, cursorY,
      available, "700 " + dateFont + "px " + settings.fontFamily, c.date, align, 1) + 3;
    cursorY += drawText(ctx, dayLabel(exam.date, { month: "long", day: "numeric" }).toUpperCase(), textX, cursorY,
      available, "700 " + dateFont + "px " + settings.fontFamily, c.date, align, 1) + (compact ? 5 : 9);
  }

  const badgeY = y + height - timeFont - pad * 1.5;
  const availableCourseHeight = Math.max(27, badgeY - cursorY - 8);
  const maxCourseLines = Math.max(1, Math.min(compact ? 2 : 3, Math.floor(availableCourseHeight / (courseFont * 1.16))));
  const nameHeight = drawText(
    ctx, exam.courseName, textX, cursorY, available,
    "700 " + courseFont + "px " + settings.fontFamily,
    c.cardText, align, maxCourseLines, 1.16
  );
  cursorY += nameHeight + (compact ? 4 : 8);

if (settings.showTime) {
    const label = timeLabel(exam.startTime) + " – " + timeLabel(exam.endTime);
    ctx.font = "700 " + timeFont + "px " + settings.fontFamily;
    const badgeWidth = Math.min(available, ctx.measureText(label).width + (compact ? 18 : 28));
    const badgeX = align === "center" ? textX - badgeWidth / 2 : align === "right" ? right - badgeWidth : left;
    const badgeHeight = timeFont + (condensedDate ? 4 : compact ? 12 : 18);
    roundedRect(ctx, badgeX, badgeY, badgeWidth, badgeHeight, Math.min(14, badgeHeight / 2));
    ctx.fillStyle = c.timeBadge;
    ctx.fill();
    ctx.fillStyle = c.timeText;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, badgeX + badgeWidth / 2, badgeY + badgeHeight / 2, badgeWidth - 8);
  }
  ctx.restore();
}

function renderCanvas(
  canvas: HTMLCanvasElement, exams: MidtermExam[], settings: DesignSettings,
  title: string, subtitle: string, footer: string
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
  ctx.fillRect(0, 0, W, H);

  const margin = 50;
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
    "700 19px " + settings.fontFamily, c.subtitle, align, 2);

  const ordered = sortExams(exams, settings.order, settings.manualExamOrderIds);
  const footerTop = H - margin - 94;
  const top = Math.max(headerBottom + 34, titleY + settings.titleSize * 1.2 + 68);
  const availableH = Math.max(120, footerTop - top - 24);
  const gap = 18;

  const drawAgenda = () => {
    // Agenda is deliberately one full-width subject per row at every page size.
    // Seven square-page cards use a condensed date line to preserve readable fixed typography.
    const condensed = W === H && ordered.length >= 7;
    const cardGap = condensed ? 8 : gap;
    const cardW = contentW;
    const cardH = (availableH - cardGap * Math.max(0, ordered.length - 1)) / Math.max(1, ordered.length);
    ordered.forEach((exam, index) => {
      drawExamCard(ctx, exam, margin, top + index * (cardH + cardGap),
        cardW, cardH, settings, condensed || cardH < 190, condensed);
    });
  };


  const drawTimetable = () => {
    if (!ordered.length) return;
    const toDate = (value: string) => {
      const [year, month, day] = value.split("-").map(Number);
      return new Date(Date.UTC(year, month - 1, day));
    };
    const first = toDate(ordered[0].date);
    const last = toDate(ordered[ordered.length - 1].date);
    const dates: string[] = [];
    for (const d = new Date(first); d <= last; d.setUTCDate(d.getUTCDate() + 1)) dates.push(d.toISOString().slice(0, 10));
    const slots = Array.from(new Map<string, { start: string; end: string }>(ordered.map((e) => [e.startTime + "|" + e.endTime, { start: e.startTime, end: e.endTime }] as const)).values())
      .sort((a, b) => a.start.localeCompare(b.start));
    const clock = (value: string) => {
      const [hh, mm] = value.split(":").map(Number);
      return (hh % 12 || 12) + (mm ? ":" + String(mm).padStart(2, "0") : "") + (hh >= 12 ? " PM" : " AM");
    };
    const headerH = Math.max(54, Math.min(78, availableH * 0.12));
    const dayW = Math.max(112, Math.min(174, contentW * 0.17));
    const gridX = margin + dayW + 8;
    const gridW = contentW - dayW - 8;
    const colGap = 7;
    const slotW = (gridW - colGap * Math.max(0, slots.length - 1)) / Math.max(1, slots.length);
    const rowGap = 7;
    const rowH = (availableH - headerH - rowGap * Math.max(0, dates.length - 1)) / dates.length;

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = c.secondaryText;
    ctx.font = "700 13px " + settings.fontFamily;
    ctx.fillText("DAY / DATE", margin + dayW / 2, top + headerH / 2);
    slots.forEach((slot, i) => {
      const x = gridX + i * (slotW + colGap);
      roundedRect(ctx, x, top, slotW, headerH, 15);
      ctx.fillStyle = c.accent;
      ctx.fill();
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "700 11px " + settings.fontFamily;
      ctx.fillText("PERIOD " + (i + 1), x + slotW / 2, top + headerH * 0.32);
      ctx.font = "700 " + Math.max(14, Math.min(21, settings.timeSize)) + "px " + settings.fontFamily;
      ctx.fillText(clock(slot.start) + " – " + clock(slot.end), x + slotW / 2, top + headerH * 0.68, slotW - 8);
    });

    dates.forEach((date, ri) => {
      const y = top + headerH + ri * (rowH + rowGap);
      const dt = toDate(date);
      roundedRect(ctx, margin, y, dayW, rowH, 15);
      ctx.fillStyle = c.header;
      ctx.fill();
      ctx.fillStyle = c.title;
      ctx.font = "700 " + Math.max(13, Math.min(19, settings.dateSize)) + "px " + settings.fontFamily;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(new Intl.DateTimeFormat("en", { weekday: "long", timeZone: "UTC" }).format(dt), margin + dayW / 2, y + rowH * 0.43, dayW - 8);
      ctx.fillStyle = c.secondaryText;
      ctx.font = "500 " + Math.max(10, Math.min(14, settings.dateSize - 5)) + "px " + settings.fontFamily;
      ctx.fillText(new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(dt), margin + dayW / 2, y + rowH * 0.68, dayW - 8);

      const dayExams = ordered.filter((e) => e.date === date);
      slots.forEach((slot, si) => {
        const x = gridX + si * (slotW + colGap);
        const matches = dayExams.filter((e) => e.startTime === slot.start && e.endTime === slot.end);
        ctx.save();
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = c.border;
        ctx.lineWidth = 1.5;
        roundedRect(ctx, x, y, slotW, rowH, 13);
        ctx.stroke();
        ctx.restore();
        if (!matches.length) return;
        const inset = 8;
        const innerGap = 5;
        const cardH = (rowH - inset * 2 - innerGap * (matches.length - 1)) / matches.length;
        matches.forEach((exam, ei) => {
          const cy = y + inset + ei * (cardH + innerGap);
          roundedRect(ctx, x, cy, slotW, cardH, 12);
          ctx.fillStyle = c.card;
          ctx.fill();
          const chipSize = Math.max(9, Math.min(12, settings.dateSize - 7));
          const chip = dayLabel(exam.date, { day: "numeric", month: "short" }).toUpperCase();
          ctx.font = "700 " + chipSize + "px " + settings.fontFamily;
          const chipW = Math.min(slotW - 16, ctx.measureText(chip).width + 14);
          roundedRect(ctx, x + 8, cy + 7, chipW, chipSize + 8, 8);
          ctx.fillStyle = c.accent;
          ctx.fill();
          ctx.fillStyle = "#FFFFFF";
          ctx.textAlign = "left";
          ctx.textBaseline = "top";
          ctx.fillText(chip, x + 15, cy + 11);
          const courseSize = Math.max(11, Math.min(settings.courseSize, cardH * 0.22));
          drawText(ctx, exam.courseName, x + 9, cy + chipSize + 21, slotW - 18,
            "700 " + courseSize + "px " + settings.fontFamily, c.cardText, "left", 2, 1.12);
          const timeSize = Math.max(9, Math.min(settings.timeSize - 5, cardH * 0.15));
          const badgeY = cy + cardH - timeSize - 13;
          roundedRect(ctx, x + 8, badgeY, slotW - 16, timeSize + 9, 8);
          ctx.fillStyle = c.timeBadge;
          ctx.fill();
          ctx.fillStyle = c.timeText;
          ctx.font = "600 " + timeSize + "px " + settings.fontFamily;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(clock(exam.startTime) + " – " + clock(exam.endTime), x + slotW / 2, badgeY + (timeSize + 9) / 2, slotW - 24);
        });
      });
      if (!dayExams.length) {
        ctx.save();
        ctx.fillStyle = c.header;
        ctx.globalAlpha = 0.35;
        roundedRect(ctx, gridX, y, gridW, rowH, 13);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = c.secondaryText;
        ctx.font = "700 15px " + settings.fontFamily;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("NO EXAMS", gridX + gridW / 2, y + rowH / 2);
        ctx.restore();
      }
    });
  };

  const drawDayCells = (calendar: boolean) => {
    const dates = Array.from(new Set(ordered.map((exam) => exam.date))).sort();
    const cols = 2;
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
      const eventTop = y + 14;
      const innerGap = Math.max(7, gap * 0.55);
      const eventH = Math.max(1, (cellH - (eventTop - y) - 11 - innerGap * Math.max(0, examsOfDay.length - 1)) /
        Math.max(1, examsOfDay.length));
      examsOfDay.forEach((exam, eventIndex) => {
        drawExamCard(ctx, exam, x + 9, eventTop + eventIndex * (eventH + innerGap),
          cellW - 18, eventH, settings, true);
      });
    });
  };

  // Clip the timetable to its own reserved region; the quote footer is always separate.
  ctx.save();
  ctx.beginPath();
  ctx.rect(margin, top, contentW, availableH);
  ctx.clip();
  if (!ordered.length) {
    drawText(ctx, "Select exams to see your personal timetable.", W / 2, top + 40,
      contentW, "600 24px " + settings.fontFamily, c.secondaryText, "center", 2);
  } else if (settings.template === "agenda") {
    drawAgenda();
  } else if (settings.template === "day-columns") {
    drawDayCells(false);
  } else if (settings.template === "timetable") {
    drawTimetable();
  } else {
    const columns = 2;
    const cardGap = gap;
    const cardW = (contentW - cardGap * (columns - 1)) / columns;
    const rows = Math.ceil(ordered.length / columns);
    const cardH = (availableH - cardGap * Math.max(0, rows - 1)) / Math.max(1, rows);
    ordered.forEach((exam, index) => {
      const col = index % columns;
      const row = Math.floor(index / columns);
      drawExamCard(ctx, exam, margin + col * (cardW + cardGap), top + row * (cardH + cardGap),
        cardW, cardH, settings, cardH < 190);
    });
  }

  ctx.restore();

  // Keep a dedicated footer band below the timetable so the quote can never overlap an exam card.
  ctx.strokeStyle = c.border;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(margin, footerTop);
  ctx.lineTo(W - margin, footerTop);
  ctx.stroke();
  ctx.save();
  const isArabicFooter = /[\u0600-\u06FF]/.test(footer);
  ctx.font = "italic 600 19px " + (isArabicFooter ? "Arial" : "Georgia");
  ctx.fillStyle = c.secondaryText;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.direction = isArabicFooter ? "rtl" : "ltr";
  ctx.fillText(footer, W / 2, footerTop + 46, contentW);
  ctx.restore();
}

export default function TimetableCanvas({
  exams, settings, title, subtitle, footer, canvasRef
}: Props) {
  const internalRef = useRef<HTMLCanvasElement>(null);
  const ref = canvasRef || internalRef;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    renderCanvas(canvas, exams, settings, title, subtitle, footer);
  }, [exams, settings, title, subtitle, footer, ref]);

  return (
    <canvas
      ref={ref}
      aria-label="Live preview of your personalized midterm exam timetable"
      className="block h-auto w-full rounded-xl shadow-sm"
      style={{ maxHeight: "72vh", objectFit: "contain", background: settings.colors.background }}
    />
  );
}