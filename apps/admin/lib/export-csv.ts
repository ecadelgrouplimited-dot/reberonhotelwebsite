export function exportToCsv(filename: string, headers: string[], rows: Array<Array<string | number | boolean | null | undefined>>) {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csvContent =
    '\uFEFF' +
    [headers.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
