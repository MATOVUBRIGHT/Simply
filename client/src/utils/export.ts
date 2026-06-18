function sanitizeSpreadsheetCell(value: string) {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

function escapeCsvValue(value: string) {
  const sanitized = sanitizeSpreadsheetCell(value).replace(/"/g, '""');
  return /[",\n]/.test(sanitized) ? `"${sanitized}"` : sanitized;
}

export function exportToCSV<T>(data: T[], filename: string, columns: { key: keyof T; label: string }[]) {
  const headers = columns.map(c => escapeCsvValue(c.label)).join(',');
  const rows = data.map(item => 
    columns.map(c => {
      const value = item[c.key];
      const stringValue = value === null || value === undefined ? '' : String(value);
      return escapeCsvValue(stringValue);
    }).join(',')
  );
  
  const csv = [headers, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${filename}-${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

export function parseCSV<T>(csv: string, columns: { key: keyof T; label: string }[]): T[] {
  const lines = csv.split('\n').filter(line => line.trim());
  if (lines.length < 2) return [];
  
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const data: T[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const item: any = {};
    
    columns.forEach((col, index) => {
      if (headers[index]) {
        item[col.key] = values[index] || '';
      }
    });
    
    data.push(item as T);
  }
  
  return data;
}

type PdfBranding = {
  schoolName?: string;
  schoolAddress?: string;
  schoolPhone?: string;
  schoolEmail?: string;
  schoolLogo?: string;
  headerColor?: string;
  textColor?: string;
  accentColor?: string;
  watermarkLogo?: boolean;
  preparedLabel?: string;
};

type StudentAlbumRow = {
  firstName?: string;
  lastName?: string;
  studentId?: string;
  admissionNo?: string;
  className?: string;
  classId?: string;
  photoUrl?: string | null;
};

function hexToRgb(hex: string | undefined, fallback: [number, number, number]): [number, number, number] {
  const clean = String(hex || '').trim().replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(clean)) return fallback;
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

function canUsePdfImage(value: unknown) {
  const text = String(value || '').trim();
  return text.startsWith('data:image/') || /^https?:\/\//i.test(text);
}

function getImageFormat(value: string) {
  return value.startsWith('data:image/jpeg') || value.startsWith('data:image/jpg') ? 'JPEG' : 'PNG';
}

async function imageToDataUrl(src: string): Promise<string | null> {
  if (!canUsePdfImage(src)) return null;
  if (src.startsWith('data:image/')) return src;

  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth || image.width;
        canvas.height = image.naturalHeight || image.height;
        const context = canvas.getContext('2d');
        if (!context) {
          resolve(null);
          return;
        }
        context.drawImage(image, 0, 0);
        resolve(canvas.toDataURL('image/jpeg', 0.86));
      } catch {
        resolve(null);
      }
    };
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

export async function exportToPDF(title: string, data: any[], columns: { key: string; label: string }[], filename: string, branding: PdfBranding = {}) {
  const [{ jsPDF }, autoTableModule] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const autoTable = (autoTableModule as any).default || (autoTableModule as any).autoTable;
  const doc = new jsPDF({ orientation: columns.length > 6 ? 'landscape' : 'portrait' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const headerColor = hexToRgb(branding.headerColor, [59, 130, 246]);
  const textColor = hexToRgb(branding.textColor, [15, 23, 42]);
  const accentColor = hexToRgb(branding.accentColor, headerColor);
  const today = new Date().toLocaleDateString();
  let startY = 34;

  if (branding.watermarkLogo && canUsePdfImage(branding.schoolLogo)) {
    try {
      (doc as any).setGState(new (doc as any).GState({ opacity: 0.06 }));
      doc.addImage(String(branding.schoolLogo), 'PNG', pageWidth / 2 - 45, pageHeight / 2 - 45, 90, 90);
      (doc as any).setGState(new (doc as any).GState({ opacity: 1 }));
    } catch {
      // Ignore image format/CORS failures; the report content should still export.
    }
  }

  if (canUsePdfImage(branding.schoolLogo)) {
    try {
      doc.addImage(String(branding.schoolLogo), 'PNG', 12, 10, 18, 18);
    } catch {
      // Ignore image format/CORS failures.
    }
  }

  doc.setTextColor(...textColor);
  doc.setFontSize(16);
  doc.text(branding.schoolName || title, pageWidth / 2, 15, { align: 'center' });

  const details = [
    branding.schoolAddress,
    branding.schoolPhone ? `Tel: ${branding.schoolPhone}` : '',
    branding.schoolEmail ? `Email: ${branding.schoolEmail}` : '',
  ].filter(Boolean).join('   ');
  if (details) {
    doc.setFontSize(8);
    doc.text(details, pageWidth / 2, 21, { align: 'center' });
  }
  doc.setFontSize(11);
  doc.setTextColor(...accentColor);
  doc.text(title, pageWidth / 2, details ? 28 : 24, { align: 'center' });
  doc.setFontSize(8);
  doc.setTextColor(...textColor);
  doc.text(`${branding.preparedLabel || 'Date'}: ${today}`, pageWidth - 10, details ? 28 : 24, { align: 'right' });

  const tableData = data.map(row => columns.map(col => {
    const value = row[col.key];
    return value === null || value === undefined ? '' : String(value);
  }));

  autoTable(doc, {
    head: [columns.map(c => c.label)],
    body: tableData,
    startY,
    styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak', textColor },
    headStyles: { fillColor: headerColor, textColor: 255 },
    margin: { left: 10, right: 10 },
    didDrawPage: () => {
      const pageCount = doc.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(...textColor);
      doc.text(`Page ${doc.getCurrentPageInfo().pageNumber} of ${pageCount}`, pageWidth - 10, pageHeight - 8, { align: 'right' });
    },
  });

  doc.save(`${filename}-${new Date().toISOString().split('T')[0]}.pdf`);
}

export async function exportStudentAlbumToPDF(title: string, students: StudentAlbumRow[], filename: string, branding: PdfBranding = {}) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const headerColor = hexToRgb(branding.headerColor, [37, 99, 235]);
  const textColor = hexToRgb(branding.textColor, [15, 23, 42]);
  const accentColor = hexToRgb(branding.accentColor, headerColor);
  const margin = 12;
  const gap = 7;
  const columns = 3;
  const cardWidth = (pageWidth - margin * 2 - gap * (columns - 1)) / columns;
  const cardHeight = 55;
  const photoSize = 31;
  const startY = 34;
  let x = margin;
  let y = startY;

  const drawHeader = () => {
    if (canUsePdfImage(branding.schoolLogo)) {
      try {
        doc.addImage(String(branding.schoolLogo), getImageFormat(String(branding.schoolLogo)), margin, 9, 16, 16);
      } catch {
        // Continue without the logo when the image format cannot be embedded.
      }
    }
    doc.setTextColor(...textColor);
    doc.setFontSize(15);
    doc.text(branding.schoolName || 'School Album', pageWidth / 2, 15, { align: 'center' });
    doc.setFontSize(10);
    doc.setTextColor(...accentColor);
    doc.text(title, pageWidth / 2, 22, { align: 'center' });
    doc.setFontSize(8);
    doc.setTextColor(...textColor);
    doc.text(`Date: ${new Date().toLocaleDateString()}`, pageWidth - margin, 22, { align: 'right' });
  };

  const drawFooter = () => {
    doc.setFontSize(8);
    doc.setTextColor(...textColor);
    doc.text(`Page ${doc.getCurrentPageInfo().pageNumber}`, pageWidth - margin, pageHeight - 7, { align: 'right' });
  };

  drawHeader();

  for (let index = 0; index < students.length; index += 1) {
    const student = students[index];
    if (y + cardHeight > pageHeight - 14) {
      drawFooter();
      doc.addPage();
      drawHeader();
      x = margin;
      y = startY;
    }

    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(x, y, cardWidth, cardHeight, 2, 2, 'FD');

    const photoX = x + (cardWidth - photoSize) / 2;
    const photoY = y + 5;
    const photoData = student.photoUrl ? await imageToDataUrl(student.photoUrl) : null;
    if (photoData) {
      try {
        doc.addImage(photoData, getImageFormat(photoData), photoX, photoY, photoSize, photoSize);
      } catch {
        doc.setFillColor(...headerColor);
        doc.rect(photoX, photoY, photoSize, photoSize, 'F');
      }
    } else {
      doc.setFillColor(...headerColor);
      doc.rect(photoX, photoY, photoSize, photoSize, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(14);
      const initials = `${student.firstName?.[0] || ''}${student.lastName?.[0] || ''}`.trim() || '?';
      doc.text(initials.toUpperCase(), photoX + photoSize / 2, photoY + photoSize / 2 + 4, { align: 'center' });
    }

    const name = `${student.firstName || ''} ${student.lastName || ''}`.trim() || 'Unnamed student';
    doc.setTextColor(...textColor);
    doc.setFontSize(8);
    doc.text(name, x + cardWidth / 2, y + 42, { align: 'center', maxWidth: cardWidth - 6 });
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(student.studentId || student.admissionNo || '', x + cardWidth / 2, y + 47, { align: 'center', maxWidth: cardWidth - 6 });
    doc.text(student.className || student.classId || '', x + cardWidth / 2, y + 51.5, { align: 'center', maxWidth: cardWidth - 6 });

    if ((index + 1) % columns === 0) {
      x = margin;
      y += cardHeight + gap;
    } else {
      x += cardWidth + gap;
    }
  }

  drawFooter();
  doc.save(`${filename}-${new Date().toISOString().split('T')[0]}.pdf`);
}

export function exportToExcel<T>(data: T[], filename: string, columns: { key: keyof T; label: string }[]) {
  import('xlsx').then((XLSX) => {
    const headers = columns.map(c => c.label);
    const rows = data.map(item =>
      columns.map(c => {
        const value = item[c.key];
        return value === null || value === undefined ? '' : String(value);
      })
    );
    
    const wsData = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    XLSX.writeFile(wb, `${filename}-${new Date().toISOString().split('T')[0]}.xlsx`);
  });
}
