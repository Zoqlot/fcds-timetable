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
  const courseFont = 27;
  const timeFont = 21;
  const align = settings.textAlign as CanvasTextAlign;
  const textX = align === "center" ? (left + right) / 2 : align === "right" ? right : left;

  if (condensedDate) {
    const dateLabel = dayLabel(exam.date, { weekday: "long" }).toUpperCase() + " · " +
      dayLabel(exam.date, { month: "short", day: "numeric" }).toUpperCase();
    cursorY += drawText(ctx, dateLabel, textX, cursorY, available,
      "700 21px " + settings.fontFamily, c.date, align, 1) + 2;
  } else {
    cursorY += drawText(ctx, dayLabel(exam.date, { weekday: "long" }).toUpperCase(), textX, cursorY,
      available, "700 21px " + settings.fontFamily, c.date, align, 1) + 3;
    cursorY += drawText(ctx, dayLabel(exam.date, { month: "long", day: "numeric" }).toUpperCase(), textX, cursorY,
      available, "700 21px " + settings.fontFamily, c.date, align, 1) + (compact ? 5 : 9);
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
  } else if (settings.template === "calendar-grid") {
    drawDayCells(true);
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