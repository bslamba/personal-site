'use client'

// ============================================================
// Topic — Ports & Protocols Reference
//
// The whole appendix is far too large for one table, so the
// group explorer splits it by purpose: pick AAA, portals,
// probes, node-to-node, pxGrid/APIs, identity stores or the
// outbound allow-list and read only that table.
// ============================================================

import React, { useState } from 'react'
import {
  Sheet,
  Panel,
  Table,
  KV,
  Bullets,
  Note,
  Prose,
  Stack,
  Pill,
  M,
  Selector,
} from '../sheet-kit'

const P = ({ children }: { children: React.ReactNode }) => <M>{children}</M>

interface Group {
  id: string
  label: string
  title: string
  persona: string
  gist: string
  head: string[]
  widths: string[]
  rows: React.ReactNode[][]
  note?: { label: string; tone?: 'signal' | 'warn' | 'good'; body: React.ReactNode }
}

const GROUPS: Group[] = [
  {
    id: 'aaa',
    label: 'AAA & access',
    title: 'RADIUS, TACACS+, CoA and TrustSec',
    persona: 'Policy Service Node',
    gist:
      'Everything a network access device talks to. All of it terminates on a PSN — no NAD should ever be pointed at a PAN or MnT.',
    head: ['Service', 'Port', 'Proto', 'Notes'],
    widths: ['30%', '11%', '10%', '49%'],
    rows: [
      ['RADIUS authentication', <P>1812</P>, 'UDP', 'Standard'],
      ['RADIUS authentication', <P>1645</P>, 'UDP', 'Legacy — still listened on'],
      ['RADIUS accounting', <P>1813</P>, 'UDP', 'Standard. Also where the licence is allocated'],
      ['RADIUS accounting', <P>1646</P>, 'UDP', 'Legacy'],
      ['RADIUS over DTLS', <P>2083</P>, 'UDP', 'Authentication and accounting on one port'],
      ['CoA — send', <P>1700</P>, 'UDP', 'ISE to NAD'],
      ['CoA — listen / relay', <P>1700</P>, 'UDP', ''],
      ['CoA — listen / relay', <P>3799</P>, 'UDP', <strong key="a">Non-configurable</strong>],
      [
        'TACACS+ device administration',
        <P>49</P>,
        'TCP',
        <>Requires a Device Admin licence per PSN. ISE 3.4 and 3.5 add TACACS+ over TLS 1.3</>,
      ],
      ['TrustSec data transfer to NADs', <P>9063</P>, 'TCP', 'HTTP / REST'],
      ['SXP to NADs', <P>64999</P>, 'TCP', 'SGT propagation'],
      ['SXP internal (ISE to ISE)', <P>9644</P>, 'TCP', ''],
      ['IPsec / ISAKMP', <P>500</P>, 'UDP', 'Native IPsec to NADs'],
    ],
    note: {
      label: 'Open both CoA ports',
      body: (
        <>
          <M>1700</M> is the Cisco default and <M>3799</M> is RFC 5176. ISE
          listens on both and <M>3799</M> cannot be changed, so a firewall rule
          written for only one of them produces the classic symptom:
          authorization changes that ISE believes it sent and the switch never
          acted on.
        </>
      ),
    },
  },

  {
    id: 'portals',
    label: 'Portals & posture',
    title: 'Web portals, posture and BYOD provisioning',
    persona: 'Policy Service Node',
    gist:
      'The only ISE ports an end user ever reaches. Portal ports are the one group that can be moved off Gigabit Ethernet 0, and the whole set is configurable within 8000–8999.',
    head: ['Function', 'Port', 'Proto', 'Notes'],
    widths: ['32%', '11%', '11%', '46%'],
    rows: [
      [
        'Guest, Client Provisioning, Certificate Provisioning and My Devices portals',
        <P>8443</P>,
        'TCP / HTTPS',
        'Sponsored, self-registered and hotspot guest flows all land here',
      ],
      ['Sponsor portal', <P>8445</P>, 'TCP / HTTPS', ''],
      ['Blocked List portal', <P>8444</P>, 'TCP / HTTPS', ''],
      [
        'Posture discovery — client side',
        <P>8905</P>,
        'TCP / HTTPS',
        <>Uses the <strong>Admin</strong> certificate</>,
      ],
      [
        'Posture discovery — PSN side',
        <>
          <P>8443</P> <P>8905</P>
        </>,
        'TCP / HTTPS',
        <>8443 uses the <strong>Portal</strong> certificate</>,
      ],
      [
        'Posture assessment, negotiation, heartbeat, reports',
        <P>8905</P>,
        'TCP / HTTPS',
        '8905 is disabled by default on non-PSN nodes',
      ],
      ['Posture bidirectional flow', <P>8449</P>, 'TCP / HTTPS', 'Default; within the 8000–8999 range'],
      [
        'BYOD EST authentication (Android)',
        <P>8084</P>,
        'TCP',
        <strong key="b">Must be permitted in the redirect ACL</strong>,
      ],
      ['Wizard install — Windows, macOS', <P>8443</P>, 'TCP / HTTPS', ''],
      ['Supplicant / agent provisioning', <P>8905</P>, 'TCP / HTTPS', ''],
      ['Google Play (Android provisioning)', <P>443</P>, 'TCP / HTTPS', 'Outbound, endpoint to Google'],
      ['SCEP proxy to an external CA', <P>443</P>, 'TCP / HTTPS', ''],
      ['SCEP', <P>9090</P>, 'TCP', ''],
      ['Guest and sponsor SMTP notifications', <P>25</P>, 'TCP', ''],
      ['SAML admin login', <P>8443</P>, 'TCP', 'Served by a PSN; the admin browser must reach it'],
    ],
    note: {
      label: 'The redirect ACL is the usual culprit',
      tone: 'warn',
      body: (
        <>
          Every port in this table must survive the redirect ACL applied during
          onboarding. <M>8084</M> in particular is forgotten constantly, and
          Android BYOD then fails at certificate enrolment with no obvious ISE
          error.
        </>
      ),
    },
  },

  {
    id: 'probes',
    label: 'Profiling probes',
    title: 'Profiling probe listeners and lookups',
    persona: 'Policy Service Node',
    gist:
      'Probes are per-PSN. Most are inbound listeners on a configurable port; DNS and SNMP query are outbound and therefore route-table dependent.',
    head: ['Probe', 'Port', 'Proto', 'Notes'],
    widths: ['26%', '12%', '11%', '51%'],
    rows: [
      ['DHCP', <P>67</P>, 'UDP', 'Configurable. Fed by an ip helper-address per PSN'],
      ['DHCP SPAN', <P>68</P>, 'UDP', 'Needs a mirrored feed on a non-management interface'],
      ['HTTP', <P>8080</P>, 'TCP', 'The port the ports appendix lists for the HTTP profiling probe'],
      ['DNS', <P>53</P>, 'UDP', 'Reverse lookup; route-table dependent'],
      ['SNMP query', <P>161</P>, 'UDP', 'Outbound to the NAD; route-table dependent'],
      ['SNMP trap', <P>162</P>, 'UDP', 'Configurable; inbound from the NAD'],
      ['NetFlow', <P>9996</P>, 'UDP', 'Configurable; ISE is the collector. v9, for the MAC fields'],
    ],
    note: {
      label: 'Port 80 is not a profiling probe port',
      tone: 'warn',
      body: (
        <>
          The ISE ports appendix lists the HTTP profiling probe on{' '}
          <M>8080</M> only. <M>80</M> does not appear as a profiling probe port
          in the 3.2, 3.3 or 3.5 appendices — where it does appear is as{' '}
          <strong>CRL retrieval over HTTP</strong>. Do not raise a firewall
          request for &ldquo;profiling on 80&rdquo;.
        </>
      ),
    },
  },

  {
    id: 'node',
    label: 'Node-to-node',
    title: 'Replication, clustering and inter-node database traffic',
    persona: 'All personas — this is the deployment fabric',
    gist:
      'Break any of these and the deployment stops being a deployment. Every one binds to Gigabit Ethernet 0 or Bond 0, and the TCP keepalive interval is 60 minutes.',
    head: ['Service', 'Port', 'Proto', 'Persona', 'Notes'],
    widths: ['27%', '11%', '9%', '17%', '36%'],
    rows: [
      ['Replication and synchronisation', <P>443</P>, 'TCP', 'All', 'HTTPS (SOAP)'],
      ['Replication and synchronisation', <P>12001</P>, 'TCP', 'All', <strong key="c">JGroups (global)</strong>],
      ['ISE Messaging Service', <P>8671</P>, 'TCP / SSL', 'All', 'Internal messaging'],
      ['ISE internal communication', <P>15672</P>, 'TCP', 'All', 'RabbitMQ'],
      ['Profiler endpoint ownership sync', <P>6379</P>, 'TCP', 'All', 'Redis'],
      ['Node groups / clustering', <P>7800</P>, 'TCP', 'PSN', 'JGroups — PSN node-group membership for CoA takeover'],
      ['PAN to MnT database', <P>1521</P>, 'TCP', 'PAN, MnT', 'Oracle'],
      ['Additional Oracle ports', <>
        <P>15723</P> <P>16820</P>
      </>, 'TCP', 'MnT', 'Listed in the 3.2 and 3.3 MnT tables'],
      ['ElasticSearch — Context Visibility replication', <P>9300</P>, 'TCP', 'PAN', 'Primary to secondary'],
      ['Log Analytics / Kibana', <P>5701</P>, 'TCP', 'MnT ↔ PAN', 'Present in the 3.2 and 3.3 tables; not seen in the 3.5 extraction'],
      ['Data Grid Service — node discovery', <P>47500</P>, 'TCP', 'All (3.5)', 'Deployment formation'],
      ['Data Grid Service — node to node', <P>47100</P>, 'TCP', 'All (3.5)', 'Internal communication'],
      ['Data Grid Service — client connection', <P>10800</P>, 'TCP', 'All (3.5)', 'Connection establishment'],
    ],
    note: {
      label: 'Set the firewall idle timeout above 60 minutes',
      body: (
        <>
          The 3.3 appendix states the TCP keepalive interval is{' '}
          <strong>60 minutes</strong>. A firewall that idles a session out at 30
          or 60 minutes will silently tear down replication and you will find
          out at the next configuration change, not at the timeout.
        </>
      ),
    },
  },

  {
    id: 'api',
    label: 'pxGrid & APIs',
    title: 'pxGrid, ERS, OpenAPI and the admin surfaces',
    persona: 'pxGrid, PAN and MnT',
    gist:
      'The programmable surface. ERS and OpenAPI are HTTPS-only and operate over 443; the dedicated ports remain for legacy clients and inter-node use.',
    head: ['Service', 'Port', 'Proto', 'Persona', 'Notes'],
    widths: ['28%', '10%', '9%', '15%', '38%'],
    rows: [
      ['pxGrid subscriber connections', <P>8910</P>, 'TCP', 'pxGrid', 'pxGrid 2.0 — WebSocket / REST'],
      ['pxGrid inter-node communication', <P>8910</P>, 'TCP', 'pxGrid', ''],
      ['pxGrid bulk download', <>
        <P>9993</P> <P>2000</P>
      </>, 'TCP', 'MnT', ''],
      ['Admin web GUI', <P>443</P>, 'TCP', 'All', 'HTTPS; enabled by default'],
      ['SSH server', <P>22</P>, 'TCP', 'All', 'Restricted to Gigabit Ethernet 0'],
      [
        'ERS REST API',
        <P>9060</P>,
        'TCP',
        'PAN, MnT',
        'Legacy dedicated port; 443 also serves ERS. Default connection limit 30, raisable to 60',
      ],
      ['ERS certificate-based auth', <P>9062</P>, 'TCP', 'PAN', 'Catalyst Center / DNAC'],
      ['OpenAPI', <P>443</P>, 'TCP', 'PAN', 'ERS and OpenAPI are HTTPS-only REST APIs over 443'],
      ['OpenAPI — inter-node', <P>9070</P>, 'TCP', 'MnT', 'Also served on 443'],
      ['MnT REST API', <P>9443</P>, 'TCP', 'MnT', 'Inbound from the ISE API Gateway'],
      ['Guest account management from the Admin GUI', <P>9002</P>, 'TCP', 'PAN', ''],
      [
        <span key="d" className="text-ink-400">pxGrid 1.0 (XMPP)</span>,
        <span key="e" className="text-ink-400">5222</span>,
        <span key="f" className="text-ink-400">TCP</span>,
        <span key="g" className="text-ink-400">Legacy</span>,
        <span key="h" className="text-ink-400">
          Not present in the ISE 3.x ports appendices — see the legacy panel
        </span>,
      ],
    ],
    note: {
      label: 'pxGrid 2.0 is mandatory from 3.1',
      body: (
        <>
          The 3.3 appendix is explicit: from ISE 3.1 onward, all pxGrid
          connections must use pxGrid 2.0. There is one port to open,{' '}
          <M>8910</M>, plus the MnT bulk-download ports for subscribers that
          take a full session snapshot on connect.
        </>
      ),
    },
  },

  {
    id: 'identity',
    label: 'Identity & infrastructure',
    title: 'Identity stores, certificate services and platform plumbing',
    persona: 'All personas, unless stated',
    gist:
      'The same external identity source set appears on the PAN, MnT and PSN tables. Only Gigabit Ethernet 0 can manage the device — sources reached over another interface need static routes.',
    head: ['Service', 'Port', 'Proto', 'Persona', 'Notes'],
    widths: ['26%', '18%', '10%', '14%', '32%'],
    rows: [
      ['LDAP / LDAP global catalog', <>
        <P>389</P> <P>3268</P>
      </>, 'TCP / UDP', 'All', '3268 is the AD global catalog'],
      ['SMB', <P>445</P>, 'TCP', 'All', ''],
      ['Kerberos KDC / KPASS', <>
        <P>88</P> <P>464</P>
      </>, 'TCP', 'All', ''],
      ['WMI', <P>135</P>, 'TCP', 'All', ''],
      [
        'ODBC identity stores',
        <>
          <P>1433</P> <P>2638</P> <P>5432</P> <P>1521</P>
        </>,
        'TCP',
        'All',
        'MS SQL · Sybase · PostgreSQL · Oracle',
      ],
      [
        'Data Connect',
        <P>2484</P>,
        'TCPS',
        'MnT / PAN',
        'Oracle TCP Secure. Runs on the Secondary MnT by default; moves to the Primary PAN if the SMnT is removed',
      ],
      ['NTP / DNS', <>
        <P>123</P> <P>53</P>
      </>, 'UDP, TCP', 'All', ''],
      ['SMTP', <P>25</P>, 'TCP', 'PAN, MnT, PSN', 'Guest and password-expiration notifications'],
      ['SNMP query / trap', <>
        <P>161</P> <P>162</P>
      </>, 'UDP', 'All', 'Query is route-table dependent'],
      [
        'Syslog / secure syslog',
        <>
          <P>20514</P> <P>1468</P> <P>6514</P>
        </>,
        'UDP / TCP',
        'All',
        '20514 UDP, 1468 TCP, 6514 secure TCP — all configurable',
      ],
      ['PassiveID TS Agent / AD Agent', <>
        <P>9094</P> <P>9095</P>
      </>, 'TCP', 'PSN', 'Inbound to the PSN'],
      ['PassiveID syslog', <>
        <P>40514</P> <P>11468</P>
      </>, 'UDP / TCP', 'PSN', 'Inbound to the PSN'],
      ['OCSP — ISE internal CA responder', <P>2560</P>, 'TCP', 'PSN', ''],
      [
        'OCSP / CRL over HTTPS',
        <P>443</P>,
        'TCP',
        'Outbound',
        'Default. ISE 3.5 adds Host header support (HTTP 1.1) for OCSP server compatibility',
      ],
      ['CRL over HTTP / LDAP', <>
        <P>80</P> <P>389</P>
      </>, 'TCP / UDP', 'Outbound', ''],
    ],
  },

  {
    id: 'internet',
    label: 'Internet allow-list',
    title: 'Required internet URLs — outbound from ISE',
    persona: 'PAN primarily; PSN for posture and portals',
    gist:
      'The outbound set the appendix requires. Everything here is HTTPS on 443 unless the entry says otherwise, and a proxy on the PAN covers most of it.',
    head: ['Feature', 'URLs', 'Notes'],
    widths: ['24%', '44%', '32%'],
    rows: [
      [
        'Posture updates',
        <>
          <M>https://www.cisco.com/</M> · <M>https://iseservice.cisco.com</M>
        </>,
        'Posture condition and remediation feed',
      ],
      ['Profiler feed service', <M>https://ise.cisco.com</M>, 'New and updated endpoint profiles'],
      ['Smart Licensing', <M>https://smartreceiver.cisco.com</M>, 'From 3.0 p7 / 3.1 p5 / 3.2 and above'],
      ['Telemetry', <M>https://connectdna.cisco.com/</M>, ''],
      [
        'pxGrid Cloud portal',
        <>
          <M>https://dna.cisco.com</M> · <M>https://dnaservices.cisco.com</M> ·{' '}
          <M>https://ciscodnacloud.com</M>
        </>,
        '',
      ],
      [
        'Cisco AI Analytics',
        <>
          <M>api.use1.prd.kairos.ciscolabs.com</M> (US East) ·{' '}
          <M>api.euc1.prd.kairos.ciscolabs.com</M> (EU Central)
        </>,
        <>HTTPS <M>443</M></>,
      ],
      [
        'Microsoft Entra ID',
        <>
          <M>graph.microsoft.com</M> · <M>login.microsoftonline.com</M> ·{' '}
          <M>*.login.microsoftonline.com</M> · <M>*.login.microsoft.com</M>
        </>,
        <>All on <M>443</M></>,
      ],
      [
        'Social login (guest)',
        <>
          <M>facebook.co</M> · <M>akamaihd.net</M> · <M>akamai.co</M> ·{' '}
          <M>fbcdn.net</M>
        </>,
        'Facebook guest login only',
      ],
      ['Cisco Duo MFA', <M>*.duosecurity.com</M>, <>Port <M>443</M></>],
      ['Customer experience surveys', <M>*.qualtrics.com</M>, 'ISE 3.2 Patch 4 and later'],
      [
        'Interactive Help',
        <>
          <M>*.walkme.com</M> · <M>*.walkmeusercontent.com</M>
        </>,
        'The in-GUI walkthroughs',
      ],
    ],
    note: {
      label: 'Air-gapped deployments',
      tone: 'good',
      body: (
        <>
          Posture updates and the profiler feed both have offline import paths,
          and Smart Licensing has SSM on-prem and Specific Licence Reservation.
          Nothing on this list is a hard requirement to authenticate — but every
          one of them is a feature that quietly stops updating if you omit it.
        </>
      ),
    },
  },
]

export default function PortsSheet() {
  const [groupId, setGroupId] = useState(GROUPS[0].id)
  const group = GROUPS.find(g => g.id === groupId) ?? GROUPS[0]

  return (
    <Sheet>
      {/* ---------------- THE GROUP EXPLORER ---------------- */}
      <Panel
        title="Port group explorer"
        span={12}
        tone="ink"
        right={
          <span className="normal-case tracking-normal">
            Grouped by purpose — pick the one you are writing a firewall rule for
          </span>
        }
      >
        <Stack gap={8}>
          <div className="flex items-center justify-between gap-4">
            <Selector
              options={GROUPS.map(g => ({ id: g.id, label: g.label, hint: g.gist }))}
              value={groupId}
              onChange={setGroupId}
              label="Group"
            />
            <Pill tone="neutral">{group.persona}</Pill>
          </div>

          <div className="border-t border-ink-200 pt-2">
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-9">
                <h4
                  className="mb-1 text-[12px] font-bold tracking-tight text-ink-950"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  {group.title}
                </h4>
                <Table head={group.head} widths={group.widths} rows={group.rows} />
              </div>
              <div className="col-span-3">
                <Prose>{group.gist}</Prose>
                {group.note && (
                  <div className="mt-2">
                    <Note label={group.note.label} tone={group.note.tone}>
                      {group.note.body}
                    </Note>
                  </div>
                )}
              </div>
            </div>
          </div>
        </Stack>
      </Panel>

      {/* ---------------- WHERE THE APPENDIX LIVES ---------------- */}
      <Panel title="Where the appendix lives" kicker="It was renamed" span={4}>
        <Stack gap={6}>
          <Prose>
            The ports appendix is chapter 7 of the <strong>Installation
            Guide</strong>, not the Admin Guide. In ISE 3.2 and earlier it is
            titled <strong>Cisco ISE Ports Reference</strong>; from ISE 3.3
            onward it is <strong>Cisco ISE Network Ports and Protocols
            Specifications</strong>.
          </Prose>
          <KV
            items={[
              ['3.1 – 3.3', <>One page: <M>install_guide/…/…_chapter_7.html</M></>],
              [
                '3.4',
                <>
                  Same chapter, but the filename drops the release —{' '}
                  <M>b_ise_InstallationGuide_chapter_7.html</M>. The obvious
                  guesses 404
                </>,
              ],
              [
                '3.5',
                <>
                  Split into sub-pages, one per persona: all-nodes,
                  administration, monitoring, policy service, pxGrid, OCSP/CRL,
                  operating system, processes, and required internet URLs
                </>,
              ],
            ]}
            labelWidth={54}
          />
          <Note label="Read the appendix for your release">
            Ports move between releases. The Data Grid Service ports arrived in
            3.5, and the Kibana port present in the 3.2 and 3.3 monitoring
            tables was not found in the 3.5 pages. Never copy a firewall rule
            set from a different major version without diffing it.
          </Note>
        </Stack>
      </Panel>

      {/* ---------------- CONVENTIONS ---------------- */}
      <Panel title="Interface and firewall conventions" span={4} tone="quiet">
        <Bullets
          items={[
            <>Unless noted, every port binds to <strong>Gigabit Ethernet 0 or Bond 0</strong>.</>,
            <><strong>Portal ports are the exception</strong> — they can be moved to other Ethernet interfaces, and the whole portal range is configurable within <M>8000–8999</M>.</>,
            <><strong>Only Gigabit Ethernet 0 can manage the device.</strong> External identity sources reached over another interface need static routes.</>,
            <>The <strong>TCP keepalive interval is 60 minutes</strong>. Set firewall idle timeouts above that or replication sessions are torn down silently.</>,
            <>The appendix&rsquo;s <strong>operating system ports</strong> list — TCP 1 through 65389, plus UDP 51824 and ICMP — is an NMAP-derived scan surface. It is <strong>not</strong> a list of services ISE listens on, and should never be treated as one.</>,
            <>SNMP query and DNS are <strong>route-table dependent</strong>: they leave by whichever interface the route says, which may not be the one you assumed.</>,
          ]}
        />
      </Panel>

      {/* ---------------- PROCESSES ---------------- */}
      <Panel title="Cisco ISE processes" kicker="show application status ise" span={4}>
        <Table
          head={['Process', 'What it is']}
          widths={['36%', '64%']}
          rows={[
            ['Database Listener', 'Oracle Enterprise listener — must be running for all services'],
            ['Database Server', 'Oracle Enterprise DB holding configuration and operational data'],
            ['Application Server', 'The main Tomcat server for ISE'],
            ['Profiler Database', 'Redis, backing the profiling service'],
            ['AD Connector', 'Active Directory runtime — must be running for AD authentications'],
            ['MnT Session Database', 'Oracle TimesTen in-memory DB for the MnT service'],
            ['MnT Log Collector', 'Log collection for MnT'],
            ['MnT Log Processor', 'Log processing for MnT'],
            ['Certificate Authority Service', 'The ISE internal CA, required if the internal CA is enabled'],
          ]}
        />
      </Panel>

      {/* ---------------- LEGACY ---------------- */}
      <Panel title="Legacy ports, and two things stated wrongly" span={5} tone="signal">
        <Stack gap={6}>
          <KV
            items={[
              [
                <>TCP 5222</>,
                <>
                  The XMPP port of <strong>legacy pxGrid 1.0</strong>. pxGrid 1.0
                  was removed in ISE 3.1 and 5222 <strong>does not appear in the
                  ISE 3.x ports appendices</strong>. Treat it as history, not as
                  a port to open on a 3.x deployment
                </>,
              ],
              [
                <>TCP 80</>,
                <>
                  In the appendix, <strong>CRL retrieval over HTTP</strong>. It
                  is <strong>not</strong> listed as an ISE profiling probe port
                  — the HTTP probe is listed on <M>8080</M>
                </>,
              ],
              [
                <>UDP 1645 / 1646</>,
                <>Legacy RADIUS auth and accounting. Still listened on, still worth permitting if you inherited old NAD configuration</>,
              ],
              [
                <>TCP 5701</>,
                <>Log Analytics / Kibana between MnT and PAN. In the 3.2 and 3.3 tables; verify before assuming it for 3.5</>,
              ],
            ]}
            labelWidth={78}
          />
        </Stack>
      </Panel>

      {/* ---------------- QUICK REFERENCE ---------------- */}
      <Panel title="The ports you will actually be asked for" kicker="Condensed" span={7} tone="quiet">
        <Table
          head={['Port', 'Proto', 'Persona', 'Purpose']}
          widths={['15%', '11%', '15%', '59%']}
          rows={[
            [<P key="p49">49</P>, 'TCP', 'PSN', 'TACACS+ device administration'],
            [<P key="p1812">1812 / 1813</P>, 'UDP', 'PSN', 'RADIUS authentication / accounting'],
            [<P key="p1700">1700 / 3799</P>, 'UDP', 'PSN', 'CoA send and listen — 3799 is non-configurable'],
            [<P key="p2083">2083</P>, 'UDP', 'PSN', 'RADIUS over DTLS'],
            [<P key="p8443">8443</P>, 'TCP', 'PSN', 'Guest, Client Provisioning, Certificate Provisioning, My Devices; SAML admin login'],
            [<P key="p8905">8905</P>, 'TCP', 'PSN', 'Posture discovery and assessment, supplicant provisioning'],
            [<P key="p8910">8910</P>, 'TCP', 'pxGrid', 'pxGrid 2.0 subscribers and inter-node'],
            [<P key="p443">443</P>, 'TCP', 'All', 'Admin GUI, replication (SOAP), ERS and OpenAPI, Smart Licensing, OCSP, TC-NAC'],
            [<P key="p12001">12001</P>, 'TCP', 'All', 'Replication — JGroups (global)'],
            [<P key="p8671">8671</P>, 'TCP / SSL', 'All', 'ISE Messaging Service'],
            [<P key="p7800">7800</P>, 'TCP', 'PSN', 'Node groups / JGroups clustering'],
            [<P key="p9060">9060</P>, 'TCP', 'PAN, MnT', 'ERS REST API'],
            [<P key="p9443">9443</P>, 'TCP', 'MnT', 'MnT REST API'],
            [<P key="p20514">20514 / 1468 / 6514</P>, 'UDP / TCP', 'All', 'Syslog, syslog, secure syslog'],
            [<P key="p161">161 / 162</P>, 'UDP', 'All', 'SNMP query / trap'],
            [<P key="p67">67 / 8080 / 9996</P>, 'UDP / TCP / UDP', 'PSN', 'DHCP, HTTP and NetFlow profiling probes'],
          ]}
        />
      </Panel>
    </Sheet>
  )
}
