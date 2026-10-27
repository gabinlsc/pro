// Génération d'un fichier iCalendar (RFC 5545) : échappement, repliement des lignes à 75 octets, fins de ligne CRLF, fuseau Europe/Paris, rappels VALARM.
const encoder = new TextEncoder();

export const echapper = (t) => String(t).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n');

/** Replie une ligne : 75 octets au plus par ligne, les suites commencent par une espace ; ne coupe jamais un caractère UTF-8. */
export function replier(ligne) {
  if (encoder.encode(ligne).length <= 75) return ligne;
  const sortie = []; let courant = '', octets = 0, limite = 75;
  for (const c of ligne) {
    const n = encoder.encode(c).length;
    if (octets + n > limite) { sortie.push(courant); courant = ''; octets = 0; limite = 74; }
    courant += c; octets += n;
  }
  sortie.push(courant);
  return sortie.join('\r\n ');
}

/** Empreinte stable (cyrb53) : même événement, même identifiant, à chaque génération. */
export function empreinte(texte) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < texte.length; i++) { const c = texte.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

const VTIMEZONE = ['BEGIN:VTIMEZONE', 'TZID:Europe/Paris', 'X-LIC-LOCATION:Europe/Paris',
  'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:CEST', 'DTSTART:19700329T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT',
  'BEGIN:STANDARD', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'TZNAME:CET', 'DTSTART:19701025T030000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD', 'END:VTIMEZONE'];

const compact = (iso) => iso.replace(/-/g, '');
const lendemain = (iso) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };
/** Rappel à 9 h, `jours` jours avant l'événement (journée entière, qui commence à minuit) : J-1 → -PT15H, J-7 → -P6DT15H. */
export const declencheur = (jours) => (jours <= 0 ? 'PT0S' : jours === 1 ? '-PT15H' : `-P${jours - 1}DT15H`);

/** evenements : [{ cle, date, titre, description, categorie }] ; rappels : nombres de jours (7, 1, 0). dtstamp : « AAAAMMJJTHHMMSSZ ». */
export function construireIcs({ nom, description, evenements, dtstamp, domaine, rappels = [7, 1], url }) {
  const l = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Compta by glsc//Echeances micro-entrepreneur//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${echapper(nom)}`, `X-WR-CALDESC:${echapper(description)}`, 'X-WR-TIMEZONE:Europe/Paris', 'REFRESH-INTERVAL;VALUE=DURATION:P1D', 'X-PUBLISHED-TTL:P1D', ...VTIMEZONE];
  for (const ev of evenements) {
    l.push('BEGIN:VEVENT', `UID:${empreinte(ev.cle + '|' + ev.date)}@${domaine}`, `DTSTAMP:${dtstamp}`, `DTSTART;VALUE=DATE:${compact(ev.date)}`, `DTEND;VALUE=DATE:${compact(lendemain(ev.date))}`,
      `SUMMARY:${echapper(ev.titre)}`, `DESCRIPTION:${echapper(ev.description)}`, `CATEGORIES:${echapper(ev.categorie)}`, 'TRANSP:TRANSPARENT', 'STATUS:CONFIRMED', 'SEQUENCE:0');
    if (url) l.push(`URL:${url}`);
    for (const j of rappels) l.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${echapper(j === 0 ? 'Aujourd’hui : ' + ev.titre : `Dans ${j} jour${j > 1 ? 's' : ''} : ${ev.titre}`)}`, `TRIGGER:${declencheur(j)}`, 'END:VALARM');
    l.push('END:VEVENT');
  }
  l.push('END:VCALENDAR');
  return l.map(replier).join('\r\n') + '\r\n';
}
