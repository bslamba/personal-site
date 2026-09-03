'use client'

// ============================================================
// Topic — TrustSec & Group-Based Policy
//
// The spine is the three pillars: Classification, Propagation,
// Enforcement. The interactive panel is the propagation
// explorer — inline tagging, SXP and pxGrid, each with its wire
// format, its scaling limits and its full switch CLI.
// ============================================================

import React, { useState } from 'react'
import {
  Sheet,
  Panel,
  KV,
  Bullets,
  Note,
  Prose,
  Stack,
  Code,
  Pill,
  M,
  Split,
  Flow,
  Matrix,
  Selector,
} from '../sheet-kit'

// ------------------------------------------------------------
// The propagation methods
// ------------------------------------------------------------

type PropId = 'inline' | 'sxp' | 'pxgrid'

interface Method {
  id: PropId
  label: string
  name: string
  plane: 'Data plane' | 'Control plane'
  gist: string
  carries: React.ReactNode[]
  wire: [React.ReactNode, React.ReactNode][]
  scaling: React.ReactNode[]
  config: { title: string; code: string }
  note: { label: string; tone?: 'signal' | 'warn' | 'good'; body: React.ReactNode }
}

const METHODS: Method[] = [
  {
    id: 'inline',
    label: 'Inline tagging',
    name: 'Inline tagging — the SGT rides in the packet',
    plane: 'Data plane',
    gist:
      'The tag travels inside the frame, in a Cisco Meta Data (CMD) header inserted after the source MAC. Nothing is signalled out of band: every hop that carries the frame carries the tag. The price is ASIC support on every hop, and a per-link configuration.',
    carries: [
      <>Ethernet — CMD on the L2 frame, hop by hop</>,
      <>MACsec — CMD sits under the encryption (<M>sap mode-list</M>)</>,
      <>IPsec and L3 crypto — CMD inside the ESP/AH payload</>,
      <>LISP / VxLAN, DMVPN and GETVPN for overlay and WAN</>,
      <><M>no propagate sgt</M> stops it on one interface only</>,
    ],
    wire: [
      [
        'Ethernet',
        <>
          EtherType <M>0x8909</M>; a <strong>16-bit SGT</strong> in the CMD payload.
          Fields: CMD EtherType, Version, Length, SGT Option Type, SGT Value
        </>,
      ],
      [
        'IPsec / L3',
        <>
          CMD uses <strong>protocol 99</strong>, inserted at the start of the{' '}
          <M>ESP</M>/<M>AH</M> payload. Version <M>0x1</M>, then the 16-bit SGT
        </>,
      ],
      [
        'VxLAN',
        <>SGT in the <strong>24-bit Nonce field</strong>; destination port <M>4341</M></>,
      ],
      [
        'Trust',
        <>
          <M>policy static sgt N trusted</M> keeps an arriving tag; without{' '}
          <M>trusted</M> the switch overwrites it with <M>N</M>
        </>,
      ],
    ],
    scaling: [
      <>Hop-by-hop: one non-capable device and the tag is gone. That is why SXP exists</>,
      <>No binding table to size and no peer count to manage</>,
      <><M>sap mode-list</M>: <M>gcm-encrypt</M>, <M>gmac</M>, <M>null</M> (CMD only), <M>no-encap</M></>,
    ],
    config: {
      title: 'IOS-XE — interface propagation',
      code: `! Trusted uplink between TrustSec switches
interface TenGigabitEthernet1/0/1
 cts manual
  policy static sgt 2 trusted
  propagate sgt
  sap pmk <hex-key> mode-list gcm-encrypt null no-encap
!
! Manual mode, dynamic peer identity
interface TenGigabitEthernet1/0/2
 cts manual
  policy dynamic identity SW-CORE-01
  propagate sgt
!
! 802.1X (NDAC) mode
interface TenGigabitEthernet1/0/3
 cts dot1x
  sap mode-list gcm-encrypt gmac no-encap null
  propagate sgt
!
! Facing a non-TrustSec device
interface GigabitEthernet1/0/10
 cts manual
  no propagate sgt`,
    },
    note: {
      label: 'On 0x8909',
      tone: 'warn',
      body: (
        <>
          <M>0x8909</M> is the EtherType given throughout Cisco TrustSec training
          material. The Catalyst 9000 configuration guides describe the CMD header
          without naming it — good design reference, not a figure to quote at a
          customer.
        </>
      ),
    },
  },

  {
    id: 'sxp',
    label: 'SXP',
    name: 'SXP — the binding table, out of band',
    plane: 'Control plane',
    gist:
      'No tag in the data plane at all. IP-to-SGT bindings are shipped over a TCP session to a peer that needs them, so a device with no tagging ASIC — or a whole region that cannot tag — still learns which address belongs to which group.',
    carries: [
      <>The <strong>IP-to-SGT binding table</strong>, not the packets</>,
      <><strong>Speaker</strong> exports, <strong>Listener</strong> imports, and a device can be <strong>both</strong></>,
      <>Typically: access switch speaks, firewall or DC switch listens</>,
      <>ISE is a first-class peer — listener from the NADs, speaker to the enforcement points</>,
    ],
    wire: [
      ['Transport', <><M>TCP 64999</M> for connection initiation</>],
      ['ISE internal', <><M>TCP 9644</M> — PSN to the SXP process on the same node</>],
      ['Authentication', <>MD5 or TCP-AO. No password by default, 32 characters maximum</>],
      [
        'Reconciliation',
        <>
          <strong>120 s</strong>, range 0–64000. On reconnect the listener holds
          learned bindings until refreshed; <M>0</M> purges immediately
        </>,
      ],
      ['Retry', <><strong>120 s</strong>, range 0–64000</>],
      ['Domains', <>Bindings are partitioned; <strong>SXP Domain Filters</strong> decide what ISE sends where</>],
    ],
    scaling: [
      <>Hierarchical: many access speakers into a few aggregators, then to the enforcement points</>,
      <>ISE as a central reflector removes the mesh entirely</>,
      <><M>mode local</M> is this device&rsquo;s role, <M>mode peer</M> the peer&rsquo;s — pick one convention</>,
    ],
    config: {
      title: 'IOS-XE — SXP, complete',
      code: `cts sxp enable
cts sxp default password 0 SxpSecret123
cts sxp default source-ip 10.1.10.1
!
cts sxp reconciliation period 120    ! default 120s, 0-64000
cts sxp retry period 120             ! default 120s, 0-64000
!
cts sxp connection peer 10.1.100.10 password default mode local speaker
cts sxp connection peer 10.1.100.10 password default mode local listener
cts sxp connection peer 10.1.100.10 password default mode local both
cts sxp connection peer 10.1.100.10 password none mode peer listener vrf MGMT
!
! Published syntax
! cts sxp connection peer <peer-ipv4> [source <src-ipv4>]
!   password {default | none} mode {local | peer}
!   {speaker | listener} [vrf <name>]`,
    },
    note: {
      label: 'ISE side',
      body: (
        <>
          <M>Work Centers &gt; TrustSec &gt; SXP &gt; SXP Devices</M> adds the
          peers. <M>Settings &gt; SXP Settings</M> holds the global password (a
          per-device password overrides it), <strong>Add radius mappings into SXP
          IP SGT mapping table</strong> and <strong>Publish SXP bindings on
          PxGrid</strong>.
        </>
      ),
    },
  },

  {
    id: 'pxgrid',
    label: 'pxGrid',
    name: 'pxGrid — publish the table to anything',
    plane: 'Control plane',
    gist:
      'ISE publishes its whole IP-to-SGT binding table and the SGT catalogue on the pxGrid bus. A subscriber that speaks neither inline tagging nor SXP — a firewall manager, an analytics platform, an IPAM — becomes SGT-aware without touching the data path.',
    carries: [
      <><M>com.cisco.ise.sxp</M> — the IP-SGT mappings</>,
      <><M>com.cisco.ise.trustsec</M> — the SGT catalogue, names and values</>,
      <><M>com.cisco.ise.config.trustsec</M> — configuration changes</>,
      <>Bindings ISE learned over SXP are republished here when <strong>Publish SXP bindings on PxGrid</strong> is ticked</>,
      <>Seen in practice: FMC, Catalyst Center, Secure Network Analytics, WSA, Infoblox</>,
    ],
    wire: [
      ['Transport', <>HTTPS and WSS on <M>TCP 8910</M></>],
      [
        'Binding format',
        <>
          <M>SXPBinding=&#123;ipPrefix=10.20.20.1/32 tag=9
          source=172.20.254.21 peerSequence=172.20.254.21&#125;</M>
        </>,
      ],
      [
        'Enable at',
        <><M>Work Centers &gt; TrustSec &gt; Settings &gt; SXP Settings</M></>,
      ],
      ['Filtering', <>ISE 3.4 filtering covers TrustSec SXP, so a subscriber can take a subset</>],
    ],
    scaling: [
      <>One bus, many consumers — no per-hop hardware, no TCP session per NAD</>,
      <>The subscriber enforces, not the network: this is the SGFW path</>,
      <>Needs the pxGrid persona, a pxGrid system certificate and mutual trust</>,
    ],
    config: {
      title: 'ISE — publish bindings, and what a subscriber gets',
      code: `! Work Centers > TrustSec > Settings > SXP Settings
[x] Publish SXP bindings on PxGrid
[x] Add radius mappings into SXP IP SGT mapping table
    Global Password : ********  (overridden per device)

! What lands on the bus
SXPBinding= {ipPrefix=10.20.20.1/32 tag=9
             source=172.20.254.21 peerSequence=172.20.254.21}

! Services a TrustSec subscriber looks up
com.cisco.ise.sxp              ! IP-SGT mappings
com.cisco.ise.trustsec         ! SGT catalogue
com.cisco.ise.config.trustsec  ! config changes

wss://<pxgrid-node-fqdn>:8910/pxgrid/ise/pubsub`,
    },
    note: {
      label: 'Not a substitute for enforcement',
      body: (
        <>
          pxGrid gives a subscriber <em>knowledge</em> of the bindings. Nothing on
          the bus drops a packet. Use it to reach systems SXP cannot, not to
          replace SXP on devices that support it.
        </>
      ),
    },
  },
]

// ------------------------------------------------------------
// Egress matrix — the workbook's Production Matrix, verbatim
// ------------------------------------------------------------

const MX_COLS = [
  'Employees 4',
  'Contractors 5',
  'Development_Ser… 12',
  'PCI_Servers 14',
  'Point_of_Sale_S… 10',
]
const MX_ROWS = ['Employees 4', 'Contractors 5']
const MX_CELLS: { label: string; tone: 'permit' | 'deny' | 'limit' }[][] = [
  [
    { label: 'MalwareBlock', tone: 'limit' },
    { label: 'MalwareBlock', tone: 'limit' },
    { label: 'Permit IP', tone: 'permit' },
    { label: 'Deny IP', tone: 'deny' },
    { label: 'Permit IP', tone: 'permit' },
  ],
  [
    { label: 'MalwareBlock', tone: 'limit' },
    { label: 'MalwareBlock', tone: 'limit' },
    { label: 'Deny IP', tone: 'deny' },
    { label: 'Deny IP', tone: 'deny' },
    { label: 'Deny IP', tone: 'deny' },
  ],
]

export default function TrustsecSheet() {
  const [mid, setMid] = useState<PropId>('inline')
  const m = METHODS.find(x => x.id === mid) ?? METHODS[0]

  return (
    <Sheet>
      {/* ---------------- the three pillars ---------------- */}
      <Panel title="The three pillars" kicker="Group-Based Policy" span={3}>
        <Stack gap={6}>
          <Prose>
            TrustSec — Cisco Group-Based Policy since about 2021 — takes the IP
            address out of the policy. An endpoint is{' '}
            <strong>classified</strong> with a Security Group Tag, the tag is{' '}
            <strong>propagated</strong>, and an <strong>enforcement</strong> point
            applies an SGACL to the (source SGT, destination SGT) pair.
          </Prose>

          <Flow
            steps={[
              { label: 'Classify', tone: 'signal' },
              { label: 'Propagate' },
              { label: 'Enforce' },
            ]}
          />

          <KV
            items={[
              ['SGT', <>A 16-bit value. ISE names it and can reserve a range</>],
              [
                'Assigned by',
                <>ISE — <M>cisco-av-pair = cts:security-group-tag=&lt;hex&gt;</M> in the Access-Accept</>,
              ],
              [
                'Enforced at',
                <>Egress, on the pair. SGACLs are <strong>stateless</strong> and carry no IP addresses</>,
              ],
              [
                'SGFW',
                <>The alternative: SGT as a match object in a ZBFW class-map or a Secure Firewall rule</>,
              ],
            ]}
            labelWidth={58}
          />

          <Note label="The half people forget">
            Enforcement needs the <strong>destination</strong> SGT at the
            enforcement point, not just the source. Perfect classification that
            never gets the server-side bindings to the DC switch enforces nothing.
          </Note>
        </Stack>
      </Panel>

      {/* ---------------- classification ---------------- */}
      <Panel title="Classification" kicker="Dynamic vs static" span={4} tone="signal">
        <Stack gap={6}>
          <Split
            parts={[
              {
                title: 'Dynamic — ISE decides',
                children: (
                  <Bullets
                    items={[
                      <><strong>802.1X</strong> — the user or the machine</>,
                      <><strong>MAB</strong> — printers, cameras, OT</>,
                      <><strong>WebAuth</strong> — guests, contractors</>,
                      <><strong>VPN</strong> — remote-access sessions</>,
                      <>A <strong>CoA</strong> updates the tag when the policy changes</>,
                    ]}
                  />
                ),
              },
              {
                title: 'Static — you decide',
                children: (
                  <Bullets
                    items={[
                      <><strong>L3 interface (SVI)</strong> — core</>,
                      <><strong>L2 port</strong> — DC access</>,
                      <><strong>VLAN</strong> — whole segments</>,
                      <><strong>Subnet</strong> — server ranges</>,
                      <><strong>VM port-profile</strong> — hypervisor switch</>,
                    ]}
                  />
                ),
              },
            ]}
          />

          <Code
            title="IOS-XE — every static mapping form"
            code={`cts sgt 2                                    ! the device's own SGT
cts role-based sgt-map 10.1.50.25 sgt 10             ! host
cts role-based sgt-map 10.1.50.0/24 sgt 10           ! subnet
cts role-based sgt-map 2001:db8:1::/64 sgt 10        ! IPv6
cts role-based sgt-map vlan-list 100,110-115 sgt 20  ! VLAN
cts role-based sgt-map interface Gi1/0/5 sgt 30      ! L3 interface
cts role-based sgt-map interface Gi1/0/5 security-group Contractors
cts role-based sgt-map 0.0.0.0/0 sgt 4               ! catch-all
!
interface GigabitEthernet1/0/9                       ! L2 port-to-SGT
 cts manual
  policy static sgt 30`}
          />

          <Note label="Where the SGT is attached in ISE">
            Define at <M>Work Centers &gt; TrustSec &gt; Components &gt; Security Groups</M>;
            attach under an authorization profile&rsquo;s{' '}
            <strong>Common Tasks &gt; Security Group</strong>, or directly in the
            Security Groups column of an authorization rule.
          </Note>
        </Stack>
      </Panel>

      {/* ---------------- egress matrix ---------------- */}
      <Panel title="Egress Policy Matrix" kicker="Production matrix · 69 cells" span={5}>
        <Stack gap={6}>
          <Prose>
            <M>Work Centers &gt; TrustSec &gt; TrustSec Policy &gt; Egress Policy</M>{' '}
            — one dataset, three views: <strong>Matrix</strong>,{' '}
            <strong>Source Tree</strong>, <strong>Destination Tree</strong>.
          </Prose>

          <Matrix cols={MX_COLS} rows={MX_ROWS} cell={(r, c) => MX_CELLS[r][c]} />

          <div className="grid grid-cols-2 gap-3">
            <Split
              cols={1}
              parts={[
                {
                  title: 'What a cell holds',
                  children: (
                    <Bullets
                      items={[
                        <><strong>Status</strong> — Enabled, Disabled, Monitor</>,
                        <><strong>SGACLs</strong> — an ordered list</>,
                        <><strong>Final Catch All Rule</strong> — None, Permit IP, Deny IP, or either with log</>,
                      ]}
                    />
                  ),
                },
              ]}
            />
            <Split
              cols={1}
              parts={[
                {
                  title: 'Default, monitor, staging',
                  children: (
                    <Bullets
                      items={[
                        <><strong>Default</strong> — the ANY→ANY cell. Start at Permit IP, tighten later</>,
                        <><strong>Monitor</strong> — per cell or Monitor All. Evaluated and counted, not enforced</>,
                        <><strong>Staging matrix</strong> — a copy on a subset of devices, then promoted to Production</>,
                      ]}
                    />
                  ),
                },
              ]}
            />
          </div>

          <Note label="Roll it out in monitor mode or not at all" tone="warn">
            <M>cts role-based monitor all</M>, then read{' '}
            <M>show cts role-based counters</M> for the denies that <em>would</em>{' '}
            have happened. Enabling cells straight into a Deny IP default
            black-holes everything you forgot.
          </Note>
        </Stack>
      </Panel>

      {/* ---------------- PROPAGATION EXPLORER ---------------- */}
      <Panel
        title="Propagation explorer"
        span={12}
        tone="ink"
        right={
          <span className="normal-case tracking-normal">
            Getting the tag from where it was assigned to where it is enforced
          </span>
        }
      >
        <Stack gap={8}>
          <div className="flex items-center justify-between gap-4">
            <Selector
              options={METHODS.map(x => ({ id: x.id, label: x.label, hint: x.gist }))}
              value={mid}
              onChange={setMid}
            />
            <Pill tone={m.plane === 'Data plane' ? 'bad' : 'good'}>
              {m.plane === 'Data plane'
                ? 'Data plane — tag in the packet'
                : 'Control plane — no tag in the packet'}
            </Pill>
          </div>

          <div className="border-t border-ink-200 pt-2">
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-4">
                <h4
                  className="text-[12px] font-bold tracking-tight text-ink-950"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  {m.name}
                </h4>
                <div className="mt-1">
                  <Prose>{m.gist}</Prose>
                </div>
                <div className="mt-2">
                  <div
                    className="mb-1 border-b border-ink-300 pb-[2px] text-[9px] font-bold uppercase tracking-[0.11em] text-ink-950"
                    style={{ fontFamily: 'var(--font-heading)' }}
                  >
                    What it carries, and where
                  </div>
                  <Bullets items={m.carries} />
                </div>
                <div className="mt-2">
                  <Note label={m.note.label} tone={m.note.tone}>
                    {m.note.body}
                  </Note>
                </div>
              </div>

              <div className="col-span-3">
                <div
                  className="mb-1 border-b border-ink-300 pb-[2px] text-[9px] font-bold uppercase tracking-[0.11em] text-ink-950"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  Wire format, ports, timers
                </div>
                <KV items={m.wire} labelWidth={72} />
                <div className="mt-2">
                  <div
                    className="mb-1 border-b border-ink-300 pb-[2px] text-[9px] font-bold uppercase tracking-[0.11em] text-ink-950"
                    style={{ fontFamily: 'var(--font-heading)' }}
                  >
                    Scaling and topology
                  </div>
                  <Bullets items={m.scaling} />
                </div>
              </div>

              <div className="col-span-5">
                <Code title={m.config.title} code={m.config.code} />
              </div>
            </div>
          </div>
        </Stack>
      </Panel>

      {/* ---------------- seed device ---------------- */}
      <Panel title="The cts block on a seed device" kicker="PAC-based" span={4}>
        <Stack gap={5}>
          <Code
            title="IOS-XE — AAA, credentials, enforcement"
            code={`aaa new-model
!
radius server ISE-PSN-1
 address ipv4 10.1.100.10 auth-port 1812 acct-port 1813
 pac key SuperSecret123        ! plain "key" if PAC-less
!
aaa group server radius ISE-TRUSTSEC
 server name ISE-PSN-1
 ip radius source-interface Vlan10
!
aaa authorization network cts-mlist group ISE-TRUSTSEC
cts authorization list cts-mlist
!
cts role-based enforcement
cts role-based enforcement vlan-list 10-20,100
cts role-based counters enable
cts sgt 2
!
! privileged EXEC — writes the keystore, triggers PAC
! provisioning over EAP-FAST phase 0
Switch# cts credentials id SW-ACCESS-01 password SuperSecret123`}
          />
          <Note label="PAC-less from ISE 3.4" tone="good">
            The only CLI difference is a plain <M>key</M> instead of <M>pac key</M>.
            The <strong>Device ID</strong> and password must match{' '}
            <M>Network Devices &gt; Advanced TrustSec Settings</M> — case-sensitive,
            32 characters maximum.
          </Note>
        </Stack>
      </Panel>

      {/* ---------------- SGACL ---------------- */}
      <Panel title="SGACLs — MalwareBlock" kicker="Contain lateral movement" span={4} tone="quiet">
        <Stack gap={5}>
          <Code
            title="Security Group ACLs > MalwareBlock — IP version: Agnostic"
            code={`deny icmp
deny udp src dst eq domain
deny tcp src dst eq 3389
deny tcp src dst eq 1433
deny tcp src dst eq 1521
deny tcp src dst eq 445
deny tcp src dst eq 137
deny tcp src dst eq 138
deny tcp src dst eq 139
deny udp src dst eq snmp
deny tcp src dst eq telnet
deny tcp src dst eq www
deny tcp src dst eq 443
deny tcp src dst eq 22
deny tcp src dst eq pop3
deny tcp src dst eq 123
permit ip`}
          />
          <Prose>
            A deny-list for the ports lateral movement uses — RDP, MS-SQL, Oracle,
            SMB, NetBIOS, DNS, SNMP, telnet, web, SSH, POP3, NTP — ending in{' '}
            <M>permit ip</M> so everything else flows. In the matrix above it sits
            on Employees→Employees and Contractors→Contractors.
          </Prose>
          <KV
            items={[
              ['Write it at', <M>Work Centers &gt; TrustSec &gt; Components &gt; Security Group ACLs</M>],
              ['Bind it at', <M>TrustSec Policy &gt; Egress Policy &gt; Matrix</M>, ],
              ['Per device', <M>Administration &gt; Network Resources &gt; Network Devices &gt; Advanced TrustSec Settings</M>],
            ]}
            labelWidth={54}
          />
        </Stack>
      </Panel>

      {/* ---------------- verify ---------------- */}
      <Panel title="Verify, refresh, enforce" span={4}>
        <Stack gap={5}>
          <Code
            title="show cts — the ones worth remembering"
            code={`show cts credentials              ! device ID
show cts environment-data         ! SGT name table, servers, lifetime
show cts interface brief          ! propagate sgt, per link
show cts role-based sgt-map all   ! bindings, and how they were learned
show cts role-based permissions   ! the matrix as downloaded
show cts role-based counters      ! what monitor mode is telling you
show cts sxp connections brief
!
cts refresh environment-data
cts refresh policy
cts refresh pac`}
          />
          <Code
            title="Binding SGACLs to cells on the switch"
            code={`ip access-list role-based PERMIT_WEB
 permit tcp dst eq 443
 deny ip log
!
cts role-based permissions from 10 to 20 ipv4 PERMIT_WEB
cts role-based permissions from unknown to 20 ipv4 DENY_ALL_LOG
cts role-based permissions default ipv4 PERMIT_ALL`}
          />
          <Note label="The one that bites on wireless" tone="warn">
            Deny Unknown→Unknown before clients are classified and DHCP itself
            breaks — an APIPA address and an SGT of zero. Permit DHCP and DNS
            explicitly, and treat the Unknown row and column with more care than any
            other cell.
          </Note>
        </Stack>
      </Panel>
    </Sheet>
  )
}
