/** Prints arbitrary HTML as a PDF via a hidden iframe instead of window.open(), so
 * it can't be blocked by the browser's popup blocker (no new window/tab is opened). */
export function printHtmlAsPdf(title: string, bodyHtml: string): boolean {
  const html = `<!doctype html><html><head><title>${title}</title>
    <style>
      body{font-family:Arial,Helvetica,sans-serif;padding:32px;color:#1f2937}
      h1{font-size:20px;margin:0 0 4px}
      p.meta{font-size:12px;color:#6b7280;margin:0 0 16px}
      table{width:100%;border-collapse:collapse;font-size:12px}
      th,td{border:1px solid #e5e7eb;padding:8px;text-align:left}
      th{background:#f3f4f6}
    </style></head><body>${bodyHtml}</body></html>`;

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(iframe);
    return false;
  }

  doc.open();
  doc.write(html);
  doc.close();

  iframe.contentWindow?.focus();
  iframe.contentWindow?.print();
  setTimeout(() => document.body.removeChild(iframe), 1000);
  return true;
}
