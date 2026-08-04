import { jsPDF } from 'jspdf';

let cachedLogo: string | null = null;

export const getLogoBase64 = async (): Promise<string> => {
  if (cachedLogo) return cachedLogo;
  const response = await fetch('/logo-grafiko.jpeg');
  const blob = await response.blob();
  cachedLogo = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
  return cachedLogo;
};

export const drawPdfLogoHeader = (doc: jsPDF, logoBase64: string) => {
  doc.setFillColor(30, 41, 59); // Slate-800
  doc.rect(0, 0, 210, 40, 'F');

  // Tarjeta blanca detrás del logo (el JPEG trae fondo blanco sólido)
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(12, 6, 46, 26, 3, 3, 'F');
  doc.addImage(logoBase64, 'JPEG', 14, 8, 42, 21.9);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Sistema de Gestión de Imprenta', 15, 37);
};

export const drawPdfContactFooter = (doc: jsPDF, y: number = 288) => {
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(120, 120, 120);
  doc.text(
    'grafikoimprenta@gmail.com  •  Tel: (03541) 425595  •  WhatsApp: (3541) 622800',
    105,
    y,
    { align: 'center' }
  );
  doc.text(
    'C. Pellegrini 206 • 5152 • Villa Carlos Paz • Córdoba • Argentina',
    105,
    y + 5,
    { align: 'center' }
  );
};
