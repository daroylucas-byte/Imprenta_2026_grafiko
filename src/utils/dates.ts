// Fechas de negocio en hora argentina.
//
// Dos trampas que este archivo evita:
//  1. `new Date().toISOString().split('T')[0]` devuelve la fecha en UTC: después de las 21 hs
//     (UTC-3) da el día SIGUIENTE.
//  2. `new Date('2026-09-25')` interpreta un string "solo fecha" como medianoche UTC, que en
//     Argentina es el 24/09 a las 21 hs: mostrarlo con toLocaleDateString() da un día MENOS.
// Las columnas `date` de Postgres llegan como 'YYYY-MM-DD' y hay que tratarlas como fecha de
// calendario, sin pasar por zonas horarias. Las columnas `timestamptz` sí son instantes.

const TZ = 'America/Argentina/Buenos_Aires';
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Hoy en Argentina como 'YYYY-MM-DD' (para columnas `date`). */
export const todayAR = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());

/** Formatea un Date local como 'YYYY-MM-DD' (sin pasar por UTC). */
export const toDateString = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Convierte 'YYYY-MM-DD' a un Date a medianoche LOCAL (mismo día de calendario). Otros strings se parsean normal. */
export const parseDateOnly = (s: string): Date =>
  DATE_ONLY.test(s) ? new Date(`${s}T00:00:00`) : new Date(s);

/** 'DD/MM/AAAA' para mostrar. Acepta 'YYYY-MM-DD' (sin corrimiento) o un timestamp (hora argentina). */
export const formatDateAR = (s: string | null | undefined): string => {
  if (!s) return '';
  if (DATE_ONLY.test(s)) {
    const [y, m, d] = s.split('-');
    return `${d}/${m}/${y}`;
  }
  const date = new Date(s);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString('es-AR', { timeZone: TZ });
};
