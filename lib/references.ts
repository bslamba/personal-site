// ============================================================
// lib/references.ts
//
// Reference pages that belong in the Journal but are not
// markdown articles.
//
// The Journal is built from content/blog/*.md, so anything that
// is a route rather than a file — the Cisco ISE cheat sheet —
// would otherwise never appear in the directory. These entries
// are folded into the same columns, the same search and the same
// tag filter, and rendered with their own treatment so it is
// obvious they are a reference to open rather than a piece to
// read.
//
// Tags are written out here rather than imported from the topic
// registry on purpose: the directory is a client component, and
// importing the registry would drag all 26 topic sheets into the
// Journal's bundle to read a list of strings.
// ============================================================

import type { CategoryId } from '@/lib/blog-categories'

export interface Reference {
  /** Stable key, and the last segment of the href. */
  slug: string
  href: string
  title: string
  excerpt: string
  category: CategoryId
  /** Shown where an article shows its date and reading time. */
  meta: string
  /** Participates in the Topics filter alongside article tags. */
  tags: string[]
  /** Lower-cased haystack for the Journal search box. */
  searchText: string
}

const ISE_CHEAT_SHEET_TERMS = [
  'cisco ise', 'cheat sheet', 'reference', 'nac', 'network access control',
  'architecture', 'personas', 'pan', 'mnt', 'psn', 'pxgrid',
  'deployment', 'sizing', 'sns appliance', 'licensing', 'essentials',
  'advantage', 'premier', 'smart licensing', 'ports', 'upgrade', 'patch',
  'backup', 'node registration', 'replication', 'ise 3.4', 'ise 3.5',
  'policy set', 'authorization profile', 'dacl', 'identity store',
  'active directory', 'ldap', 'entra id', 'saml', 'eap', 'eap-tls', 'peap',
  'teap', 'eap-fast', 'certificates', 'pki', 'ocsp', 'tacacs',
  'device administration', 'command set', 'shell profile',
  '802.1x', 'dot1x', 'ibns', 'monitor mode', 'low impact', 'closed mode',
  'mab', 'mac authentication bypass', 'radius', 'coa',
  'change of authorization', 'port bounce', 'reauthenticate',
  'wireless', 'catalyst 9800', 'wlc', 'guest', 'hotspot', 'sponsor', 'cwa',
  'lwa', 'byod', 'onboarding', 'native supplicant', 'mdm',
  'profiling', 'probe', 'dhcp probe', 'snmp', 'nmap', 'netflow',
  'device sensor', 'certainty factor', 'posture', 'compliance',
  'secure client', 'anyconnect', 'passive id', 'easy connect',
  'trustsec', 'sgt', 'sgacl', 'sxp', 'segmentation',
  'integrations', 'fmc', 'catalyst center', 'stealthwatch',
  'anc', 'threat containment', 'logs', 'troubleshooting', 'message codes',
  'api', 'ers', 'openapi', 'data connect',
]

export const REFERENCES: Reference[] = [
  {
    slug: 'cisco-ise-cheat-sheet',
    href: '/blog/cisco-ise-cheat-sheet',
    title: 'The Cisco ISE Cheat Sheet',
    excerpt:
      'Every Cisco ISE topic on a single screen each — concepts, the full ' +
      'configuration and the packet flow, with a selector wherever a scenario ' +
      'has more than one option.',
    category: 'nac',
    meta: 'Reference · ISE 3.x',
    tags: [
      'Cisco ISE', 'NAC', 'RADIUS', 'TACACS+', '802.1X', 'MAB', 'EAP-TLS',
      'CoA', 'Profiling', 'Posture', 'BYOD', 'Guest Access', 'TrustSec',
      'pxGrid', 'Passive ID', 'Architecture', 'Deployment',
    ],
    searchText: [
      'The Cisco ISE Cheat Sheet',
      'Every Cisco ISE topic on a single screen each',
      ...ISE_CHEAT_SHEET_TERMS,
    ]
      .join(' ')
      .toLowerCase(),
  },
]

export function referencesFor(category: CategoryId, list: Reference[]) {
  return list.filter(r => r.category === category)
}
