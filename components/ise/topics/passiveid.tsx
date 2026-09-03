'use client'

// ============================================================
// Topic — Passive Identity
//
// The provider explorer is the interactive part: pick one of the
// six ways ISE can learn a user-to-IP mapping without ever
// talking to the endpoint, and you get what it learns, its
// ports, the ISE configuration and what the provider side has
// to give you.
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
  Pill,
  M,
  Split,
  Ladder,
  Selector,
} from '../sheet-kit'

interface Provider {
  id: string
  label: string
  name: string
  kind: 'agentless' | 'agent' | 'feed'
  gist: string
  learns: React.ReactNode[]
  ports: [React.ReactNode, React.ReactNode][]
  ise: React.ReactNode
  provider: React.ReactNode[]
  note: { label: string; tone?: 'signal' | 'warn' | 'good'; body: React.ReactNode }
}

const WC = <M>Work Centers &gt; PassiveID</M>

const PROVIDERS: Provider[] = [
  {
    id: 'wmi',
    label: 'AD / WMI',
    name: 'Active Directory over WMI',
    kind: 'agentless',
    gist:
      'The original provider and the one the workbook names first. ISE subscribes to the security event log on each domain controller over WMI and reads interactive logon events as they are written. Nothing is installed anywhere.',
    learns: [
      <>Domain, username and the client IP address from the logon event</>,
      <>AD group membership, exposed as <M>PassiveID_Groups</M></>,
      <>The provider that supplied it, as <M>PassiveID_Provider</M></>,
    ],
    ports: [
      ['To each DC', <><M>TCP 135</M> plus the dynamic RPC range</>],
      ['Direction', 'Outbound from the PSN running the Passive Identity service'],
      ['Also needed', <>The usual AD ports — <M>53</M>, <M>88</M>, <M>389</M>, <M>445</M>, <M>3268</M></>],
    ],
    ise: (
      <>
        Add the Active Directory join point as a provider under {WC}. Every
        domain controller you want events from is listed individually, so a
        forest with forty DCs is forty WMI subscriptions.
      </>
    ),
    provider: [
      'Logon auditing must actually be enabled on the domain controllers — no audit events, no mappings',
      'The ISE account needs permission to read the security event log remotely over WMI and DCOM',
      'Every firewall between the PSN and the DC has to pass RPC, not just TCP 135',
    ],
    note: {
      label: 'The one that breaks first',
      tone: 'warn',
      body: (
        <>
          WMI is the heaviest option on the domain controller and the most
          brittle across firewalls, because the RPC port is negotiated rather
          than fixed. At any real scale, move to the AD Agent.
        </>
      ),
    },
  },

  {
    id: 'agent',
    label: 'AD Agent',
    name: 'Active Directory Agent',
    kind: 'agent',
    gist:
      'A small Cisco agent installed on a domain controller — or on a member server that watches several of them — which reads the logon events locally and forwards only the mappings to ISE. One outbound TCP session instead of a WMI subscription per DC.',
    learns: [
      <>The same domain / username / IP mapping as WMI</>,
      <>Delivered as a compact push rather than an event-log subscription</>,
    ],
    ports: [
      ['Agent → PSN', <><M>TCP 9095</M> inbound to the node running Passive Identity</>],
      ['Direction', 'The agent initiates; no inbound RPC to the DC is needed'],
    ],
    ise: (
      <>
        Under {WC} ISE offers two routes:{' '}
        <strong>Automatically Install and Deploy Active Directory Agents</strong>{' '}
        — ISE pushes and registers the agent for you — or{' '}
        <strong>Manually Install and Deploy Active Directory Agents</strong>,
        where you download the installer and register the agent afterwards.
      </>
    ),
    provider: [
      'A Windows host that can read the DC security event log — the DC itself, or a member server with rights to it',
      'Outbound reachability to the PSN on TCP 9095',
      'This is not the ISE AD connector. That runs on ISE and joins the domain; this is a separate binary that runs on Windows',
    ],
    note: {
      label: 'The default choice',
      tone: 'good',
      body: (
        <>
          Fewer firewall rules, one fixed port, far less load on the domain
          controller, and no dependence on remote DCOM. If you are building
          Passive ID today and the estate is Windows, start here.
        </>
      ),
    },
  },

  {
    id: 'syslog',
    label: 'Syslog',
    name: 'Syslog provider',
    kind: 'feed',
    gist:
      'For everything that already knows who logged in and will tell you in a log line — VPN headends, wireless controllers, web proxies, other NAC products, IdPs. ISE parses the message and pulls the username and IP out of it.',
    learns: [
      'Username and IP address, from a position in the message you define',
      'Logoff events too, where the sending system emits them — which is what keeps the mapping honest',
    ],
    ports: [
      ['Listener', <><M>UDP 40514</M> and <M>TCP 11468</M>, inbound to the PSN</>],
      [
        'Not the same port',
        <>
          ISE&rsquo;s ordinary remote-logging targets are <M>UDP 20514</M>,{' '}
          <M>TCP 1468</M> and secure <M>TCP 6514</M>. Passive ID listens
          somewhere else entirely
        </>,
      ],
    ],
    ise: (
      <>
        Add a syslog provider under {WC}, give it the sending host, then attach a
        message template that tells ISE where in the line the user and the IP
        sit. Templates exist for the common Cisco senders; anything else needs a
        custom one.
      </>
    ),
    provider: [
      'The sending device must be pointed at the PassiveID syslog port, not at the MnT logging collector',
      'The message must actually carry both a username and an IP address in a stable position',
      'Logoff messages matter as much as logon messages — without them the mapping only ever ages out',
    ],
    note: {
      label: 'Where it earns its place',
      body: (
        <>
          Non-Windows identity sources. A VPN concentrator or a proxy that
          authenticates users is already producing exactly the mapping you want,
          and no agent will ever be installed on it.
        </>
      ),
    },
  },

  {
    id: 'span',
    label: 'SPAN',
    name: 'SPAN provider',
    kind: 'feed',
    gist:
      'ISE watches mirrored domain-controller traffic on a dedicated interface and derives logins from the authentication exchanges it sees. The last resort, for when you may not touch the domain controllers and there is no syslog to be had.',
    learns: [
      'User-to-IP mappings inferred from the authentication traffic on the wire',
      'Nothing the mirrored traffic does not contain — an encrypted or missed exchange is a missed login',
    ],
    ports: [
      ['Listener', 'No TCP or UDP port. A promiscuous ISE interface fed by a SPAN session'],
      ['Interface', 'Use GE1/2/3 — never the management interface'],
      ['Virtual', <>The vSwitch port group needs <strong>Promiscuous Mode = Accept</strong></>],
    ],
    ise: (
      <>
        Add a SPAN provider under {WC} and choose the ISE node and the interface
        it should listen on. Everything else is switch-side.
      </>
    ),
    provider: [
      'A SPAN or RSPAN session mirroring the traffic between clients and the domain controllers to that ISE interface',
      'The PSN has to be L2-adjacent to the mirror destination, or you need RSPAN/ERSPAN',
      'A physical switchport and PSN CPU, both permanently',
    ],
    note: {
      label: 'Least accurate of the four',
      tone: 'warn',
      body: (
        <>
          SPAN sees only what crosses the mirrored link, at the moment it
          crosses. Traffic that takes another path, or that ISE misses under
          load, is a login that never happened as far as policy is concerned.
          Use it to fill a gap, not as the primary provider.
        </>
      ),
    },
  },

  {
    id: 'api',
    label: 'API',
    name: 'API provider',
    kind: 'feed',
    gist:
      'A REST provider: some external system that knows who is on which address pushes the mapping into ISE itself. Useful for identity sources that are neither Windows nor chatty enough to log usefully.',
    learns: [
      'Whatever the caller sends — user, IP, and optionally domain and groups',
      'The mapping is attributed to the API provider in PassiveID_Provider, so you can write policy that trusts one source and not another',
    ],
    ports: [
      [
        'Transport',
        <>
          The ISE REST interface. Cisco&rsquo;s ports reference lists no dedicated
          PassiveID API port alongside <M>9094</M>, <M>9095</M> and the syslog
          pair, so take the port from the API documentation for your release
          rather than from here
        </>,
      ],
    ],
    ise: (
      <>
        Add an API provider under {WC}. It appears as its own service —{' '}
        <M>PassiveID API Service</M> in <M>show application status ise</M>.
      </>
    ),
    provider: [
      'A client that can authenticate to the ISE API and post mappings',
      'A discipline for withdrawing a mapping when the user logs out — nothing else will do it for you',
    ],
    note: {
      label: 'You own the accuracy',
      body: (
        <>
          Every other provider derives the mapping from an event it observed. An
          API mapping is asserted by whoever called, and ISE has no way to check
          it. Treat the caller as a trusted identity source or do not accept it.
        </>
      ),
    },
  },

  {
    id: 'ts',
    label: 'TS Agent',
    name: 'Terminal Server (TS) Agent',
    kind: 'agent',
    gist:
      'Solves the one case where user-to-IP mapping breaks down completely: a Windows Terminal Server or Citrix host where fifty users share a single source address. The agent allocates a distinct source-port range per user session and reports the ranges to ISE.',
    learns: [
      'User, the shared server IP address, and the TCP/UDP source-port range assigned to that user session',
      <>ISE can then attribute a flow to a user by port range rather than by address alone</>,
    ],
    ports: [
      ['Agent → PSN', <><M>TCP 9094</M> inbound to the node running Passive Identity</>],
      ['Direction', 'The agent initiates the connection to ISE'],
    ],
    ise: (
      <>
        Add a Terminal Server provider under {WC} and register the agent against
        it. The service appears as <M>PassiveID Agent Service</M> on the node.
      </>
    ),
    provider: [
      'The agent installed on the terminal server or Citrix host itself',
      'Enough of a port range per user for their real session count',
      'A downstream consumer that can actually act on a port range — a firewall, not a switch dACL',
    ],
    note: {
      label: 'Know what it is for',
      body: (
        <>
          The TS Agent exists for identity-aware <em>firewalling</em> of shared
          hosts. A switch or WLC cannot enforce on a source-port range, so this
          provider only pays off where the consumer is something like Secure
          Firewall reading sessions over pxGrid.
        </>
      ),
    },
  },
]

export default function PassiveIdSheet() {
  const [pid, setPid] = useState(PROVIDERS[0].id)
  const p = PROVIDERS.find(x => x.id === pid) ?? PROVIDERS[0]

  return (
    <Sheet>
      {/* ---------------- what it is ---------------- */}
      <Panel title="What Passive Identity is" kicker="Essentials licence" span={4}>
        <Stack gap={7}>
          <Prose>
            Passive Identity learns <strong>which user is on which IP address</strong>{' '}
            by watching something else authenticate them — an Active Directory
            logon, a VPN session, a proxy login. ISE never speaks to the endpoint
            and the endpoint never speaks to ISE. There is no supplicant, no
            802.1X, no certificate and nothing to configure on the client.
          </Prose>

          <KV
            items={[
              [
                'Produces',
                'An IP-to-user mapping in the session directory, published to subscribers over pxGrid',
              ],
              [
                'Where it runs',
                <>
                  A <strong>service under the Policy Service persona</strong>, not
                  a persona. Ticked per node at{' '}
                  <M>Administration &gt; System &gt; Deployment &gt; node</M>
                </>,
              ],
              ['Work centre', WC],
              [
                'Dictionary',
                <>
                  <M>PassiveID_Username</M>, <M>PassiveID_Domain</M>,{' '}
                  <M>PassiveID_Provider</M>, <M>PassiveID_Groups</M>
                </>,
              ],
            ]}
            labelWidth={66}
          />

          <Note label="Be clear what you are buying">
            Passive ID gives you <strong>visibility and a user-to-IP mapping</strong>,
            not authentication. Nothing has proved possession of a credential to
            ISE, nothing has proved the device is the one that logged in, and the
            mapping can be stale. Feed it into policy <em>alongside</em> a real
            authentication method — 802.1X, MAB with profiling, a portal — rather
            than in place of one.
          </Note>
        </Stack>
      </Panel>

      {/* ---------------- passive vs active ---------------- */}
      <Panel
        title="Passive and active identity, side by side"
        kicker="Who talks to whom"
        span={8}
        tone="signal"
      >
        <Stack gap={7}>
          <Split
            parts={[
              {
                title: 'Passive — ISE is told',
                children: (
                  <Stack gap={6}>
                    <Ladder
                      actors={['Jim', 'AD DC', 'ISE', 'NAD']}
                      steps={[
                        { from: 0, to: 1, label: 'DOMAIN\\Jim — AD logon' },
                        {
                          from: 1,
                          to: 2,
                          label: '“Jim logged in”',
                          sub: 'WMI · agent · syslog · SPAN',
                          tone: 'signal',
                        },
                        {
                          from: 2,
                          to: 3,
                          label: 'Full access',
                          sub: 'as a CoA on the MAB session',
                        },
                      ]}
                    />
                    <Prose>
                      Jim&rsquo;s traffic crosses the switch throughout. ISE never
                      speaks to him and simply learns whose the traffic is.
                    </Prose>
                  </Stack>
                ),
              },
              {
                title: 'Active — ISE asks',
                children: (
                  <Stack gap={6}>
                    <Ladder
                      actors={['Alice', 'WLC / AP', 'ISE', 'AD']}
                      steps={[
                        { from: 0, to: 1, label: '802.1X — EAPOL' },
                        { from: 1, to: 2, label: 'Access-Request' },
                        { from: 2, to: 3, label: '“Alice?” — Kerberos / LDAP' },
                        { from: 3, to: 2, label: '“Yes” + groups' },
                        { from: 2, to: 1, label: 'Accept — full access', tone: 'signal' },
                      ]}
                    />
                    <Prose>
                      The credential is presented to ISE, checked against the
                      store, and the result is a decision ISE itself made.
                    </Prose>
                  </Stack>
                ),
              },
            ]}
          />

          <Table
            head={['Cisco’s own wording', 'IP-to-user mapping obtained via…']}
            widths={['24%', '76%']}
            rows={[
              [
                'Passive Identity',
                'passive means like AD WMI events, AD Agents, syslog and SPAN sessions, and more',
              ],
              [
                'Active Identity',
                'active interaction between ISE and the client via 802.1X, web authentication, remote access VPN, etc.',
              ],
            ]}
          />
        </Stack>
      </Panel>

      {/* ---------------- THE PROVIDER EXPLORER ---------------- */}
      <Panel
        title="Provider explorer"
        span={12}
        tone="ink"
        right={
          <span className="normal-case tracking-normal">
            Six ways to learn a login without asking for one
          </span>
        }
      >
        <Stack gap={8}>
          <div className="flex items-center justify-between gap-4">
            <Selector
              options={PROVIDERS.map(x => ({ id: x.id, label: x.label, hint: x.gist }))}
              value={pid}
              onChange={setPid}
            />
            <Pill
              tone={
                p.kind === 'agent' ? 'good' : p.kind === 'agentless' ? 'neutral' : 'warn'
              }
            >
              {p.kind === 'agent'
                ? 'Agent on the provider'
                : p.kind === 'agentless'
                  ? 'Agentless — ISE polls'
                  : 'ISE is fed'}
            </Pill>
          </div>

          <div className="border-t border-ink-200 pt-2">
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-4">
                <h4
                  className="text-[12px] font-bold tracking-tight text-ink-950"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  {p.name}
                </h4>
                <div className="mt-1">
                  <Prose>{p.gist}</Prose>
                </div>
                <div className="mt-2">
                  <div
                    className="mb-1 border-b border-ink-300 pb-[2px] text-[9px] font-bold uppercase tracking-[0.11em] text-ink-950"
                    style={{ fontFamily: 'var(--font-heading)' }}
                  >
                    What it learns
                  </div>
                  <Bullets items={p.learns} />
                </div>
              </div>

              <div className="col-span-3">
                <div
                  className="mb-1 border-b border-ink-300 pb-[2px] text-[9px] font-bold uppercase tracking-[0.11em] text-ink-950"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  Ports and mechanism
                </div>
                <KV items={p.ports} labelWidth={76} />
                <div className="mt-2">
                  <Note label={p.note.label} tone={p.note.tone}>
                    {p.note.body}
                  </Note>
                </div>
              </div>

              <div className="col-span-2">
                <div
                  className="mb-1 border-b border-ink-300 pb-[2px] text-[9px] font-bold uppercase tracking-[0.11em] text-ink-950"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  Configure it in ISE
                </div>
                <Prose>{p.ise}</Prose>
              </div>

              <div className="col-span-3">
                <div
                  className="mb-1 border-b border-ink-300 pb-[2px] text-[9px] font-bold uppercase tracking-[0.11em] text-ink-950"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  What the provider side must give you
                </div>
                <Bullets items={p.provider} />
              </div>
            </div>
          </div>
        </Stack>
      </Panel>

      {/* ---------------- easy connect ---------------- */}
      <Panel title="Easy Connect — turning a mapping into policy" span={5}>
        <Stack gap={6}>
          <Prose>
            <strong>Easy Connect</strong> is the name for using a Passive ID
            mapping as a policy input. The endpoint gets on with MAB and limited
            access; when ISE learns the login from a provider it re-evaluates and
            issues a CoA. No supplicant is ever configured, which is exactly why
            it is attractive on estates that cannot deploy 802.1X.
          </Prose>

          <KV
            items={[
              [
                'The switch',
                <>
                  Tick <strong>Passive Identity Tracking</strong> on the
                  authorization profile — <em>&ldquo;enable this option to use the
                  Easy Connect feature of Passive Identity for policy
                  enforcement&rdquo;</em>. At{' '}
                  <M>Policy &gt; Policy Elements &gt; Results &gt; Authorization &gt; Authorization Profiles</M>
                </>,
              ],
              [
                'From ISE 3.2',
                'Authorization policies for PassiveID login users via Active Directory became a first-class case',
              ],
            ]}
            labelWidth={68}
          />

          <Code
            title="The two-rule pattern, and the CoA that joins them"
            code={`! ---- rule 1: on the wire, nobody has logged in yet ----
IF    Wired_MAB
THEN  Limited_Access      <- tick "Passive Identity
                             Tracking" on this profile

! ---- rule 2: ISE has since been told who logged in ----
IF    PassiveID:PassiveID_Domain  EQUALS  <domain>
AND   PassiveID:PassiveID_Groups  EQUALS  <AD group>
THEN  Full_Access

! rule 1 -> rule 2 arrives as a CoA, so the NAD has to be
! a dynamic-author client:
aaa server radius dynamic-author
 client <PSN-IP> server-key <shared-secret>
 auth-type any`}
          />
        </Stack>
      </Panel>

      {/* ---------------- deployment ---------------- */}
      <Panel title="Deployment, ports and PIC" span={4} tone="quiet">
        <Stack gap={6}>
          <Table
            head={['Inbound to the PSN', 'Port', 'Proto']}
            widths={['58%', '22%', '20%']}
            rows={[
              ['PassiveID TS Agent', '9094', 'TCP'],
              ['PassiveID AD Agent', '9095', 'TCP'],
              ['PassiveID syslog', '11468', 'TCP'],
              ['PassiveID syslog', '40514', 'UDP'],
              [
                <>Outbound to DCs — WMI</>,
                '135',
                'TCP',
              ],
              [
                <>
                  Consumers over pxGrid{' '}
                  <span className="text-ink-400">(session directory)</span>
                </>,
                '8910',
                'TCP',
              ],
            ]}
          />

          <Split
            cols={1}
            parts={[
              {
                title: 'Deployment options',
                children: (
                  <Bullets
                    items={[
                      <>
                        <strong>On a full ISE deployment</strong> — enable the
                        Passive Identity service on one or more PSNs at{' '}
                        <M>Administration &gt; System &gt; Deployment</M>. It is
                        licensed and toggled per node, exactly like Device Admin
                      </>,
                      <>
                        <strong>ISE Passive Identity Connector (PIC)</strong> — a
                        cut-down standalone image that does Passive ID and
                        nothing else, for feeding identity to firewalls and web
                        proxies without running a full policy deployment. It can
                        be upgraded in place to full ISE
                      </>,
                      <>
                        Cisco has published an <strong>end-of-life notice</strong>{' '}
                        for ISE PIC — check it before designing anything new
                        around a standalone connector
                      </>,
                      <>
                        Consumers read the result over pxGrid. Note the Secure
                        Firewall limitation: <strong>PIC does not provide ISE
                        attribute data and does not support SXP</strong>
                      </>,
                    ]}
                  />
                ),
              },
            ]}
          />
        </Stack>
      </Panel>

      {/* ---------------- limits ---------------- */}
      <Panel title="Accuracy, timeouts and where it goes wrong" span={3}>
        <Stack gap={6}>
          <Bullets
            items={[
              <>
                <strong>A mapping is an assertion, not a session.</strong> There
                is nothing to tear down, so it lives until a logoff event arrives
                or its timer expires
              </>,
              <>
                <strong>Logoff is the weak link.</strong> Interactive logon is
                reliably audited; logoff frequently is not. Session timeouts are
                per provider — set them short enough that a stale mapping cannot
                outlive the DHCP lease behind the address
              </>,
              <>
                <strong>Shared addresses defeat it.</strong> NAT, terminal
                servers and jump hosts map many users to one IP. Only the TS
                Agent answers that, and only for a consumer that can act on a
                port range
              </>,
              <>
                <strong>A machine logon looks like a user logon.</strong> A
                service account or a scheduled task still writes a logon event
              </>,
            ]}
          />

          <Note label="Where to look when nothing maps" tone="warn">
            <M>collector.log</M> carries log collection and Passive ID. Then check
            the provider&rsquo;s own service in <M>show application status ise</M> —
            WMI, Syslog, API, Agent, Endpoint and SPAN each run separately, and
            one being down is invisible from the dashboard.
          </Note>

          <Note label="The honest summary">
            Use Passive ID to <em>enrich</em> — to put a name on a flow in a
            firewall rule, a proxy log or a NetFlow record. Do not use it on its
            own as the thing that decides whether a port opens.
          </Note>
        </Stack>
      </Panel>
    </Sheet>
  )
}
