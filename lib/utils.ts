import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Automatically fixes RTL PDF extraction scrambling and known OCR typos
export const formatInstructorName = (rawName?: string) => {
  if (!rawName || rawName === "TBA") return "TBA";

  // If it's English, return it untouched
  const isArabic = /[\u0600-\u06FF]/.test(rawName);
  if (!isArabic) return rawName;

  // 1. Fix known PDF internal letter scrambling
  let text = rawName
    .replace(/يارس/g, 'ياسر')
    .replace(/امي(?=\s|$)/g, 'أمين')
    .replace(/أمان(?=\s|$)/g, 'أماني')
    .replace(/العرن/g, 'العرابي')
    .replace(/يشي/g, 'ماري')
    .replace(/معت/g, 'معتز')
    .replace(/نص /g, 'نصر ')
    .replace(/عشر/g, 'عشري')
    .replace(/مصطف/g, 'مصطفى')
    .replace(/جيالن/g, 'جيلان');

  // 2. Safely detect Arabic titles anywhere in the string
  const hasDr = /(^|\s)د(\s|$)/.test(text) || text.includes('/ د') || text.includes('د.');
  const hasEng = /(^|\s)م(\s|$)/.test(text) || text.includes('/ م') || text.includes('م.');

  // 3. Strip all isolated title letters and punctuation
  let cleaned = text
    .replace(/(^|\s)د(\s|$)/g, ' ')
    .replace(/(^|\s)م(\s|$)/g, ' ')
    .replace(/[\/\.\-]/g, ' ')
    .trim();

  // 4. Split words and REVERSE them back to correct Right-to-Left order
  const words = cleaned.split(/\s+/).filter(w => w.length > 0);
  words.reverse();

  // 5. Reattach the correct title at the front
  let prefix = "";
  if (hasDr) prefix = "د. ";
  else if (hasEng) prefix = "م. ";

  return `${prefix}${words.join(' ')}`;
};