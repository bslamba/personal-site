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

const CCNP_TRACK_TERMS = [
  'ccna', '200-301', 'ccnp', 'ccnp enterprise', 'encor', '350-401',
  'enarsi', '300-410', 'ccie enterprise', 'cisco certification',
  'exam topics', 'blueprint', 'study guide', 'study plan', 'labs',
  'network fundamentals', 'network access', 'ip connectivity', 'ip services',
  'security fundamentals', 'automation', 'programmability',
  'vlan', 'trunk', '802.1q', 'native vlan', 'etherchannel', 'lacp', 'pagp',
  'spanning tree', 'stp', 'rstp', 'mst', 'rapid pvst', 'portfast',
  'bpdu guard', 'root guard', 'loop guard', 'udld',
  'ospf', 'ospfv3', 'lsa', 'nssa', 'stub area', 'virtual link', 'abr', 'asbr',
  'eigrp', 'dual', 'feasible successor', 'stuck in active', 'named mode',
  'bgp', 'ibgp', 'ebgp', 'route reflector', 'local preference', 'as path',
  'med', 'weight', 'best path', 'redistribution', 'route map', 'prefix list',
  'administrative distance', 'summarization', 'policy based routing', 'pbr',
  'static route', 'floating static', 'longest prefix match',
  'vrf', 'vrf-lite', 'gre', 'ipsec', 'dmvpn', 'nhrp', 'mgre', 'mpls', 'ldp',
  'l3vpn', 'lisp', 'vxlan', 'vtep', 'vni', 'overlay', 'underlay', 'fabric',
  'sd-wan', 'sd-access', 'catalyst center', 'dna center', 'vmanage', 'vsmart',
  'hsrp', 'vrrp', 'glbp', 'fhrp', 'nat', 'pat', 'dhcp', 'dns', 'ntp', 'ptp',
  'qos', 'dscp', 'policing', 'shaping', 'llq', 'mqc',
  'multicast', 'pim', 'igmp', 'rpf', 'ssm', 'msdp',
  'netflow', 'flexible netflow', 'ipfix', 'span', 'rspan', 'erspan', 'ip sla',
  'syslog', 'snmp', 'debug', 'conditional debug', 'eem',
  'acl', 'copp', 'urpf', 'aaa', 'tacacs', 'radius', 'macsec', 'trustsec',
  'ipv6', 'slaac', 'eui-64', 'link local', 'ra guard', 'dhcp guard',
  'netconf', 'restconf', 'yang', 'json', 'python', 'ansible', 'terraform',
  'rest api', 'subnetting', 'vlsm', 'wireless', 'wlc', 'capwap', 'wpa3',
  'port security', 'dhcp snooping', 'dynamic arp inspection', 'bfd',
]

export const REFERENCES: Reference[] = [
  {
    slug: 'ccna-ccnp-study-guide',
    href: '/blog/ccna-ccnp-study-guide',
    title: 'CCNA, ENCOR and ENARSI — The Complete Topic-by-Topic Study Guide',
    excerpt:
      'Every topic on three Cisco blueprints, in Cisco\u2019s own numbering and ' +
      'searchable \u2014 each one explained from first principles with diagrams, ' +
      'packet flow, full configuration, a lab to build it, and a knowledge check.',
    category: 'networking',
    meta: 'Reference · CCNA 200-301 · ENCOR 350-401 · ENARSI 300-410',
    tags: [
      'CCNA', 'CCNP Enterprise', 'ENCOR', 'ENARSI', 'Certification',
      'Spanning Tree', 'OSPF', 'EIGRP', 'BGP', 'Layer 2', 'Switching',
      'Routing', 'Automation',
    ],
    searchText: [
      'CCNA, ENCOR and ENARSI topic by topic study guide',
      'every blueprint topic with a lab for each',
      ...CCNP_TRACK_TERMS,
    ]
      .join(' ')
      .toLowerCase(),
  },
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
