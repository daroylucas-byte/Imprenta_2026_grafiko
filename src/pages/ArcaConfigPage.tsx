import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { toast } from 'react-hot-toast';

interface FacturaArca {
  id: string;
  local_id: string;
  venta_id: string;
  tipo_comprobante: string;
  punto_venta: number | null;
  numero_comprobante: number | null;
  receptor_tipo_doc: string | null;
  receptor_cuit_dni: string | null;
  receptor_razon_social: string | null;
  receptor_iva_cond: string | null;
  concepto: string | null;
  neto_gravado: number | null;
  iva_alicuota: number | null;
  iva_monto: number | null;
  total: number | null;
  estado: 'pendiente' | 'aprobada' | 'rechazada';
  cae: string | null;
  cae_vencimiento: string | null;
  error_mensaje: string | null;
  created_at: string;
}

const ArcaConfigPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Existing configuration state
  const [existingServicios, setExistingServicios] = useState<any>({});
  
  // Form Field States
  const [cuit, setCuit] = useState('');
  const [puntoVenta, setPuntoVenta] = useState<string>('');
  const [condicionIva, setCondicionIva] = useState<'monotributista' | 'responsable_inscripto' | 'exento'>('monotributista');
  const [modo, setModo] = useState<'homologacion' | 'produccion'>('homologacion');
  const [certificadoCrt, setCertificadoCrt] = useState('');
  const [clavePrivadaKey, setClavePrivadaKey] = useState('');
  
  // Key state tracking
  const [hasSavedKey, setHasSavedKey] = useState(false);

  // Billing History States
  const [facturas, setFacturas] = useState<FacturaArca[]>([]);
  const [loadingFacturas, setLoadingFacturas] = useState(true);

  // Fetch ARCA Config & History
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('configuracion')
        .select('*')
        .eq('id', 1)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setExistingServicios(data.servicios || {});
        
        const arcaPrincipal = data.servicios?.arca?.principal;
        if (arcaPrincipal) {
          setCuit(arcaPrincipal.cuit || '');
          setPuntoVenta(arcaPrincipal.punto_venta !== undefined ? String(arcaPrincipal.punto_venta) : '');
          setCondicionIva(arcaPrincipal.condicion_iva || 'monotributista');
          setModo(arcaPrincipal.modo || 'homologacion');
          setCertificadoCrt(arcaPrincipal.certificado_crt || '');
          
          if (arcaPrincipal.clave_privada_key) {
            setHasSavedKey(true);
            setClavePrivadaKey(''); // Do not display raw key in browser for security
          }
        }
      }
    } catch (err: any) {
      console.error('Error fetching ARCA configuration:', err);
      toast.error('Error al cargar la configuración: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchFacturasHistory = useCallback(async () => {
    setLoadingFacturas(true);
    try {
      const { data, error } = await supabase
        .from('facturas_arca')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setFacturas(data || []);
    } catch (err: any) {
      console.error('Error fetching AFIP billing history:', err);
    } finally {
      setLoadingFacturas(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    fetchFacturasHistory();
  }, [fetchData, fetchFacturasHistory]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 1. Basic validation
    const digitsOnlyCuit = cuit.replace(/\D/g, '');
    if (digitsOnlyCuit.length !== 11) {
      toast.error('El CUIT debe tener exactamente 11 dígitos numéricos.');
      return;
    }

    const puntoVentaNum = parseInt(puntoVenta, 10);
    if (isNaN(puntoVentaNum) || puntoVentaNum <= 0) {
      toast.error('El Punto de Venta debe ser un número entero positivo.');
      return;
    }

    if (!certificadoCrt.trim()) {
      toast.error('El Certificado (.crt) es requerido.');
      return;
    }

    const finalKey = clavePrivadaKey.trim();
    if (!hasSavedKey && !finalKey) {
      toast.error('La Clave Privada (.key) es requerida.');
      return;
    }

    setSaving(true);
    try {
      // 2. Prepare the new arca principal object
      const keyToSave = finalKey || (hasSavedKey ? existingServicios?.arca?.principal?.clave_privada_key : '');

      const newPrincipal = {
        cuit: digitsOnlyCuit,
        punto_venta: puntoVentaNum,
        condicion_iva: condicionIva,
        modo: modo,
        certificado_crt: certificadoCrt.trim(),
        clave_privada_key: keyToSave
      };

      // Merge into services JSONB
      const updatedServicios = {
        ...existingServicios,
        arca: {
          ...existingServicios?.arca,
          principal: newPrincipal
        }
      };

      // 3. Upsert configuration at ID=1
      const { error } = await supabase
        .from('configuracion')
        .upsert({
          id: 1,
          servicios: updatedServicios,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;

      toast.success('Configuración fiscal guardada correctamente');
      
      // Update local states
      setExistingServicios(updatedServicios);
      if (keyToSave) {
        setHasSavedKey(true);
        setClavePrivadaKey(''); // Clear raw key input to display masked placeholder
      }
    } catch (err: any) {
      console.error('Error saving ARCA configuration:', err);
      toast.error('Error al guardar configuración: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Certificate formatting warnings
  const showCertWarning = certificadoCrt.trim() !== '' && !certificadoCrt.trim().startsWith('-----BEGIN CERTIFICATE-----');
  const showCsrWarning = certificadoCrt.trim().startsWith('-----BEGIN CERTIFICATE REQUEST-----');

  // Key formatting warning
  const showKeyWarning = clavePrivadaKey.trim() !== '' && !clavePrivadaKey.trim().startsWith('-----BEGIN PRIVATE KEY-----');

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
      {/* Back Link & Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <Link 
            to="/configuracion" 
            className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-700 uppercase tracking-widest mb-2 transition-colors"
          >
            <span className="material-symbols-outlined text-sm font-black">arrow_back</span>
            Volver a Configuración
          </Link>
          <h1 className="text-3xl font-headline font-extrabold text-on-surface tracking-tight flex items-center gap-3">
            <span className="material-symbols-outlined text-3xl text-blue-600">receipt_long</span>
            Configuración Facturación Electrónica ARCA (AFIP)
          </h1>
          <p className="text-xs text-outline font-bold uppercase tracking-wider">
            Establece las credenciales fiscales y el certificado para emitir comprobantes oficiales
          </p>
        </div>
      </div>

      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center space-y-4 text-blue-300">
          <div className="w-10 h-10 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin"></div>
          <p className="text-[10px] font-black uppercase tracking-widest animate-pulse">Cargando datos...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Form Panel */}
          <div className="lg:col-span-2 bg-surface-container-lowest p-8 md:p-10 rounded-[2rem] border border-outline-variant/10 shadow-sm space-y-8">
            <div>
              <h2 className="text-xl font-headline font-extrabold text-on-surface tracking-tight">Parámetros de Conexión</h2>
              <p className="text-[10px] text-outline font-bold uppercase tracking-wider mt-0.5">Credenciales y certificados para firma digital</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* CUIT */}
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1 block">CUIT del Emisor</label>
                  <input
                    type="text"
                    required
                    value={cuit}
                    onChange={(e) => setCuit(e.target.value)}
                    placeholder="20XXXXXXXXX"
                    className="w-full bg-surface-container-low border-none rounded-2xl py-3.5 px-6 text-sm font-bold focus:ring-2 focus:ring-blue-600/20 transition-all shadow-inner placeholder:text-outline/30"
                  />
                  <p className="text-[9px] text-outline font-bold ml-1">Solo los 11 dígitos, sin guiones ni espacios.</p>
                </div>

                {/* Punto de Venta */}
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1 block">Punto de Venta</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    required
                    value={puntoVenta}
                    onChange={(e) => setPuntoVenta(e.target.value)}
                    placeholder="1"
                    className="w-full bg-surface-container-low border-none rounded-2xl py-3.5 px-6 text-sm font-bold focus:ring-2 focus:ring-blue-600/20 transition-all shadow-inner placeholder:text-outline/30"
                  />
                  <p className="text-[9px] text-outline font-bold ml-1">Punto de venta habilitado para Factura Electrónica.</p>
                </div>

                {/* Condición IVA */}
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1 block">Condición frente al IVA</label>
                  <select
                    value={condicionIva}
                    onChange={(e) => setCondicionIva(e.target.value as any)}
                    className="w-full bg-surface-container-low border-none rounded-2xl py-3.5 px-6 text-sm font-bold focus:ring-2 focus:ring-blue-600/20 transition-all shadow-inner"
                  >
                    <option value="monotributista">Monotributista</option>
                    <option value="responsable_inscripto">Responsable Inscripto</option>
                    <option value="exento">Exento</option>
                  </select>
                </div>

                {/* Modo */}
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1 block">Entorno de Operación</label>
                  <select
                    value={modo}
                    onChange={(e) => setModo(e.target.value as 'homologacion' | 'produccion')}
                    className="w-full bg-surface-container-low border-none rounded-2xl py-3.5 px-6 text-sm font-bold focus:ring-2 focus:ring-blue-600/20 transition-all shadow-inner"
                  >
                    <option value="homologacion">Homologación (Pruebas)</option>
                    <option value="produccion">Producción (Real)</option>
                  </select>
                </div>
              </div>

              {/* Warning for production mode */}
              {modo === 'produccion' && (
                <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl p-5 flex items-start gap-3 animate-in slide-in-from-top-2 duration-300">
                  <span className="material-symbols-outlined text-amber-600 shrink-0 text-2xl font-black">warning</span>
                  <div className="text-xs space-y-1">
                    <p className="font-extrabold uppercase tracking-widest leading-none">⚠️ Modo Producción Activado</p>
                    <p className="font-semibold leading-normal text-amber-800">
                      En modo Producción los comprobantes emitidos son válidos ante AFIP de verdad. Asegúrate de haber probado todo en Homologación primero.
                    </p>
                  </div>
                </div>
              )}

              {/* Certificado (.crt) */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1 block">Certificado (.crt)</label>
                <textarea
                  rows={5}
                  required
                  value={certificadoCrt}
                  onChange={(e) => setCertificadoCrt(e.target.value)}
                  placeholder="Pegá acá el contenido completo de tu archivo .crt, empezando con -----BEGIN CERTIFICATE-----"
                  className="w-full bg-surface-container-low border-none rounded-2xl py-3.5 px-6 text-xs font-mono focus:ring-2 focus:ring-blue-600/20 transition-all shadow-inner placeholder:text-outline/30 resize-y"
                />
                {showCsrWarning && (
                  <p className="text-[10px] font-bold text-error ml-1 flex items-center gap-1">
                    <span className="material-symbols-outlined text-xs shrink-0 font-black">error</span>
                    Parece que pegaste un Certificate Request (.csr) en lugar del certificado firmado (.crt). AFIP debe entregarte un archivo .crt firmado.
                  </p>
                )}
                {showCertWarning && !showCsrWarning && (
                  <p className="text-[10px] font-bold text-amber-600 ml-1 flex items-center gap-1">
                    <span className="material-symbols-outlined text-xs shrink-0 font-black">warning</span>
                    El certificado no empieza con el formato estándar '-----BEGIN CERTIFICATE-----'.
                  </p>
                )}
              </div>

              {/* Clave Privada (.key) */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1 block">Clave Privada (.key)</label>
                <div className="relative">
                  <textarea
                    rows={4}
                    required={!hasSavedKey}
                    value={clavePrivadaKey}
                    onChange={(e) => setClavePrivadaKey(e.target.value)}
                    placeholder={hasSavedKey ? "•••• clave guardada, volvé a pegarla solo si querés reemplazarla" : "Pegá acá el contenido completo de tu archivo .key, empezando con -----BEGIN PRIVATE KEY-----"}
                    className="w-full bg-surface-container-low border-none rounded-2xl py-3.5 px-6 text-xs font-mono focus:ring-2 focus:ring-blue-600/20 transition-all shadow-inner placeholder:text-outline/30 resize-y"
                  />
                  {hasSavedKey && (
                    <div className="absolute right-4 bottom-4 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-xl px-3 py-1.5 text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 pointer-events-none">
                      <span className="material-symbols-outlined text-xs font-black">lock</span>
                      Guardada
                    </div>
                  )}
                </div>
                {showKeyWarning && (
                  <p className="text-[10px] font-bold text-amber-600 ml-1 flex items-center gap-1">
                    <span className="material-symbols-outlined text-xs shrink-0 font-black">warning</span>
                    La clave privada no empieza con '-----BEGIN PRIVATE KEY-----'.
                  </p>
                )}
              </div>

              {/* Submit Buttons */}
              <div className="pt-4 flex flex-col md:flex-row gap-4">
                <Link
                  to="/configuracion"
                  className="flex-1 py-4 bg-surface-container-high text-on-surface-variant font-bold rounded-2xl hover:bg-slate-200 transition-all text-center flex items-center justify-center text-xs uppercase tracking-wider"
                >
                  Cancelar
                </Link>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-[2] py-4 bg-blue-600 text-white font-bold rounded-2xl shadow-xl shadow-blue-500/20 hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2 text-xs uppercase tracking-wider disabled:opacity-50"
                >
                  {saving ? (
                    <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-sm">save</span>
                      <span>Guardar Configuración</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Right Info Sidebar */}
          <div className="space-y-6">
            <div className="bg-slate-900 text-white p-8 rounded-[2rem] shadow-xl relative overflow-hidden flex flex-col justify-between min-h-[360px] border border-white/10">
              <div className="absolute -top-12 -right-12 opacity-5 pointer-events-none">
                <span className="material-symbols-outlined text-[12rem] text-white">security</span>
              </div>

              <div className="space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center text-white">
                  <span className="material-symbols-outlined text-2xl">verified</span>
                </div>
                <div>
                  <h3 className="text-xl font-headline font-extrabold tracking-tight">Facturación Fiscal</h3>
                  <p className="text-[10px] font-black uppercase tracking-widest text-blue-300 mt-1">Servicio ARCA/AFIP</p>
                </div>
                <p className="text-xs text-slate-300 font-medium leading-relaxed">
                  Para poder emitir facturas electrónicas válidas legalmente desde el sistema, es obligatorio asociar el CUIT emisor, definir el punto de venta y cargar las claves criptográficas para la firma de los comprobantes.
                </p>
              </div>

              <div className="pt-6 border-t border-white/10 space-y-3">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-blue-300">Resumen del Proceso:</h4>
                <ul className="text-[11px] text-slate-300 space-y-2 list-none">
                  <li className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm text-blue-400">arrow_right</span>
                    Generar Clave Privada y CSR
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm text-blue-400">arrow_right</span>
                    Obtener certificado (.crt) en AFIP
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm text-blue-400">arrow_right</span>
                    Cargar datos y guardar configuración
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm text-blue-400">arrow_right</span>
                    Delegar servicios y probar conexión
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* History section */}
      <div className="bg-surface-container-lowest rounded-[2rem] shadow-sm border border-outline-variant/10 overflow-hidden">
        <div className="p-8 border-b border-outline-variant/10">
          <h3 className="text-xl font-headline font-extrabold text-on-surface tracking-tight">Historial de Comprobantes ARCA</h3>
          <p className="text-[10px] text-outline font-bold uppercase tracking-wider mt-0.5">Últimos 20 comprobantes procesados</p>
        </div>

        {loadingFacturas ? (
          <div className="py-20 flex flex-col items-center justify-center space-y-4 text-blue-300">
            <div className="w-10 h-10 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin"></div>
            <p className="text-[10px] font-black uppercase tracking-widest animate-pulse">Cargando historial...</p>
          </div>
        ) : facturas.length === 0 ? (
          <div className="py-20 text-center text-outline/40 flex flex-col items-center justify-center space-y-4">
            <span className="material-symbols-outlined text-5xl">receipt_long</span>
            <p className="font-bold text-xs uppercase tracking-widest">No hay comprobantes emitidos en el historial</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-container-low border-b border-outline-variant/10">
                  <th className="p-5 text-[10px] font-black text-outline uppercase tracking-wider">Fecha / Hora</th>
                  <th className="p-5 text-[10px] font-black text-outline uppercase tracking-wider">Comprobante</th>
                  <th className="p-5 text-[10px] font-black text-outline uppercase tracking-wider">Receptor</th>
                  <th className="p-5 text-[10px] font-black text-outline uppercase tracking-wider">Monto Total</th>
                  <th className="p-5 text-[10px] font-black text-outline uppercase tracking-wider">Estado</th>
                  <th className="p-5 text-[10px] font-black text-outline uppercase tracking-wider">CAE / Venc.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10">
                {facturas.map((factura) => {
                  const hasError = factura.estado === 'rechazada' && factura.error_mensaje;
                  return (
                    <React.Fragment key={factura.id}>
                      <tr className="hover:bg-surface-container-low/30 transition-colors">
                        <td className="p-5 text-xs font-bold text-on-surface-variant">
                          {new Date(factura.created_at).toLocaleString('es-AR')}
                        </td>
                        <td className="p-5">
                          <div className="text-xs font-black text-on-surface uppercase">
                            {factura.tipo_comprobante.replace(/_/g, ' ')}
                          </div>
                          <div className="text-[10px] font-bold text-outline">
                            PV {String(factura.punto_venta || 0).padStart(4, '0')} - Nº {String(factura.numero_comprobante || 0).padStart(8, '0')}
                          </div>
                        </td>
                        <td className="p-5">
                          <div className="text-xs font-bold text-on-surface">
                            {factura.receptor_razon_social || 'Consumidor Final'}
                          </div>
                          <div className="text-[10px] font-bold text-outline">
                            {factura.receptor_tipo_doc || 'DNI/CUIT'}: {factura.receptor_cuit_dni}
                          </div>
                        </td>
                        <td className="p-5 text-xs font-black text-on-surface">
                          ${Number(factura.total || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="p-5">
                          <span className={`px-2.5 py-1 text-[9px] font-black uppercase rounded-lg tracking-widest border ${
                            factura.estado === 'aprobada'
                              ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                              : factura.estado === 'rechazada'
                              ? 'bg-red-50 text-error border-red-100'
                              : 'bg-amber-50 text-amber-600 border-amber-100'
                          }`}>
                            {factura.estado}
                          </span>
                        </td>
                        <td className="p-5">
                          {factura.cae ? (
                            <div className="space-y-0.5">
                              <div className="text-xs font-mono font-bold text-on-surface">{factura.cae}</div>
                              <div className="text-[9px] font-bold text-outline">
                                Vence: {factura.cae_vencimiento ? new Date(factura.cae_vencimiento).toLocaleDateString('es-AR') : 'N/A'}
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-outline italic">Sin CAE</span>
                          )}
                        </td>
                      </tr>
                      {hasError && (
                        <tr className="bg-red-50/20">
                          <td colSpan={6} className="px-8 py-3.5 border-t-0">
                            <div className="flex items-start gap-2 text-xs font-semibold text-error bg-red-50 border border-red-100 rounded-xl p-3.5">
                              <span className="material-symbols-outlined text-sm shrink-0 mt-0.5">error_outline</span>
                              <div>
                                <span className="font-extrabold uppercase text-[9px] tracking-wider block">Error AFIP:</span>
                                <span>{factura.error_mensaje}</span>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default ArcaConfigPage;
