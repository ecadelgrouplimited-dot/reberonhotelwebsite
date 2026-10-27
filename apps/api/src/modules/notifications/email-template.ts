export interface EmailContent {
  to: string;
  subject: string;
  heading: string;
  paragraphs: string[];
  facts?: [string, string][];
  action?: { label: string; url: string };
  footnote?: string;
  replyTo?: string;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Table-based HTML that looks like a hotel in every mail client, plus a plain-text twin. */
export function renderEmail(c: EmailContent, hotelName = 'Reberon Hotel') {
  const facts = c.facts?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;border-top:1px solid #CFCBC0">${c.facts
        .map(([k, v]) => `<tr><td style="padding:10px 0;border-bottom:1px solid #E7E2D6;color:#8A867B;font-size:13px;width:38%">${esc(k)}</td><td style="padding:10px 0;border-bottom:1px solid #E7E2D6;color:#121513;font-size:15px">${esc(v)}</td></tr>`)
        .join('')}</table>`
    : '';
  const action = c.action
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0"><tr><td style="background:#9E2A2B;border-radius:999px"><a href="${esc(c.action.url)}" style="display:inline-block;padding:14px 26px;color:#FFFFFF;font-weight:600;text-decoration:none;font-size:15px">${esc(c.action.label)}</a></td></tr></table>`
    : '';
  const html = `<!doctype html><html><body style="margin:0;background:#F4F5F1;font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F5F1;padding:32px 12px"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:18px;overflow:hidden">
      <tr><td style="background:#1E2B24;padding:28px 32px;color:#F4F5F1">
        <div style="font-family:Georgia,'Times New Roman',serif;font-size:22px;letter-spacing:.5px">${esc(hotelName)}</div>
        <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#E0A54B;margin-top:6px">Kapchorwa · Mount Elgon</div>
      </td></tr>
      <tr><td style="padding:32px">
        <h1 style="font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:26px;line-height:1.25;color:#121513;margin:0 0 18px">${esc(c.heading)}</h1>
        ${c.paragraphs.map((p) => `<p style="font-size:15px;line-height:1.65;color:#262B27;margin:0 0 14px">${esc(p)}</p>`).join('')}
        ${facts}${action}
        ${c.footnote ? `<p style="font-size:13px;line-height:1.6;color:#8A867B;margin:18px 0 0">${esc(c.footnote)}</p>` : ''}
      </td></tr>
      <tr><td style="padding:20px 32px;background:#F6F1E7;color:#8A867B;font-size:12px;line-height:1.6">${esc(hotelName)} · Kapchorwa, Uganda · reberonhotel.com</td></tr>
    </table>
  </td></tr></table></body></html>`;
  const text = [
    c.heading,
    '',
    ...c.paragraphs,
    ...(c.facts?.length ? ['', ...c.facts.map(([k, v]) => `${k}: ${v}`)] : []),
    ...(c.action ? ['', `${c.action.label}: ${c.action.url}`] : []),
    ...(c.footnote ? ['', c.footnote] : []),
    '',
    `— ${hotelName}, Kapchorwa`,
  ].join('\n');
  return { html, text };
}
