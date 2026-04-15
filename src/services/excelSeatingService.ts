import ExcelJS from 'exceljs';
import type { SeatObject, Student } from '@/types';

// Orijinal boyutlar
const getObjSize = (type: string) => {
  switch (type) {
    case 'tahta': return { w: 200, h: 40 };
    case 'masa': return { w: 120, h: 60 };
    case 'pc_label': return { w: 60, h: 36 }; 
    default: return { w: 70, h: 70 }; // student, empty_desk
  }
};

export const generateSeatingPlanExcel = async (
  objects: SeatObject[],
  students: Student[],
  dersAdi: string,
  sinifAdi: string
) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Oturma Düzeni');

  // Sayfa yapısı ayarları
  worksheet.pageSetup = {
    orientation: 'landscape',
    paperSize: 9, // A4
    margins: { left: 0.5, right: 0.5, top: 0.2, bottom: 0.2, header: 0.3, footer: 0.3 },
    fitToPage: true, // Daralırsa tek sayfaya sığdır
    fitToWidth: 1,
    fitToHeight: 1,
    horizontalCentered: true,
    verticalCentered: true
  };

  // Grid (Piksel -> Hücre Dönüşüm Oranı)
  const GRID_SIZE = 10; 
  
  // Koordinat sınırlarını bul
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  objects.forEach(obj => {
    const { w, h } = getObjSize(obj.type);
    minX = Math.min(minX, obj.x);
    minY = Math.min(minY, obj.y);
    maxX = Math.max(maxX, obj.x + w);
    maxY = Math.max(maxY, obj.y + h);
  });

  const totalCols = Math.ceil((maxX - minX + 100) / GRID_SIZE);
  const totalRows = Math.ceil((maxY - minY + 100) / GRID_SIZE) + 6;

  // Hücre boyutlarını kare(piksel) gibi ayarla (Yaklaşık 10px = 1 birim)
  for (let i = 1; i <= totalCols + 5; i++) {
    worksheet.getColumn(i).width = 1.3; // Excel width birimi
  }
  for (let i = 1; i <= totalRows + 10; i++) {
    worksheet.getRow(i).height = 8; // Excel height birimi (points)
  }

  // Başlıklar
  const lastColLetter = worksheet.getColumn(Math.max(totalCols, 20)).letter;
  worksheet.mergeCells('A1', `${lastColLetter}2`);
  const titleCell = worksheet.getCell('A1');
  titleCell.value = `${sinifAdi.toLocaleUpperCase('tr-TR')} SINIFI ${dersAdi.toLocaleUpperCase('tr-TR')} DERSİ OTURMA PLANI`;
  titleCell.font = { name: 'Arial', size: 14, bold: true };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

  // Tarih (Başlığın bir alt hücresi)
  worksheet.mergeCells('A3', `${lastColLetter}3`);
  const dateCell = worksheet.getCell('A3');
  dateCell.value = `${new Date().toLocaleDateString('tr-TR')}`;
  dateCell.font = { name: 'Arial', size: 10, italic: true };
  dateCell.alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.getRow(3).height = 20; // Tarih satırı yüksekliği artırıldı

  const studentMap = new Map<string, Student>();
  students.forEach(s => studentMap.set(s.id, s));

  // Her bir objeyi Excel'e yerleştir
  objects.forEach(obj => {
    const { w, h } = getObjSize(obj.type);
    
    // Pixel'i grid satır/sütuna çevir
    // x,y başlangıç (Sol Üst)
    const startCol = Math.floor((obj.x - minX) / GRID_SIZE) + 2; // Soldan 1 kolon boşluk
    const startRow = Math.floor((obj.y - minY) / GRID_SIZE) + 8; // Üstten başlık ve tarih için boşluk (Daha fazla açık)
    
    // Kaç hücre kaplayacak?
    const spanCol = Math.floor(w / GRID_SIZE) - 1;
    const spanRow = Math.floor(h / GRID_SIZE) - 1;

    const endCol = startCol + spanCol;
    const endRow = startRow + spanRow;

    // Exceljs merge string (Örn: "B5:E10")
    const startCellStr = `${worksheet.getColumn(startCol).letter}${startRow}`;
    const endCellStr = `${worksheet.getColumn(endCol).letter}${endRow}`;
    const mergeStr = `${startCellStr}:${endCellStr}`;

    try {
      worksheet.mergeCells(mergeStr);
      const cell = worksheet.getCell(startCellStr);
      
      // Standart Kutu formatı
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      
      if (obj.type === 'student' || obj.type === 'empty_desk') {
        cell.border = {
          top: { style: 'thin' }, left: { style: 'thin' },
          bottom: { style: 'thin' }, right: { style: 'thin' }
        };
        const student = obj.studentId ? studentMap.get(obj.studentId) : null;
        if (student) {
          const adSoyad = student.adSoyad.toLocaleUpperCase('tr-TR');
          cell.value = `${adSoyad}\n\n${student.no}`;
          
          cell.font = { name: 'Arial', size: 9, bold: true };
          // Sadece numarayı farklı stil yapmak ExcelJS hücresinde Text RichText ile yapılır
          cell.value = {
            richText: [
              { font: { name: 'Arial', size: 10, bold: true }, text: `${adSoyad}\n` },
              { font: { name: 'Arial', size: 8, color: { argb: 'FF444444' } }, text: student.no }
            ]
          };
        } else {
          cell.value = "BOŞ";
          cell.font = { name: 'Arial', size: 6, color: { argb: 'FF888888' } };
        }
      } 
      else if (obj.type === 'pc_label') {
        cell.border = {
          top: { style: 'dotted' }, left: { style: 'dotted' },
          bottom: { style: 'dotted' }, right: { style: 'dotted' }
        };
        cell.value = obj.pcNo;
        cell.font = { name: 'Arial', size: 8, bold: true, color: { argb: 'FF222222' } };
      }
      else if (obj.type === 'tahta') {
        cell.border = {
          top: { style: 'double' }, left: { style: 'double' },
          bottom: { style: 'double' }, right: { style: 'double' }
        };
        cell.value = "TAHTA";
        cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF555555' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } };
      }
      else if (obj.type === 'masa') {
        cell.border = {
          top: { style: 'medium' }, left: { style: 'medium' },
          bottom: { style: 'medium' }, right: { style: 'medium' }
        };
        cell.value = "ÖĞRETMEN\nMASASI";
        cell.font = { name: 'Arial', size: 8, bold: true, color: { argb: 'FF333333' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E8E8' } };
      }

    } catch (e) {
      console.warn(`Hücre birleştirme hatası (Kutular üst üste binmiş olabilir): ${mergeStr}`, e);
      // Hata olsa da kutunun ilk hücresine metni basmaya devam et (Kaybolmasın)
      const cell = worksheet.getCell(startCellStr);
      if (obj.type === 'student' && obj.studentId) {
        cell.value = studentMap.get(obj.studentId)?.adSoyad;
      }
    }
  });

  // Excel dosyasını indir
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${dersAdi.replace(/\s+/g, '_')}_Oturma_Plani.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
