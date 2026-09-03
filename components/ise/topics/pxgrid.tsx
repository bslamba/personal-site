'use client'

// ============================================================
// Topic — pxGrid & Integrations
//
// pxGrid is a context bus, not an access-control path. The
// interactive panel walks the four integrations that matter —
// FMC, Catalyst Center, Secure Network Analytics and a generic
// subscriber — with the real GUI paths and the certificate
// exchange each one needs.
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
  Code,
  Steps,
  Pill,
  M,
  Split,
  Ladder,
  Selector,
} from '../sheet-kit'

// ------------------------------------------------------------
// Integrations
// ------------------------------------------------------------

type IntId = 'fmc' | 'dnac' | 'sna' | 'generic'

interface Integration {
  id: IntId
  label: string
  name: string
  direction: string
  gist: string
  steps: React.ReactNode[]
  facts: [React.ReactNode, React.ReactNode][]
  config: { title: string; code: string }
  note: { label: string; tone?: 'signal' | 'warn' | 'good'; body: React.ReactNode }
}

const INTEGRATIONS: Integration[] = [
  {
    id: 'fmc',
    label: 'Secure Firewall (FMC)',
    name: 'Cisco Secure Firewall Management Center',
    direction: 'ISE publishes · FMC subscribes',
    gist:
      'FMC subscribes to the Session Directory and the SXP topic so access rules can match Users and Security Group Tags instead of addresses. The workbook has this in two variants; they differ in exactly one place — what goes in the two CA fields.',
    steps: [
      <>ISE: enable the <strong>pxGrid persona</strong>; confirm a System Certificate carries the <strong>pxGrid</strong> usage.</>,
      <>ISE: <M>Administration &gt; pxGrid Services &gt; Certificates</M> — generate a single certificate without a CSR. Friendly CN, template <M>PxGrid_Certificate_Template</M>, real FQDN and IP in the SAN. Download PEM plus the root chain.</>,
      <>FMC: import the two CAs as trusted CAs, and the client certificate and key as an internal certificate (<em>Add Known Internal Certificate</em>, ticking <strong>Encrypted</strong>).</>,
      <>FMC: <M>System &gt; Integration &gt; Identity Sources</M> — Service Type <strong>Identity Services Engine</strong>, fill the fields, click <strong>Test</strong>.</>,
      <>ISE: approve the pending clients — normally <strong>two</strong>, one for the test and one for the ISE agent.</>,
      <>FMC: <strong>Save</strong>, add an Identity Policy with a passive-authentication rule, then write rules on Users and SGTs.</>,
    ],
    facts: [
      ['pxGrid Server CA', <>The CA that signed ISE&rsquo;s pxGrid certificate</>],
      ['MNT Server CA', <>The CA that signed the MnT admin certificate — used for the bulk session download</>],
      [
        'FMC certificate',
        <>An FMC internal certificate <strong>with its key</strong>. Needs <M>clientAuth</M> EKU, or no EKU</>,
      ],
      ['Network filter', <>Blank means any; otherwise IPv4 CIDR blocks, comma separated</>],
      ['HA', <>FMC round-robins between the two configured ISE hosts until one accepts</>],
    ],
    config: {
      title: 'FMC > System > Integration > Identity Sources',
      code: `--- Variant 1: ISE is the CA ------------------------
Service Type             : Identity Services Engine
Primary Host Name/IP   * : 10.31.126.217
pxGrid Server CA       * : ISE-Root-Cert
MNT Server CA          * : ISE-MnT-Cert
FMC Server Certificate * : admin
ISE Network Filter       : (blank = any)  ex. 10.89.31.0/24

--- Variant 2: an external (Microsoft) CA -----------
Primary Host Name/IP   * : ise24fs1.lab10.com
pxGrid Server CA       * : MS_External_Root_Certicate
MNT Server CA          * : MS_External_Root_Certicate
FMC Server Certificate * : FMC2

! Both CA fields point at the SAME external root:
! one CA signed both the pxGrid and the MnT certificate.`,
    },
    note: {
      label: 'Four things that break this',
      tone: 'warn',
      body: (
        <>
          Clocks out of sync cause user timeouts at random intervals. Two FMCs
          sharing a hostname drop each other&rsquo;s connection. Unapproved clients
          make <strong>Test</strong> fail. And FMC receives no Guest Services user
          data and does no IPv6 filtering.
        </>
      ),
    },
  },

  {
    id: 'dnac',
    label: 'Catalyst Center',
    name: 'Cisco Catalyst Center (formerly DNA Center)',
    direction: 'Bidirectional · pxGrid + ERS',
    gist:
      'The deepest of the four. Catalyst Center bulk-downloads the security-group topics over pxGrid, syncs scalable groups and group-based policy both ways, and separately drives ISE’s ERS API to configure network devices as RADIUS clients.',
    steps: [
      <>ISE: enable the <strong>pxGrid persona</strong> — on non-admin nodes in a distributed deployment.</>,
      <>ISE: <M>Administration &gt; pxGrid Services &gt; Settings</M> — tick <strong>Automatically approve new certificate-based accounts</strong> and <strong>Allow password based account creation</strong>.</>,
      <>ISE: <M>Administration &gt; System &gt; Settings &gt; ERS Settings</M> — <strong>ERS Read/Write</strong>, and ERS for Read on secondaries. Create an <strong>ERS Admin</strong> account.</>,
      <>Catalyst Center: <M>System &gt; Settings &gt; External Services &gt; Authentication and Policy Servers &gt; Add</M> → ISE. PAN IP and FQDN, RADIUS shared secret, ERS credentials, subscriber name.</>,
      <>It then connects, accepts the ISE certificates, discovers the nodes, fetches local certificates and activates the pxGrid client.</>,
      <>Verify: the server reads <strong>Active</strong>, System 360 lists ISE as Available, and the subscribers are <strong>Enabled</strong> in ISE.</>,
    ],
    facts: [
      ['pxGrid', <><M>TCP 8910</M> — security-group topics and bulk download</>],
      ['ERS', <><M>TCP 9060</M>, and <M>TCP 9062</M> for certificate-based ERS</>],
      ['FQDN', <>Mandatory — an IP alone fails certificate validation</>],
      ['Cluster SAN', <>With enterprise certificates, the SAN needs the <strong>VIP and the real IPs</strong></>],
      ['Path', <>No proxy. ISE 3.3+ is API-only — CLI credentials are no longer used</>],
    ],
    config: {
      title: 'Catalyst Center — Authentication and Policy Servers',
      code: `Server IP Address   : <ISE Primary Admin node IP>
FQDN                : ise-pan.example.com
Shared Secret       : <RADIUS secret pushed to the switches>
Username / Password : <ISE ERS Admin credentials>
Subscriber Name     : catalyst-center
Advanced            : protocol, ports, retries, timeout

! On the ISE side first
Administration > System > Deployment > node > Edit > pxGrid [x]
Administration > pxGrid Services > Settings
    [x] Automatically approve new certificate-based accounts
    [x] Allow password based account creation
Administration > System > Settings > ERS Settings > Read/Write`,
    },
    note: {
      label: 'Auto-approve is the exception here',
      body: (
        <>
          Catalyst Center creates several pxGrid clients — one per service — so
          Cisco has you enable auto-approval for this integration. That is a
          deliberate exception. Leave it <strong>off</strong> everywhere else.
        </>
      ),
    },
  },

  {
    id: 'sna',
    label: 'Secure Network Analytics',
    name: 'Cisco Secure Network Analytics (Stealthwatch)',
    direction: 'ISE publishes · SNA sends ANC back',
    gist:
      'The one that routinely pushes back. SNA subscribes to the Session Directory so NetFlow host records carry a username, a device type and an SGT — and when a detection fires it calls ISE over pxGrid to apply an ANC policy, which quarantines the host by CoA.',
    steps: [
      <>ISE: pxGrid persona on, pxGrid system certificate present.</>,
      <>ISE: issue the SNA client certificate from the pxGrid Certificates page, or import the Manager&rsquo;s CA into Trusted Certificates with <strong>Trust for authentication within ISE</strong>.</>,
      <>ISE: <M>Operations &gt; Adaptive Network Control &gt; Policy List</M> — create <M>Quarantine</M> with action <strong>Quarantine</strong>.</>,
      <>ISE: create the restrictive authorization profile (Cisco&rsquo;s example uses <M>DenyAccess</M>), then an authorization <strong>exception</strong> on <M>Session:ANCPolicy EQUALS Quarantine</M>.</>,
      <>SNA Manager: add the ISE cluster — name, certificate, pxGrid node addresses, client certificate. Approve the client in ISE.</>,
      <>SNA Manager: build the Custom Security Event, then a <strong>Response Management</strong> action that applies the ANC policy.</>,
    ],
    facts: [
      ['SNA gets', <>The Session Directory — identity and SGT attached to flow records</>],
      ['ISE gets', <>ANC policy assignments, the endpoint named by MAC or IP</>],
      ['ANC group', <>The client must be in the <strong>ANC</strong> group. Being Enabled is not enough</>],
      ['Licence', <>ANC needs <strong>Advantage</strong>, and an active session with a MAC, IP or session ID</>],
      ['Manual use', <>An analyst can apply and clear the policy from a host report page</>],
    ],
    config: {
      title: 'ISE side — what SNA drives',
      code: `Operations > Adaptive Network Control > Policy List
    Name   : Quarantine
    Action : Quarantine

Policy > Policy Sets > [set] > Authorization Policy > Exceptions
    If   Session:ANCPolicy EQUALS Quarantine
    Then DenyAccess    (or a quarantine dACL / VLAN / SGT)

Operations > Adaptive Network Control > Endpoint Assignment
    -> by IP or MAC, or over pxGrid: com.cisco.ise.config.anc

Administration > pxGrid Services > Client Management > Groups
    -> put the SNA client in the ANC group`,
    },
    note: {
      label: 'Breadcrumbs move',
      tone: 'warn',
      body: (
        <>
          The Manager-side ISE configuration page has moved between SNA releases
          and Cisco&rsquo;s own tech notes disagree. Take the path from the{' '}
          <em>Secure Network Analytics ISE and ISE-PIC Configuration Guide</em> for
          your version.
        </>
      ),
    },
  },

  {
    id: 'generic',
    label: 'Third-party subscriber',
    name: 'A generic pxGrid 2.0 subscriber',
    direction: 'ISE publishes · anything subscribes',
    gist:
      'Everything above is a special case of this. A subscriber authenticates with a certificate, gets approved, looks the service up, takes an access secret for the node it will use, then queries REST or opens a WebSocket and subscribes.',
    steps: [
      <>ISE: pxGrid persona on; a System Certificate with the pxGrid usage.</>,
      <>Choose the trust model. <strong>ISE as CA</strong>: generate the client certificate and take the root chain. <strong>External CA</strong>: import the client&rsquo;s CA with <em>Trust for authentication within ISE</em>, and make the client trust ISE&rsquo;s.</>,
      <>Leave auto-approval off. Client: <M>AccountActivate</M>, polling until <strong>ENABLED</strong>.</>,
      <>ISE: approve at <M>Client Management &gt; Clients</M>, then authorize by adding the client to a <strong>Group</strong> — Session, TrustSec, ANC, MDM, RADIUS, Basic — and check <strong>pxGrid Policy</strong> permits it.</>,
      <>Client: <M>ServiceLookup</M>, then <M>AccessSecret</M> for the chosen node.</>,
      <>Client: REST-query the <M>restBaseUrl</M>, or open the <M>wsUrl</M> and STOMP-SUBSCRIBE. Verify at <M>pxGrid Services &gt; Diagnostics</M>.</>,
    ],
    facts: [
      ['Port', <><M>TCP 8910</M> — both the REST control plane and the WebSocket</>],
      ['Auth', <>Certificate SSL context (recommended), or username/password via <M>AccountCreate</M></>],
      ['Account states', <><strong>PENDING</strong> → <strong>ENABLED</strong>, and <strong>DISABLED</strong></>],
      ['STOMP verbs', <>CONNECT, DISCONNECT, SUBSCRIBE, UNSUBSCRIBE, SEND, MESSAGE, ERROR</>],
      ['Loss detection', <>Sequence IDs let a subscriber spot a gap and recover. pxGrid 2.0 only, on by default</>],
    ],
    config: {
      title: 'The control flow, and where each call lands',
      code: `1. Create SSL context (cert) -or- AccountCreate (password)
2. AccountActivate      -> poll until state == ENABLED
3. ServiceLookup        -> node names, topic, restBaseUrl
4. AccessSecret         -> per-peer secret for that node
5. REST query  or  WebSocket SUBSCRIBE

https://<pxgrid-node-fqdn>:8910/pxgrid/control/...
https://<pxgrid-node-fqdn>:8910/pxgrid/mnt/sd     (bulk)
wss://<pxgrid-node-fqdn>:8910/pxgrid/ise/pubsub   (push)

! Control-plane operations
ServiceLookup · ServiceRegister · ServiceReregister
ServiceUnregister · AccessSecret · Authorization`,
    },
    note: {
      label: 'Approval is not authorization',
      body: (
        <>
          An ENABLED client can still be refused every topic it asks for. The{' '}
          <strong>Group</strong> and the <strong>pxGrid Policy</strong> decide what
          it may consume. A client that connects cleanly and receives nothing is
          nearly always in the wrong group.
        </>
      ),
    },
  },
]

export default function PxgridSheet() {
  const [iid, setIid] = useState<IntId>('fmc')
  const it = INTEGRATIONS.find(x => x.id === iid) ?? INTEGRATIONS[0]

  return (
    <Sheet>
      {/* ---------------- what it is ---------------- */}
      <Panel title="What pxGrid is" kicker="A context bus" span={3}>
        <Stack gap={6}>
          <Prose>
            A publish/subscribe context bus — a protocol framework defining the
            control mechanisms for machine-to-machine communication, with the
            control plane separated from the data transport. It shares what ISE
            knows. It is <strong>not</strong> in the access-control path.
          </Prose>

          <KV
            items={[
              ['Controller', <>ISE. Creates the instance of the Grid</>],
              ['Client', <>Publishes to, subscribes to and queries topics</>],
              ['Publisher', <>A client that sends data to the controller</>],
              ['Subscriber', <>A client that reads information from topics</>],
              [
                'Persona',
                <>
                  <M>Administration &gt; System &gt; Deployment &gt; node &gt; Edit &gt; pxGrid</M>{' '}
                  — non-admin nodes preferred, up to four
                </>,
              ],
            ]}
            labelWidth={62}
          />

          <Split
            cols={1}
            parts={[
              {
                title: 'The four scenarios',
                children: (
                  <Bullets
                    items={[
                      <><strong>Context to partner</strong> — ISE makes a platform user, device and network aware</>,
                      <><strong>Enrich ISE context</strong> — a partner feeds ISE back</>,
                      <><strong>Threat mitigation</strong> — the partner asks, ISE enforces</>,
                      <><strong>Context brokerage</strong> — ISE brokers two partners (ISE 2.2)</>,
                    ]}
                  />
                ),
              },
            ]}
          />
        </Stack>
      </Panel>

      {/* ---------------- 1.0 vs 2.0 ---------------- */}
      <Panel title="pxGrid 1.0 versus 2.0" kicker="XMPP → STOMP over WebSockets" span={5} tone="signal">
        <Stack gap={6}>
          <Table
            head={['', 'pxGrid 1.0', 'pxGrid 2.0']}
            widths={['15%', '42%', '43%']}
            rows={[
              [
                'Transport',
                <>A modified <strong>XCP</strong> (Extensible Communication Platform), designed on XMPP, RFC 6120 — XML streamed between devices</>,
                <><strong>STOMP over WebSockets</strong>, i.e. full-duplex HTTP, for push; REST for control, query and bulk</>,
              ],
              ['HA model', <><strong>Active / Standby</strong></>, <><strong>Active / Active</strong></>],
              [
                'Nodes',
                <>Maximum <strong>2</strong> — one active, one standby</>,
                <>Two recommended, up to <strong>4</strong> when large</>,
              ],
              [
                'Ports',
                <><M>TCP 5222</M> subscriber; <M>TCP 8910</M> bulk download</>,
                <><M>TCP 8910</M> for all REST and WebSocket traffic</>,
              ],
              [
                'Logs',
                <>Five: <M>pxgrid-cm</M>, <M>-jabberd</M>, <M>-pubsub</M>, <M>-controller</M>, <M>-install</M></>,
                <>One: <M>pxgrid-server</M></>,
              ],
              [
                'Health',
                <>XMPP presence · 8 topics</>,
                <><strong>Ping-pong</strong> keepalive spots offline, slow or faulty clients · 10 topics</>,
              ],
              [
                'Status',
                <>Introduced early; now <strong>removed</strong> — all GUI and CLI references gone, XMPP integrations no longer function</>,
                <>ISE <strong>2.3</strong>, supported from <strong>2.4</strong>; the only version from <strong>3.1</strong> on</>,
              ],
            ]}
          />
          <Split
            parts={[
              {
                title: 'pxGrid 1.0 topics',
                children: (
                  <Bullets
                    cols={2}
                    items={[
                      'SessionDirectory',
                      'EndpointProfilerMetaData',
                      'TrustsecMetaData',
                      'EndpointProtectionCapability',
                      'AdaptiveNetworkControl',
                      'MDM_Offline Topic',
                      'Identity',
                      'SXP',
                    ]}
                  />
                ),
              },
              {
                title: 'pxGrid 2.0 topics',
                children: (
                  <Bullets
                    cols={2}
                    items={[
                      'SessionDirectory',
                      'RadiusFailure',
                      'Profiler Configuration',
                      'System Health',
                      'MDM',
                      'ANC Status',
                      'TrustSec',
                      'TrustSec Configuration',
                      'TrustSec SXP',
                      'Endpoint Assessment',
                    ]}
                  />
                ),
              },
            ]}
          />
        </Stack>
      </Panel>

      {/* ---------------- the ladder ---------------- */}
      <Panel title="A subscriber connecting" kicker="From the client transaction log" span={4}>
        <Ladder
          actors={['pxGrid client', 'Controller · REST 8910', 'Pubsub · WSS 8910']}
          steps={[
            { from: 0, to: 1, label: 'Account Activate Request {}', tone: 'signal' },
            {
              from: 1,
              to: 0,
              label: 'Account Activate Response — Account State: Enabled',
              sub: 'pxGrid controller version 2.0.0.13',
            },
            { from: 0, to: 1, label: 'ServiceLookup "com.cisco.ise.session"' },
            {
              from: 1,
              to: 0,
              label: 'nodeName: ise24fc3.lab10.com, ise24fc5.lab10.com',
              sub: '/topic/com.cisco.ise.session · restBaseURL https://…:8910/pxgrid/mnt/sd',
            },
            { from: 0, to: 1, label: 'ServiceLookup "com.cisco.ise.pubsub"' },
            {
              from: 1,
              to: 0,
              label: 'wsUrl wss://pxgrid1.lab10.com:8910/pxgrid/ise/pubsub',
              sub: 'both active nodes returned',
            },
            {
              from: 0,
              to: 1,
              label: 'AccessSecret peerNodeName=ise-pubsub-ise24fc3',
              sub: 'response {"secret":"PgphDj0UkwsvalCb"}',
              tone: 'signal',
            },
            { from: 0, to: 2, label: 'WS onOpen · STOMP CONNECT host=ise24fc3.lab10.com' },
            { from: 0, to: 2, label: 'STOMP SUBSCRIBE topic=/topic/com.cisco.ise.session' },
            { from: 2, to: 0, label: 'STOMP CONNECTED version=1.2', tone: 'signal' },
          ]}
        />
        <div className="mt-1.5">
          <Note label="Read the lookup response">
            It lists <strong>every active pxGrid node</strong> — that is what makes
            Active/Active work. The client connects to the pubsub service of the
            least loaded one and takes an access secret for that specific peer. A
            client hard-coded to one node throws the resilience away.
          </Note>
        </div>
      </Panel>

      {/* ---------------- INTEGRATION EXPLORER ---------------- */}
      <Panel
        title="Integration explorer"
        span={12}
        tone="ink"
        right={
          <span className="normal-case tracking-normal">
            Pick a subscriber — procedure, certificates, GUI paths
          </span>
        }
      >
        <Stack gap={8}>
          <div className="flex items-center justify-between gap-4">
            <Selector
              options={INTEGRATIONS.map(x => ({ id: x.id, label: x.label, hint: x.gist }))}
              value={iid}
              onChange={setIid}
            />
            <Pill tone="neutral">{it.direction}</Pill>
          </div>

          <div className="border-t border-ink-200 pt-2">
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-5">
                <h4
                  className="text-[12px] font-bold tracking-tight text-ink-950"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  {it.name}
                </h4>
                <div className="mt-1">
                  <Prose>{it.gist}</Prose>
                </div>
                <div className="mt-2">
                  <div
                    className="mb-1 border-b border-ink-300 pb-[2px] text-[9px] font-bold uppercase tracking-[0.11em] text-ink-950"
                    style={{ fontFamily: 'var(--font-heading)' }}
                  >
                    Procedure
                  </div>
                  <Steps items={it.steps} />
                </div>
              </div>

              <div className="col-span-3">
                <div
                  className="mb-1 border-b border-ink-300 pb-[2px] text-[9px] font-bold uppercase tracking-[0.11em] text-ink-950"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  Certificates, ports, rules
                </div>
                <KV items={it.facts} labelWidth={74} />
                <div className="mt-2">
                  <Note label={it.note.label} tone={it.note.tone}>
                    {it.note.body}
                  </Note>
                </div>
              </div>

              <div className="col-span-4">
                <Code title={it.config.title} code={it.config.code} />
              </div>
            </div>
          </div>
        </Stack>
      </Panel>

      {/* ---------------- topics ---------------- */}
      <Panel title="What ISE publishes" kicker="Reversed-domain service names" span={4}>
        <Table
          head={['Service', 'What it carries']}
          widths={['44%', '56%']}
          rows={[
            [<M key="s">com.cisco.ise.session</M>, 'Session Directory — identity, MAC, IPs, NAD and port or SSID, posture, profile, SGT, state'],
            [<M key="x">com.cisco.ise.sxp</M>, 'The IP-to-SGT binding table'],
            [<M key="t">com.cisco.ise.trustsec</M>, 'The SGT catalogue — definitions and values'],
            [<M key="ct">com.cisco.ise.config.trustsec</M>, 'TrustSec configuration changes'],
            [<M key="e">com.cisco.ise.endpoint</M>, 'Endpoint profiles and asset data'],
            [<M key="cp">com.cisco.ise.config.profiler</M>, 'The profiler hierarchy'],
            [<M key="r">com.cisco.ise.radius</M>, 'RADIUS data, including the failure topic'],
            [<M key="m">com.cisco.ise.mdm</M>, 'MDM compliance state per endpoint'],
            [<M key="ca">com.cisco.ise.config.anc</M>, 'ANC policies and assignments; status on the anc topic'],
            [<M key="sy">com.cisco.ise.system</M>, 'Node health and state'],
            [<M key="p">com.cisco.ise.pubsub</M>, 'The publish/subscribe infrastructure itself'],
          ]}
        />
      </Panel>

      {/* ---------------- certificates ---------------- */}
      <Panel title="Certificates and approval" kicker="The half that fails" span={4} tone="quiet">
        <Stack gap={5}>
          <Code
            title="Administration > pxGrid Services > Certificates"
            code={`I want to *          : Generate a single certificate
                       (without a certificate signing request)
Common Name (CN) *   : pxGrid-atw-fmc.securitydemo.net
Certificate Template : PxGrid_Certificate_Template
Subject Alt Name     : FQDN  pxGrid-atw-fmc.securitydemo.net
Subject Alt Name     : FQDN  atw-fmc.securitydemo.net
Subject Alt Name     : IP    10.1.100.13
Download Format *    : PEM, key in PKCS8 PEM (incl. chain)
Certificate Password : ********

! Also on this page
Generate a single certificate (with a CSR)
Generate bulk certificates (from CSV)
Download Root Certificate Chain`}
          />
          <Bullets
            items={[
              <>A <strong>friendly CN</strong> prefixed <M>pxGrid</M>, so the client is identifiable in the Clients list</>,
              <>The template is hard-coded and carries <strong>client and server EKUs</strong> — both are needed</>,
              <>Put the <strong>real FQDN and IP</strong> in the SAN as well as the friendly name</>,
              <>Sign ISE&rsquo;s pxGrid certificate and every client certificate with the same CA where you can. Where two pxGrid nodes serve one subscriber, they must be</>,
            ]}
          />
          <Note label="Automatic approval" tone="warn">
            <M>pxGrid Services &gt; Settings</M> →{' '}
            <strong>Automatically approve new certificate-based accounts</strong> is
            off by default and Cisco advises leaving it off in production.
            Password-based clients are never auto-approved regardless.
          </Note>
        </Stack>
      </Panel>

      {/* ---------------- inbound ---------------- */}
      <Panel title="Coming back the other way" kicker="ANC · pxGrid Direct" span={4}>
        <Stack gap={5}>
          <Table
            head={['ANC action', 'Effect', 'CoA']}
            widths={['26%', '54%', '20%']}
            rows={[
              ['Quarantine', 'Restricted VLAN or profile, via an exception rule on Session:ANCPolicy', 'Assign + unassign'],
              ['Unquarantine', 'Removes the assignment, returning full access', 'Yes'],
              ['Shut_Down', 'Deactivates the NAS port. Wired only', 'Assign only'],
              ['Port_Bounce', 'Shut / no-shut — forces DHCP renewal and re-auth', 'Yes'],
              ['Re_Authenticate', 'Re-authenticates the session in place', 'Yes'],
            ]}
          />
          <Note label="The asymmetry that catches people" tone="warn">
            Un-assigning <strong>Shut_Down</strong> sends no CoA — the port stays
            down until somebody types <M>no shutdown</M>. Quarantine and
            Re_Authenticate are the only two actions that can be combined.
          </Note>
          <Split
            cols={1}
            parts={[
              {
                title: 'pxGrid Direct — ISE as the consumer',
                children: (
                  <KV
                    items={[
                      ['What', <>ISE pulls endpoint attributes from an external JSON REST API and exposes them as dictionary attributes. Scheduled ingestion, not a bus</>],
                      ['Configure', <M>Administration &gt; Network Resources &gt; pxGrid Direct Connectors</M>],
                      ['Schedule', <>Full sync <strong>1 week</strong> (12 h – 1 month); incremental <strong>1 day</strong> (1 h – 1 week)</>],
                      ['Mapping', <>Parent object key, chosen attributes, a <strong>Unique</strong> and a <strong>Correlation Identifier</strong> such as MAC</>],
                    ]}
                    labelWidth={58}
                  />
                ),
              },
            ]}
          />
        </Stack>
      </Panel>
    </Sheet>
  )
}
