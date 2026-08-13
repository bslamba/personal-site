// ============================================================
// lib/tools/bundle-registry.ts
//
// Which files in a support bundle matter, what parses them, and
// which troubleshooting area each belongs to.
//
// ROTATIONS
// ISE rotates logs in several shapes:
//   ise-psc.log
//   ise-psc.log.2026-08-11-1
//   ise-psc.log.1
//   gc_app.log.20260210173144.22
//   ise-messaging.log.2026-08-11-2
//   catalina.out.1
//   something.log.gz
// Rather than a pattern per file, a path is reduced to a stem and
// the stem is looked up. One entry then covers every rotation.
// ============================================================

export type ParserRole =
  | 'prrt'        // prrt-server.log — its own comma format
  | 'localstore'  // iseLocalStore — authentication records
  | 'showtech'    // sectioned text
  | 'catalogue'   // message code -> text
  | 'alarms'      // one alarm per line
  | 'ise'         // the standard ISE log4j layout
  | 'plain'       // anything else, counted but not interpreted

export interface LogSpec {
  stem: string
  label: string
  role: ParserRole
  areas: string[]
  /**
   * High volume, low diagnostic value. ise-messaging alone is 600MB of
   * RabbitMQ chatter across ten rotations, and the only thing it tells
   * you — that publishes are failing — is already visible in
   * prrt-server.log. Skipped unless asked for, because reading it
   * roughly doubles the time to a result.
   */
  bulk?: boolean
}

// ------------------------------------------------------------
// problem areas, as Cisco groups them for debug collection
// ------------------------------------------------------------
export const AREAS = {
  LICENSING: 'Licensing',
  POSTURE: 'Posture',
  GUEST: 'Guest portal',
  DOT1X: 'dot1x / MAB',
  REPLICATION: 'Replication',
  SAML: 'SAML',
  APPSERVER: 'Application server',
  SPONSOR: 'Sponsor portal',
  BYOD: 'BYOD / onboarding',
  MDM: 'MDM',
  CERTPROV: 'Certificate provisioning',
  MYDEVICES: 'My Devices portal',
  TRUSTSEC: 'TrustSec',
  VA: 'Vulnerability assessment / TC-NAC',
  ODBC: 'ODBC identity store',
  RBAC: 'RBAC',
  PXGRID: 'pxGrid',
  REPORTS: 'Logs and reports',
  AD: 'Active Directory',
  PASSIVEID: 'PassiveID',
  REST: 'REST services',
  TACACS: 'TACACS+',
  WIFISETUP: 'Wireless setup',
  VISIBILITY: 'Context visibility',
  MESSAGING: 'RabbitMQ messaging',
  LSD: 'Light session directory',
  SSE: 'SSE connector',
  UDN: 'UDN',
  ENDPOINTSCRIPT: 'Endpoint scripts',
  LDAP: 'LDAP',
  PORTAL: 'Portals (generic)',
  POLICY: 'Policy and rule evaluation',
  PANFAILOVER: 'PAN failover',
  IPACCESS: 'IP access restriction',
  RESTSTORE: 'REST identity store',
  AUTH: 'Authentication records',
  SYSTEM: 'System',
} as const

const A = AREAS

// ------------------------------------------------------------
// the registry
// ------------------------------------------------------------
export const SPECS: LogSpec[] = [
  // --- specialised parsers ---
  { stem: 'prrt-server.log', label: 'prrt-server.log', role: 'prrt',
    areas: [A.DOT1X, A.POSTURE, A.GUEST, A.SPONSOR, A.BYOD, A.MDM, A.TRUSTSEC,
            A.ODBC, A.REPORTS, A.AD, A.PASSIVEID, A.TACACS, A.LDAP] },
  { stem: 'iselocalstore.log', label: 'iseLocalStore.log', role: 'localstore',
    areas: [A.AUTH, A.DOT1X] },
  { stem: 'showtech.out', label: 'showtech.out', role: 'showtech', areas: [A.SYSTEM] },
  { stem: 'alarmexp.txt', label: 'alarmexp.txt', role: 'alarms', areas: [A.SYSTEM] },

  // --- the big one: ise-psc.log serves most areas ---
  { stem: 'ise-psc.log', label: 'ise-psc.log', role: 'ise',
    areas: [A.LICENSING, A.POSTURE, A.DOT1X, A.REPLICATION, A.SAML, A.SPONSOR, A.BYOD,
            A.MDM, A.CERTPROV, A.MYDEVICES, A.TRUSTSEC, A.VA, A.RBAC, A.PXGRID,
            A.REPORTS, A.AD, A.REST, A.POLICY, A.PANFAILOVER, A.IPACCESS,
            A.ENDPOINTSCRIPT] },

  // --- portals ---
  { stem: 'guest.log', label: 'guest.log', role: 'ise',
    areas: [A.GUEST, A.POSTURE, A.SPONSOR, A.BYOD, A.MDM, A.CERTPROV, A.MYDEVICES, A.PORTAL] },

  // --- everything else, one line each ---
  { stem: 'profiler.log', label: 'profiler.log', role: 'ise', areas: [A.GUEST, A.BYOD, A.MYDEVICES] },
  { stem: 'prrt-management.log', label: 'prrt-management.log', role: 'ise', areas: [A.ODBC] },
  { stem: 'replication.log', label: 'replication.log', role: 'ise', areas: [A.REPLICATION] },
  { stem: 'tracking.log', label: 'tracking.log', role: 'ise', areas: [A.REPLICATION] },
  { stem: 'hibernate.log', label: 'hibernate.log', role: 'ise', areas: [A.REPLICATION] },
  { stem: 'catalina.out', label: 'catalina.out', role: 'plain', areas: [A.APPSERVER] },
  { stem: 'caservice.log', label: 'caservice.log', role: 'ise', areas: [A.CERTPROV] },
  { stem: 'sxp.log', label: 'sxp.log', role: 'ise', areas: [A.TRUSTSEC] },
  { stem: 'varuntime.log', label: 'varuntime.log', role: 'ise', areas: [A.VA] },
  { stem: 'vaaggregation.log', label: 'vaaggregation.log', role: 'ise', areas: [A.VA] },
  { stem: 'pxgrid-server.log', label: 'pxgrid-server.log', role: 'ise', areas: [A.PXGRID, A.PASSIVEID] },
  { stem: 'report.log', label: 'report.log', role: 'ise', areas: [A.REPORTS] },
  { stem: 'collector.log', label: 'collector.log', role: 'ise', areas: [A.REPORTS, A.PASSIVEID] },
  { stem: 'ad_agent.log', label: 'ad_agent.log', role: 'plain', areas: [A.AD, A.PASSIVEID] },
  { stem: 'connector.log', label: 'connector.log', role: 'ise', areas: [A.SSE] },
  { stem: 'udn.log', label: 'udn.log', role: 'ise', areas: [A.UDN] },
  { stem: 'lsd.log', label: 'lsd.log', role: 'ise', areas: [A.LSD] },
  { stem: 'vcs.log', label: 'vcs.log', role: 'ise', areas: [A.VISIBILITY] },
  { stem: 'ise-elasticsearch.log', label: 'ise-elasticsearch.log', role: 'ise', areas: [A.VISIBILITY] },
  { stem: 'ise-messaging.log', label: 'ise-messaging.log', role: 'plain', areas: [A.MESSAGING], bulk: true },
  { stem: 'gc_app.log', label: 'gc_app.log', role: 'plain', areas: [A.APPSERVER], bulk: true },
  { stem: 'access.log', label: 'apigateway access.log', role: 'plain', areas: [A.REST], bulk: true },
  { stem: 'rest-id-store.log', label: 'rest-id-store.log', role: 'ise', areas: [A.RESTSTORE] },
  { stem: 'deployment.log', label: 'deployment.log', role: 'ise', areas: [A.REPLICATION, A.SYSTEM] },
  { stem: 'mydevices.log', label: 'mydevices.log', role: 'ise', areas: [A.MYDEVICES] },
  { stem: 'sponsor.log', label: 'sponsor.log', role: 'ise', areas: [A.SPONSOR] },
  { stem: 'localhost_access_log.txt', label: 'localhost_access_log', role: 'plain', areas: [A.APPSERVER] },
]

/** Directory-based groups — matched on the path rather than the filename. */
const DIR_SPECS: { match: RegExp; label: string; role: ParserRole; areas: string[]; bulk?: boolean }[] = [
  { match: /\/passiveid[^/]*\//, label: 'passiveid/', role: 'ise', areas: [A.PASSIVEID] },
  { match: /\/wifisetup\//, label: 'wifisetup/', role: 'ise', areas: [A.WIFISETUP] },
  { match: /\/sxp_appserver\//, label: 'sxp_appserver/', role: 'ise', areas: [A.TRUSTSEC] },
  { match: /\/appserver\//, label: 'appserver/', role: 'plain', areas: [A.APPSERVER] },
  { match: /\/pxgrid(direct)?\//, label: 'pxgrid/', role: 'ise', areas: [A.PXGRID, A.PASSIVEID] },
  { match: /\/ise-messaging\//, label: 'ise-messaging/', role: 'plain', areas: [A.MESSAGING], bulk: true },
]

/** Never worth reading: binaries, installer history, OS journals. */
const IGNORE = /\.(dmp|gz|zip|jar|so|bin|core|db|dat|idx|png|jpg|pdf|journal|tar)$/i
const IGNORE_PATH = /\/(oracle|adeos\/journal|dbexport|core|thinfiles|anaconda|rpm)\//i

/**
 * Reduce a filename to the stem shared by all of its rotations.
 *   ise-psc.log.2026-08-11-1   -> ise-psc.log
 *   gc_app.log.20260210173144.22 -> gc_app.log
 *   catalina.out.1             -> catalina.out
 *   ise-psc1.log               -> ise-psc.log
 */
export function stemOf(basename: string): string {
  let s = basename.toLowerCase()
  s = s.replace(/\.gz$/, '')
  s = s.replace(/\.(log|out|txt)[.\-][\w.\-]*$/, '.$1')
  s = s.replace(/(\D)\d+\.(log|out|txt)$/, '$1.$2')
  return s
}

const BY_STEM = new Map(SPECS.map(s => [s.stem, s]))

export interface Resolved {
  label: string
  role: ParserRole
  areas: string[]
  bulk: boolean
}

/** What should be done with this path, or null to skip it. */
export function specFor(fullPath: string): Resolved | null {
  const path = fullPath.toLowerCase()
  if (IGNORE_PATH.test(path)) return null
  if (IGNORE.test(path)) return null

  const base = path.split('/').pop() ?? path

  if (/^messagecatalog.*\.properties$/.test(base)) {
    return { label: 'messagecatalog.properties', role: 'catalogue', areas: [], bulk: false }
  }

  const direct = BY_STEM.get(stemOf(base))
  if (direct) {
    return { label: direct.label, role: direct.role, areas: direct.areas, bulk: Boolean(direct.bulk) }
  }

  for (const d of DIR_SPECS) {
    if (d.match.test(path) && /\.(log|out|txt)$|\.(log|out)\./.test(base)) {
      return { label: d.label, role: d.role, areas: d.areas, bulk: Boolean(d.bulk) }
    }
  }
  return null
}

/** Which logs Cisco expects for each area, for reporting what is missing. */
export function logsForArea(area: string): string[] {
  const out = SPECS.filter(s => s.areas.includes(area)).map(s => s.label)
  for (const d of DIR_SPECS) if (d.areas.includes(area)) out.push(d.label)
  return [...new Set(out)]
}

export const ALL_AREAS: string[] = [...new Set(Object.values(AREAS))]
