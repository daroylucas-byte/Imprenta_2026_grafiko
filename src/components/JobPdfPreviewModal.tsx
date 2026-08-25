import React, { useEffect, useMemo } from 'react';
import { jsPDF } from 'jspdf';

interface JobPdfPreviewModalProps {
  doc: jsPDF;
  fileName: string;
  onClose: () => void;
}

const JobPdfPreviewModal: React.FC<JobPdfPreviewModalProps> = ({ doc, fileName, onClose }) => {
  const blobUrl = useMemo(() => doc.output('bloburl') as unknown as string, [doc]);

  useEffect(() => {
    return () => URL.revokeObjectURL(blobUrl);
  }, [blobUrl]);

  const handleDownload = () => {
    doc.save(fileName);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-3xl max-h-[90vh] rounded-[2.5rem] shadow-2xl border border-white/20 flex flex-col overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-12 duration-500">
        {/* Header */}
        <div className="px-6 md:px-8 py-5 border-b border-outline-variant/10 flex justify-between items-center bg-surface-container-low/30">
          <div>
            <h3 className="text-xl font-headline font-extrabold text-on-surface tracking-tight">Vista previa del presupuesto</h3>
            <p className="text-[10px] text-on-surface-variant font-bold uppercase tracking-widest mt-1">Revisá antes de descargar</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-error/10 text-on-surface-variant hover:text-error rounded-full transition-colors transition-transform active:scale-90">
            <span className="material-symbols-outlined text-2xl">close</span>
          </button>
        </div>

        {/* Preview */}
        <div className="flex-1 bg-surface-container-low/40 min-h-[60vh]">
          <iframe src={blobUrl} title="Vista previa PDF" className="w-full h-full min-h-[60vh]" />
        </div>

        {/* Actions */}
        <div className="px-6 md:px-8 py-5 border-t border-outline-variant/10 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-2xl text-sm font-bold text-on-surface-variant hover:bg-surface-container-low transition-colors"
          >
            Cerrar sin descargar
          </button>
          <button
            onClick={handleDownload}
            className="px-6 py-2.5 rounded-2xl text-sm font-bold bg-primary text-white shadow-lg shadow-primary/20 hover:brightness-110 active:scale-95 transition-all flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-lg">download</span>
            Descargar PDF
          </button>
        </div>
      </div>
    </div>
  );
};

export default JobPdfPreviewModal;
