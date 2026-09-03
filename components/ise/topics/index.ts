// ============================================================
// components/ise/topics/index.ts
//
// The topic registry. Order here is the order of the hub and of
// the previous/next arrows, so it reads as a curriculum:
// platform first, then policy and identity, then how endpoints
// get on, then what ISE does with them once they are, then how
// you run the thing.
// ============================================================

import type { Topic } from '../types'

import ArchitectureSheet from './architecture'
import DeploymentSheet from './deployment'
import LicensingSheet from './licensing'
import NodesSheet from './nodes'
import PortsSheet from './ports'
import UpgradeSheet from './upgrade'
import ReleasesSheet from './releases'

import PolicySheet from './policy'
import IdentitySheet from './identity'
import EapSheet from './eap'

import CertsSheet from './certs'
import TacacsSheet from './tacacs'

import Dot1xSheet from './dot1x'
import MabSheet from './mab'
import RadiusCoaSheet from './radius-coa'
import WirelessSheet from './wireless'
import GuestSheet from './guest'
import ByodSheet from './byod'

import ProfilingSheet from './profiling'
import PostureSheet from './posture'
import PassiveIdSheet from './passiveid'
import TrustsecSheet from './trustsec'
import PxgridSheet from './pxgrid'
import AncSheet from './anc'

import LogsSheet from './logs'
import ApiSheet from './api'

export const TOPICS: Topic[] = [
  // ================= PLATFORM =================
  {
    id: 'architecture',
    title: 'Architecture & Personas',
    short: 'Architecture & Personas',
    family: 'platform',
    blurb:
      'PAN, MnT, PSN and pxGrid — what each does, how they fail over, and what breaks when one dies.',
    tags: [
      'persona', 'PAN', 'MnT', 'PSN', 'pxGrid', 'node', 'primary', 'secondary',
      'node group', 'bandwidth', 'processes', 'registration',
    ],
    Sheet: ArchitectureSheet,
  },
  {
    id: 'deployment',
    title: 'Deployment Models, Sizing & Appliances',
    short: 'Deployment & Sizing',
    family: 'platform',
    blurb:
      'Standalone to large, SNS appliance scale, VM profiles, and how to size a deployment properly.',
    tags: [
      'deployment', 'sizing', 'scale', 'SNS', '3615', '3655', '3695', '3715',
      '3755', '3795', 'virtual machine', 'sessions', 'standalone', 'small',
      'medium', 'large',
    ],
    interactive: '4 models',
    Sheet: DeploymentSheet,
  },
  {
    id: 'licensing',
    title: 'Licensing & Smart Licensing',
    short: 'Licensing',
    family: 'platform',
    blurb:
      'Essentials, Advantage, Premier and Device Admin — what each unlocks and when a licence is consumed.',
    tags: [
      'licence', 'license', 'Essentials', 'Advantage', 'Premier', 'Device Admin',
      'Smart Licensing', 'CSSM', 'SLR', 'SSM on-prem', 'Base', 'Plus', 'Apex',
    ],
    interactive: '5 tiers',
    Sheet: LicensingSheet,
  },
  {
    id: 'nodes',
    title: 'Node Registration & Replication',
    short: 'Nodes & Replication',
    family: 'platform',
    blurb:
      'What actually happens when a node joins, how the database replicates, and how to debug a stuck join.',
    tags: [
      'registration', 'replication', 'JGroups', '12001', 'in sync',
      'out of sync', 'deregister', 'node group', 'replication.log',
    ],
    Sheet: NodesSheet,
  },
  {
    id: 'ports',
    title: 'Ports & Protocols Reference',
    short: 'Ports & Protocols',
    family: 'platform',
    blurb:
      'Every port ISE uses, grouped by what it is for, with the persona that needs it.',
    tags: [
      'ports', 'firewall', '1812', '1813', '49', '1700', '3799', '8443', '8905',
      '8910', '9060', '64999', '12001', 'protocols', 'allow-list',
    ],
    interactive: '7 groups',
    Sheet: PortsSheet,
  },
  {
    id: 'upgrade',
    title: 'Upgrade, Patching & Backup',
    short: 'Upgrade & Backup',
    family: 'platform',
    blurb:
      'Node order, the four upgrade methods compared, the pre and post checklists, and rollback.',
    tags: [
      'upgrade', 'patch', 'backup', 'restore', 'repository', 'URT',
      'split upgrade', 'rollback', 'reimage', 'GUI upgrade', 'CLI upgrade',
    ],
    interactive: '4 methods',
    Sheet: UpgradeSheet,
  },
  {
    id: 'releases',
    title: 'ISE 3.x Releases — What Changed',
    short: 'ISE 3.x Releases',
    family: 'platform',
    blurb:
      'The release model, the suggested release, and what each of 3.0 to 3.5 actually brought.',
    tags: [
      'release', 'version', '3.0', '3.1', '3.2', '3.3', '3.4', '3.5',
      'suggested release', 'end of life', 'what is new', 'TLS 1.3', 'TEAP',
    ],
    interactive: 'Per release',
    Sheet: ReleasesSheet,
  },

  // ================= POLICY & IDENTITY =================
  {
    id: 'policy',
    title: 'Policy Sets, Conditions & Authorization',
    short: 'Policy & Authorization',
    family: 'policy',
    blurb:
      'How a policy set is evaluated, the dictionaries worth knowing, and every authorization result type.',
    tags: [
      'policy set', 'authentication policy', 'authorization policy',
      'allowed protocols', 'condition', 'dictionary', 'authorization profile',
      'dACL', 'VLAN', 'exception', 'identity source sequence',
    ],
    interactive: '6 result types',
    Sheet: PolicySheet,
  },
  {
    id: 'identity',
    title: 'Identity Stores & Active Directory',
    short: 'Identity Stores & AD',
    family: 'policy',
    blurb:
      'AD join points and scopes, LDAP, ODBC, SAML, Entra ID, and which EAP method works against each.',
    tags: [
      'Active Directory', 'AD', 'join point', 'scope', 'LDAP', 'ODBC', 'SAML',
      'Entra ID', 'Azure AD', 'RSA', 'RADIUS token', 'internal users', 'MAR',
      'certificate authentication profile',
    ],
    interactive: '8 stores',
    Sheet: IdentitySheet,
  },
  {
    id: 'eap',
    title: 'EAP Methods & the 802.1X Exchange',
    short: 'EAP Methods',
    family: 'policy',
    blurb:
      'EAP, EAPOL and the frame types — then every method with its exchange drawn frame by frame.',
    tags: [
      'EAP', 'EAPOL', 'EAP-TLS', 'PEAP', 'MSCHAPv2', 'TEAP', 'EAP-TTLS',
      'EAP-FAST', 'EAP chaining', 'supplicant', 'outer identity', 'inner method',
    ],
    interactive: '6 methods',
    Sheet: EapSheet,
  },

  {
    id: 'certs',
    title: 'Certificates & PKI',
    short: 'Certificates & PKI',
    family: 'policy',
    blurb:
      'Every system certificate role, what it is presented to, and what breaks the day it expires.',
    tags: [
      'certificate', 'PKI', 'CSR', 'SAN', 'wildcard', 'internal CA', 'OCSP',
      'CRL', 'trusted certificates', 'EAP certificate', 'portal certificate',
      'renewal', 'chain',
    ],
    interactive: '7 usages',
    Sheet: CertsSheet,
  },
  {
    id: 'tacacs',
    title: 'Device Administration with TACACS+',
    short: 'Device Admin (TACACS+)',
    family: 'policy',
    blurb:
      'TACACS+ against RADIUS, device admin policy sets, shell profiles and command sets.',
    tags: [
      'TACACS+', 'device administration', 'command set', 'shell profile',
      'privilege level', 'port 49', 'AAA', 'command authorization',
    ],
    interactive: 'Per component',
    Sheet: TacacsSheet,
  },

  // ================= ACCESS METHODS =================
  {
    id: 'dot1x',
    title: '802.1X Wired Access & IBNS 2.0',
    short: '802.1X & IBNS 2.0',
    family: 'access',
    blurb:
      'Monitor, Low-Impact and Closed mode with the full switchport configuration for each.',
    tags: [
      '802.1X', 'dot1x', 'IBNS', 'C3PL', 'monitor mode', 'low impact',
      'closed mode', 'host mode', 'multi-auth', 'multi-domain', 'critical auth',
      'timers', 'supplicant', 'authenticator',
    ],
    interactive: '3 modes',
    Sheet: Dot1xSheet,
  },
  {
    id: 'mab',
    title: 'MAC Authentication Bypass',
    short: 'MAB',
    family: 'access',
    blurb:
      'The fallback path, how ISE recognises a MAB request, and why MAB alone is not a control.',
    tags: [
      'MAB', 'MAC authentication bypass', 'Call-Check', 'Service-Type 10',
      'Calling-Station-ID', 'endpoint identity group', 'critical MAB', 'spoofing',
    ],
    interactive: '4 scenarios',
    Sheet: MabSheet,
  },
  {
    id: 'radius-coa',
    title: 'RADIUS & Change of Authorization',
    short: 'RADIUS & CoA',
    family: 'access',
    blurb:
      'The attributes that matter, server dead detection, and every CoA command with its AV-pair.',
    tags: [
      'RADIUS', 'CoA', 'RFC 5176', 'dynamic authorization', 'port bounce',
      'reauthenticate', 'disconnect', 'terminate', '1700', '3799', 'accounting',
      'dead-criteria', 'DTLS',
    ],
    interactive: '4 CoA types',
    Sheet: RadiusCoaSheet,
  },
  {
    id: 'wireless',
    title: 'Wireless Access & the Catalyst 9800',
    short: 'Wireless & C9800',
    family: 'access',
    blurb:
      'What changes when the authenticator is a WLC — tags, profiles, and the redirect ACL trap.',
    tags: [
      'wireless', 'WLC', '9800', 'AireOS', 'WPA2', 'WPA3', '4-way handshake',
      'policy profile', 'policy tag', 'FlexConnect', 'NAS-Port-Type 19', 'SSID',
    ],
    interactive: '4 auth types',
    Sheet: WirelessSheet,
  },
  {
    id: 'guest',
    title: 'Guest Access',
    short: 'Guest Access',
    family: 'access',
    blurb:
      'Hotspot, self-registered and sponsored portals, CWA against LWA, and the full redirect flow.',
    tags: [
      'guest', 'hotspot', 'self-registration', 'sponsor', 'CWA', 'LWA',
      'web authentication', 'redirect ACL', 'portal', 'social login',
      'guest type', 'purge',
    ],
    interactive: '5 flows',
    Sheet: GuestSheet,
  },
  {
    id: 'byod',
    title: 'BYOD & Device Onboarding',
    short: 'BYOD & Onboarding',
    family: 'access',
    blurb:
      'Single-SSID and dual-SSID onboarding end to end, native supplicant provisioning and MDM.',
    tags: [
      'BYOD', 'onboarding', 'NSP', 'native supplicant', 'single SSID',
      'dual SSID', 'SCEP', 'EST', 'internal CA', 'My Devices', 'MDM', 'UEM',
      'MAC randomisation',
    ],
    interactive: '3 flows',
    Sheet: ByodSheet,
  },

  // ================= VISIBILITY & CONTROL =================
  {
    id: 'profiling',
    title: 'Profiling',
    short: 'Profiling',
    family: 'visibility',
    blurb:
      'Active and passive probes, every probe’s configuration, certainty factor, and profiler CoA.',
    tags: [
      'profiling', 'probe', 'RADIUS probe', 'DHCP', 'SNMP', 'NMAP', 'NetFlow',
      'DNS', 'HTTP', 'device sensor', 'certainty factor', 'endpoint policy',
      'identity group', 'anomalous', 'feed service',
    ],
    interactive: '13 probes',
    Sheet: ProfilingSheet,
  },
  {
    id: 'posture',
    title: 'Posture & Compliance',
    short: 'Posture',
    family: 'visibility',
    blurb:
      'The posture life cycle, every agent type, conditions and remediations, redirect and redirectless.',
    tags: [
      'posture', 'compliance', 'Secure Client', 'AnyConnect', 'stealth mode',
      'temporal agent', 'agentless', 'remediation', 'PRA', 'posture lease',
      'client provisioning', 'grace period', '8443', '8905',
    ],
    interactive: '4 agents',
    Sheet: PostureSheet,
  },
  {
    id: 'passiveid',
    title: 'Passive Identity',
    short: 'Passive ID',
    family: 'visibility',
    blurb:
      'Learning who is on an IP without authenticating them — every provider, and the limits.',
    tags: [
      'Passive ID', 'PassiveID', 'Easy Connect', 'WMI', 'AD Agent', 'syslog',
      'SPAN', 'TS Agent', 'PIC', 'user to IP mapping', '9094', '9095',
    ],
    interactive: '6 providers',
    Sheet: PassiveIdSheet,
  },
  {
    id: 'trustsec',
    title: 'TrustSec & Group-Based Policy',
    short: 'TrustSec & SGT',
    family: 'visibility',
    blurb:
      'Classification, propagation and enforcement — inline tagging, SXP and the egress matrix.',
    tags: [
      'TrustSec', 'SGT', 'SGACL', 'segmentation', 'inline tagging', 'CMD',
      '0x8909', 'SXP', '64999', 'egress policy', 'matrix', 'cts', 'PAC',
      'group-based policy',
    ],
    interactive: '3 methods',
    Sheet: TrustsecSheet,
  },
  {
    id: 'pxgrid',
    title: 'pxGrid & Integrations',
    short: 'pxGrid & Integrations',
    family: 'visibility',
    blurb:
      'The context bus — 1.0 against 2.0, the topics, and the integrations step by step.',
    tags: [
      'pxGrid', 'STOMP', 'XMPP', '8910', '5222', 'FMC', 'Catalyst Center',
      'DNA Center', 'Stealthwatch', 'Secure Network Analytics', 'pxGrid Direct',
      'topics', 'subscriber',
    ],
    interactive: '4 integrations',
    Sheet: PxgridSheet,
  },
  {
    id: 'anc',
    title: 'Threat Containment & ANC',
    short: 'Threat Containment',
    family: 'visibility',
    blurb:
      'Adaptive Network Control — quarantine an endpoint from ISE, an API or another product.',
    tags: [
      'ANC', 'Adaptive Network Control', 'quarantine', 'shut down',
      'port bounce', 'Rapid Threat Containment', 'RTC', 'ANCPolicy',
      'containment',
    ],
    interactive: '4 actions',
    Sheet: AncSheet,
  },

  // ================= OPERATE =================
  {
    id: 'logs',
    title: 'Logging & Troubleshooting',
    short: 'Logs & Troubleshooting',
    family: 'operate',
    blurb:
      'Which log holds the answer, the commands to read it, and what the failure codes mean.',
    tags: [
      'logs', 'troubleshooting', 'ise-psc.log', 'prrt-server.log', 'profiler.log',
      'ad_agent.log', 'Live Logs', 'Live Sessions', 'support bundle',
      'endpoint debug', 'TCP dump', 'message code', '11036', '22056', '24408',
    ],
    interactive: '14 log files',
    Sheet: LogsSheet,
  },
  {
    id: 'api',
    title: 'APIs, Automation & Data Access',
    short: 'APIs & Automation',
    family: 'operate',
    blurb:
      'ERS, OpenAPI, the MnT API, pxGrid and Data Connect — what each is actually for.',
    tags: [
      'API', 'ERS', 'OpenAPI', 'REST', 'MnT API', 'Data Connect', '9060', '9070',
      '9443', '2484', 'automation', 'programmability',
    ],
    interactive: '5 interfaces',
    Sheet: ApiSheet,
  },
]
