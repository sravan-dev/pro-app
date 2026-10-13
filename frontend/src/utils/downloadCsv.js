// Build a CSV from a header row plus data rows and download it in the browser.
// Values can come from public forms, so anything a spreadsheet would run as a
// formula gets a leading ' — plain phone numbers like +91 98765 43210 are left alone.
const cell = (v) => {
  let s = String(v ?? '');
  if (/^[=@\t\r]/.test(s) || (/^[+-]/.test(s) && !/^[+-][\d\s()-]*$/.test(s))) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};

export default function downloadCsv(filename, header, rows) {
  const lines = [header, ...rows].map((r) => r.map(cell).join(','));
  // The BOM makes Excel read the file as UTF-8.
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const today = () => new Date().toISOString().slice(0, 10);
