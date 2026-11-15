// Synthetic ASCII PDF builder for tests. No external file, Python, font or CDN.
export function syntheticPdf(pages: readonly string[]): Uint8Array {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pages.map((_page, index) => `${4 + index * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  for (const text of pages) {
    if (/[^\x20-\x7e\n]/.test(text)) throw new Error('Fixture text must be synthetic ASCII.');
    const content = `BT /F1 12 Tf 50 740 Td ${text.split('\n').map((line, index) => `${index ? '0 -18 Td ' : ''}(${line.replace(/[\\()]/g, '\\$&')}) Tj`).join(' ')} ET`;
    const id = objects.length + 1;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${id + 1} 0 R >>`);
    objects.push(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);
  }
  let source = '%PDF-1.7\n';
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(source)); source += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(source);
  source += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Uint8Array.from(Buffer.from(source));
}
