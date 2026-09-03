'use client'

// ============================================================
// Topic — RADIUS & Change of Authorization
//
// The CoA explorer is the interactive core: pick a CoA type and
// you get the exact Cisco AV-pair ISE sends, what the NAD does
// with it, what happens to the session, and what the user feels.
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
  Selector,
  Ladder,
} from '../sheet-kit'

type CoaId = 'reauth' | 'bounce' | 'disable' | 'terminate'

interface Coa {
  id: CoaId
  label: string
  hint: string
  name: string
  pill: string
  tone: 'good' | 'warn' | 'bad' | 'neutral'
  gist: string
  nad: React.ReactNode[]
  facts: [React.ReactNode, React.ReactNode][]
  code: { title: string; body: string }
  note: { label: string; tone?: 'signal' | 'warn' | 'good'; body: React.ReactNode }
}

const COAS: Coa[] = [
  {
    id: 'reauth',
    label: 'Reauthenticate',
    hint: 'Re-run authentication in place. The session survives.',
    name: 'Reauthenticate host',
    pill: 'Session remains active',
    tone: 'good',
    gist:
      'The general-purpose CoA and the one you should reach for by default. The NAD re-runs the authentication for that session against ISE, which evaluates policy again and returns whatever the endpoint now deserves. Nothing goes down.',
    nad: [
      'Forces reauthentication without disconnecting the session',
      'The session keeps its session ID, its IP address and its place in the session directory',
      'Safe on multi-auth ports — only the addressed session is touched, not every device behind the port',
      <>
        The endpoint&rsquo;s authorization is replaced by the result of the new
        policy evaluation — new dACL, new VLAN, new SGT
      </>,
    ],
    facts: [
      ['AV-pair', <M>Cisco:Avpair=&quot;subscriber:command=reauthenticate&quot;</M>],
      ['Action', 'Forces reauthentication without disconnecting'],
      ['Purpose', 'Verify credentials or update policies'],
      ['Session state', 'Session remains active'],
      ['User experience', 'Slight delay'],
      ['Use case', 'Credential or policy refresh — profiling, posture, CWA, ANC'],
    ],
    code: {
      title: 'What ISE sends',
      body: `CoA-Request  (code 43)   ISE -> NAD   UDP 1700
  Calling-Station-Id  = 00-0C-29-3C-8D-CA
  Audit-Session-Id    = <the session ISE wants to change>
  cisco-av-pair       = subscriber:command=reauthenticate

CoA-ACK      (code 44)   NAD -> ISE
  then a fresh RADIUS Access-Request for the same session`,
    },
    note: {
      label: 'Where it is issued from',
      tone: 'good',
      body: (
        <>
          Automatically by the profiler, posture, CWA, BYOD and ANC. Manually from{' '}
          <M>Operations &gt; RADIUS &gt; Live Sessions</M> — the Actions column
          offers <em>Session Reauthentication</em>, and the{' '}
          <em>with Last / Rerun / Restart</em> variants.
        </>
      ),
    },
  },

  {
    id: 'bounce',
    label: 'Port Bounce',
    hint: 'Shut / no-shut the host port. Forces a fresh DHCP.',
    name: 'Bounce host port',
    pill: 'Brief interruption',
    tone: 'warn',
    gist:
      'The NAD temporarily disables and re-enables the port. The point is not the outage — it is that the endpoint sees link down and link up, so it starts DHCP again. That is how you get a device into a new VLAN when it would otherwise sit on the old address until its lease expires.',
    nad: [
      'Temporarily disables and re-enables the port',
      'The endpoint sees a link transition and re-runs DHCP',
      'Used when a VLAN assignment changes and the endpoint will not renew on its own',
      'Refreshes port state, which is also why it gets used as a blunt troubleshooting tool',
    ],
    facts: [
      ['AV-pair', <M>Cisco:Avpair=&quot;subscriber:command=bounce-host-port&quot;</M>],
      ['Action', 'Temporarily disables and re-enables the port'],
      ['Purpose', 'Refresh port state or apply new policies'],
      ['Session state', 'Session remains active'],
      ['User experience', 'Brief interruption'],
      ['Use case', 'Policy updates, troubleshooting'],
    ],
    code: {
      title: 'What ISE sends',
      body: `CoA-Request  (code 43)   ISE -> NAD   UDP 1700
  Calling-Station-Id  = 00-0C-29-3C-8D-CA
  Audit-Session-Id    = <the session ISE wants to change>
  cisco-av-pair       = subscriber:command=bounce-host-port

! the port goes down and back up; every MAC on it is affected`,
    },
    note: {
      label: 'Never on a multi-host or multi-auth port',
      tone: 'warn',
      body: (
        <>
          The command is addressed to a session but it acts on the{' '}
          <strong>port</strong>. Bouncing a port to move one endpoint into a new
          VLAN drops the phone, the PC behind the phone and everything else on that
          port with it. Use Reauthenticate unless the endpoint genuinely has to
          re-DHCP.
        </>
      ),
    },
  },

  {
    id: 'disable',
    label: 'Disable Host Port',
    hint: 'Shut the port and leave it shut.',
    name: 'Disable host port',
    pill: 'Stays down',
    tone: 'bad',
    gist:
      'The containment option. The NAD shuts the host port and, unlike a bounce, does not bring it back. This is what an Adaptive Network Control quarantine action looks like when you want the device physically off the network rather than merely restricted.',
    nad: [
      'Shuts the host port administratively',
      'The port does not recover on its own — it stays down until an administrator or another action brings it back',
      'Everything on that port goes with it, exactly as with a bounce',
      'Reserve it for containment, not for policy changes',
    ],
    facts: [
      ['AV-pair', <M>Cisco:Avpair=&quot;subscriber:command=disable-host-port&quot;</M>],
      ['Action', 'Disables the port'],
      ['Purpose', 'Remove the endpoint from the network entirely'],
      ['Session state', 'Session ends with the port'],
      ['User experience', 'Full disconnection, with no self-recovery'],
      ['Use case', 'Containment and quarantine — ANC, threat response'],
    ],
    code: {
      title: 'What ISE sends',
      body: `CoA-Request  (code 43)   ISE -> NAD   UDP 1700
  Calling-Station-Id  = 00-0C-29-3C-8D-CA
  Audit-Session-Id    = <the session ISE wants to change>
  cisco-av-pair       = subscriber:command=disable-host-port

! Live Sessions: "Session Termination with Port Shutdown"`,
    },
    note: {
      label: 'Somebody has to turn it back on',
      tone: 'warn',
      body: (
        <>
          There is no timer on this. Before you wire it to an automated threat
          response, decide who re-enables the port at 3am and how they find out
          which one it was.
        </>
      ),
    },
  },

  {
    id: 'terminate',
    label: 'Terminate / Disconnect',
    hint: 'Standard RFC 5176 disconnect. No VSA needed.',
    name: 'Terminate session',
    pill: 'No VSA required',
    tone: 'bad',
    gist:
      'The only one of the four that is pure RFC 5176: a standard Disconnect-Request that does not require a Cisco VSA at all. The NAD removes the session immediately. On a wired port the link stays up, so the endpoint is free to start a new authentication straight away.',
    nad: [
      'Immediately ends the session',
      'This is a standard disconnect request that does not require a VSA',
      <>
        Answered with <strong>Disconnect-ACK</strong> (41) or{' '}
        <strong>Disconnect-NAK</strong> (42), not CoA-ACK
      </>,
      'Terminating a session removes authorization — it does not keep the device off the network',
    ],
    facts: [
      ['Packet', <>Disconnect-Request, code <strong>40</strong></>],
      ['AV-pair', 'None — standard RFC 5176 disconnect'],
      ['Action', 'Immediately ends the session'],
      ['Purpose', 'Forcibly disconnect user or device'],
      ['Session state', 'Session is terminated'],
      ['User experience', 'Full disconnection'],
      ['Use case', 'Security enforcement, session timeout'],
    ],
    code: {
      title: 'What ISE sends',
      body: `Disconnect-Request (code 40)   ISE -> NAD   UDP 1700
  Calling-Station-Id  = 00-0C-29-3C-8D-CA
  Audit-Session-Id    = <the session ISE wants to remove>
  ! no cisco-av-pair

Disconnect-ACK     (code 41)   NAD -> ISE
Disconnect-NAK     (code 42)   NAD -> ISE  - session not found`,
    },
    note: {
      label: 'Terminate is not quarantine',
      body: (
        <>
          On a wired port with the link still up, the supplicant simply
          re-authenticates and lands back in whatever policy still matches it. If
          the intent is to keep the endpoint out, change the policy first and{' '}
          <em>then</em> terminate — or use disable-host-port.
        </>
      ),
    },
  },
]

export default function RadiusCoaSheet() {
  const [coaId, setCoaId] = useState<CoaId>('reauth')
  const c = COAS.find(x => x.id === coaId) ?? COAS[0]

  return (
    <Sheet>
      {/* ---------------- RADIUS in outline ---------------- */}
      <Panel title="RADIUS, in outline" kicker="UDP, hop-by-hop, mostly cleartext" span={4}>
        <Stack gap={6}>
          <Prose>
            RADIUS runs over UDP and is hop-by-hop: the NAD and ISE share a secret,
            and nothing beyond that hop is protected. Only the{' '}
            <M>User-Password</M> attribute is obscured — the username, the MAC, the
            dACL and every AV-pair travel in clear. The shared secret is not payload
            encryption; it keys the authenticators that prove each side is who it
            claims.
          </Prose>
          <Table
            head={['Code', 'Packet', 'Direction']}
            widths={['16%', '52%', '32%']}
            rows={[
              ['1', 'Access-Request', 'NAD → ISE'],
              ['2', 'Access-Accept', 'ISE → NAD'],
              ['3', 'Access-Reject', 'ISE → NAD'],
              ['4', 'Accounting-Request', 'NAD → ISE'],
              ['5', 'Accounting-Response', 'ISE → NAD'],
              ['11', 'Access-Challenge', 'ISE → NAD'],
              ['40', 'Disconnect-Request', 'ISE → NAD'],
              ['41 / 42', 'Disconnect-ACK / NAK', 'NAD → ISE'],
              ['43', 'CoA-Request', 'ISE → NAD'],
              ['44 / 45', 'CoA-ACK / NAK', 'NAD → ISE'],
            ]}
          />
          <KV
            items={[
              ['Authentication', <><M>UDP 1812</M> — legacy <M>1645</M></>],
              ['Accounting', <><M>UDP 1813</M> — legacy <M>1646</M></>],
              ['RADIUS/DTLS', <><M>UDP 2083</M> — authentication and accounting on one port</>],
              ['CoA', <><M>UDP 1700</M> Cisco · <M>UDP 3799</M> RFC 5176</>],
            ]}
            labelWidth={80}
          />
        </Stack>
      </Panel>

      {/* ---------------- attributes ---------------- */}
      <Panel title="The attributes ISE cares about" kicker="And why" span={4} tone="signal">
        <Table
          head={['#', 'Attribute', 'Why it matters']}
          widths={['9%', '30%', '61%']}
          rows={[
            ['1', 'User-Name', 'The identity. For MAB it is the endpoint MAC'],
            ['4', 'NAS-IP-Address', 'Must match a Network Device in ISE, or you get 11007'],
            ['6', 'Service-Type', '2 Framed for 802.1X, 10 Call-Check for MAB'],
            ['8', 'Framed-IP-Address', 'The IP↔MAC binding profiling and posture depend on'],
            ['25', 'Class', 'Echoed back in accounting — ties the record to the auth'],
            ['30', 'Called-Station-Id', 'The NAD side — switchport MAC, or AP MAC and SSID'],
            ['31', 'Calling-Station-Id', 'The endpoint MAC. What ISE keys the endpoint on'],
            ['40', 'Acct-Status-Type', 'Start, Interim-Update, Stop'],
            ['44', 'Acct-Session-Id', 'What accounting and CoA are correlated on'],
            ['61', 'NAS-Port-Type', '15 Ethernet, 19 IEEE 802.11'],
            ['80', 'Message-Authenticator', 'HMAC over the packet, keyed by the shared secret'],
            ['87', 'NAS-Port-Id', 'The interface name — GigabitEthernet1/0/1'],
            [
              '26/1',
              <>cisco-av-pair</>,
              'dACL, url-redirect, SGT, device-traffic-class, every CoA command',
            ],
          ]}
        />
        <div className="mt-2">
          <Note label="Attributes 6, 8, 25 and 31 are configured, not automatic">
            The global block turns them on explicitly:{' '}
            <M>radius-server attribute 6 on-for-login-auth</M>,{' '}
            <M>attribute 8 include-in-access-req</M>,{' '}
            <M>attribute 25 access-request include</M> and{' '}
            <M>attribute 31 mac format ietf upper-case</M>. Miss attribute 8 and ISE
            never learns the endpoint&rsquo;s IP address.
          </Note>
        </div>
      </Panel>

      {/* ---------------- accounting + dead detection ---------------- */}
      <Panel title="Accounting, and knowing the server is dead" span={4}>
        <Stack gap={6}>
          <Prose>
            The Access-Accept says what was authorized. <strong>Accounting</strong>{' '}
            says the session still exists and what address it holds. Interim updates
            are what carry <M>Framed-IP-Address</M> to ISE for an endpoint that
            DHCPs <em>after</em> the accept — without them, profiling, posture and
            any redirect that needs an IP quietly fail.
          </Prose>
          <Code
            title="IOS-XE — accounting and server-dead detection, verbatim"
            code={`aaa accounting update newinfo periodic 2880
aaa accounting dot1x default start-stop group AAA-GROUP-ISE
!
radius server ISE01
 address ipv4 198.18.133.27 auth-port 1812 acct-port 1813
 automate-tester username radius-test ignore-acct-port probe-on
 key ISEisC00L
!
radius-server dead-criteria time 10 tries 3
radius-server deadtime 15`}
          />
          <KV
            items={[
              [
                'update newinfo',
                <>
                  Send an interim update whenever something changes — an IP address
                  appearing is the change that matters. <M>periodic 2880</M> sends
                  one anyway, so stale sessions age out of MnT
                </>,
              ],
              [
                'dead-criteria',
                <>
                  Mark the server dead after <strong>10 seconds</strong> without a
                  response <em>and</em> <strong>3</strong> failed tries
                </>,
              ],
              [
                'deadtime 15',
                <>Skip a server marked dead for 15 minutes before trying it again</>,
              ],
              [
                'automate-tester',
                <>
                  Probe with a real username so the NAD learns the server is back. A
                  RADIUS reject still proves it is alive
                </>,
              ],
              ['Verify', <M>show aaa servers</M>],
            ]}
            labelWidth={78}
          />
        </Stack>
      </Panel>

      {/* ---------------- THE CoA EXPLORER ---------------- */}
      <Panel
        title="Change of Authorization — the four commands"
        span={12}
        tone="ink"
        right={
          <span className="normal-case tracking-normal">
            RFC 5176 · requires an active session on ISE
          </span>
        }
      >
        <Stack gap={8}>
          <div className="flex items-center justify-between gap-4">
            <Selector
              options={COAS.map(x => ({ id: x.id, label: x.label, hint: x.hint }))}
              value={coaId}
              onChange={setCoaId}
            />
            <Pill tone={c.tone}>{c.pill}</Pill>
          </div>

          <div className="border-t border-ink-200 pt-2">
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-4">
                <h4
                  className="text-[12px] font-bold tracking-tight text-ink-950"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  {c.name}
                </h4>
                <div className="mt-1">
                  <Prose>{c.gist}</Prose>
                </div>
                <div className="mt-2">
                  <div
                    className="mb-1 border-b border-ink-300 pb-[2px] text-[9px] font-bold uppercase tracking-[0.11em] text-ink-950"
                    style={{ fontFamily: 'var(--font-heading)' }}
                  >
                    What the NAD does
                  </div>
                  <Bullets items={c.nad} />
                </div>
                <div className="mt-2">
                  <Note label={c.note.label} tone={c.note.tone}>
                    {c.note.body}
                  </Note>
                </div>
              </div>

              <div className="col-span-3">
                <div
                  className="mb-1 border-b border-ink-300 pb-[2px] text-[9px] font-bold uppercase tracking-[0.11em] text-ink-950"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  The specifics
                </div>
                <KV items={c.facts} labelWidth={78} />
              </div>

              <div className="col-span-5">
                <Stack gap={6}>
                  <Code title={c.code.title} code={c.code.body} />
                  <div>
                    <div
                      className="mb-1 border-b border-ink-300 pb-[2px] text-[9px] font-bold uppercase tracking-[0.11em] text-ink-950"
                      style={{ fontFamily: 'var(--font-heading)' }}
                    >
                      CoA request commands supported on the device
                    </div>
                    <Table
                      head={['Command', 'Cisco VSA']}
                      widths={['30%', '70%']}
                      rows={[
                        ['Bounce host port', <M>Cisco:Avpair=&quot;subscriber:command=bounce-host-port&quot;</M>],
                        ['Disable host port', <M>Cisco:Avpair=&quot;subscriber:command=disable-host-port&quot;</M>],
                        ['Reauthenticate host', <M>Cisco:Avpair=&quot;subscriber:command=reauthenticate&quot;</M>],
                        [
                          'Terminate session',
                          'This is a standard disconnect request that does not require a VSA',
                        ],
                      ]}
                    />
                  </div>
                </Stack>
              </div>
            </div>
          </div>
        </Stack>
      </Panel>

      {/* ---------------- the sequence ---------------- */}
      <Panel title="Limited access → CoA → full access" kicker="Posture and CWA both look like this" span={4}>
        <Ladder
          actors={['Endpoint', 'NAD', 'Cisco ISE']}
          steps={[
            { from: 0, to: 1, label: 'Initial connection — 802.1X or MAB' },
            { from: 1, to: 2, label: 'RADIUS Access-Request' },
            {
              from: 2,
              to: 1,
              label: 'Access-Accept — Limited Access',
              sub: 'dACL + URL-Redirect. The session now exists on ISE',
              tone: 'signal',
            },
            {
              from: 0,
              to: 2,
              label: 'Security posture: Non Compliant',
              sub: 'or: the portal has not been completed yet',
              tone: 'muted',
              dashed: true,
            },
            {
              from: 0,
              to: 2,
              label: 'Security posture: Compliant',
              sub: 'or: credentials accepted at the portal',
              dashed: true,
            },
            {
              from: 2,
              to: 1,
              label: 'CoA-Request — reauthenticate',
              sub: 'UDP 1700',
              tone: 'signal',
            },
            { from: 1, to: 2, label: 'CoA-ACK' },
            { from: 1, to: 2, label: 'RADIUS Access-Request', sub: 'same session, re-evaluated' },
            {
              from: 2,
              to: 1,
              label: 'Access-Accept — Full Access',
              tone: 'signal',
            },
          ]}
        />
        <div className="mt-1.5">
          <Note label="It runs the other way too">
            Full → Limited is the same mechanism: an endpoint on full access with an
            AD group match, then a threat notification arrives, and ISE issues a CoA
            that drops it to limited access. Adaptive Network Control and Threat
            Centric NAC are both this shape.
          </Note>
        </div>
      </Panel>

      {/* ---------------- key differences ---------------- */}
      <Panel title="Key differences at a glance" span={4} tone="quiet">
        <Stack gap={6}>
          <Table
            head={['', 'Bounce Port', 'Reauthenticate', 'Terminate']}
            widths={['20%', '27%', '27%', '26%']}
            rows={[
              [
                'Action',
                'Temporarily disables and re-enables the port',
                'Forces reauthentication without disconnecting',
                'Immediately ends the session',
              ],
              [
                'Purpose',
                'Refresh port state or apply new policies',
                'Verify credentials or update policies',
                'Forcibly disconnect user or device',
              ],
              [
                'Session state',
                'Session remains active',
                'Session remains active',
                'Session is terminated',
              ],
              ['User experience', 'Brief interruption', 'Slight delay', 'Full disconnection'],
              [
                'Use case',
                'Policy updates, troubleshooting',
                'Credential or policy refresh',
                'Security enforcement, session timeout',
              ],
            ]}
          />
          <Split
            cols={1}
            parts={[
              {
                title: 'Issuing one by hand',
                children: (
                  <Bullets
                    items={[
                      <>
                        <M>Operations &gt; RADIUS &gt; Live Sessions</M> → the{' '}
                        <strong>Actions</strong> column
                      </>,
                      <>
                        Session Reauthentication — and{' '}
                        <em>with Last</em>, <em>Rerun</em>, <em>Restart</em>
                      </>,
                      <>Session Termination</>,
                      <>Session Termination with Port Bounce</>,
                      <>Session Termination with Port Shutdown</>,
                    ]}
                  />
                ),
              },
            ]}
          />
        </Stack>
      </Panel>

      {/* ---------------- NAD config + failures ---------------- */}
      <Panel title="The NAD side, and why CoA fails" span={4}>
        <Stack gap={6}>
          <Code
            title="IOS-XE — the dynamic-author listener"
            code={`aaa server radius dynamic-author
 client 198.18.133.27 server-key ISEisC00L
 auth-type any
!
! one client line per PSN that may ever issue a CoA
! ISE -> NAD: UDP 1700 (Cisco) or UDP 3799 (RFC 5176)`}
          />
          <Table
            head={['Cause', 'What you see', 'Fix']}
            widths={['26%', '36%', '38%']}
            rows={[
              [
                'Wrong CoA key',
                'ISE reports the CoA failed; the NAD drops it or NAKs',
                <>
                  <M>server-key</M> must match the CoA secret ISE holds for that
                  device — a separate field from the RADIUS secret
                </>,
              ],
              [
                'CoA port blocked',
                'No reply, and nothing in the NAD logs',
                <>
                  Open <M>UDP 1700</M> — and <M>3799</M> — from every PSN to every
                  NAD
                </>,
              ],
              [
                'No active session',
                'CoA-NAK, or session not found',
                'A session that predates a PSN restart, or lives on another PSN, is not there to change',
              ],
              [
                'NAD is not a client',
                'The request is discarded without a reply',
                <>
                  One <M>client</M> line per PSN. A missing PSN fails only for the
                  CoAs that PSN issues, which is what makes it hard to spot
                </>,
              ],
              [
                'Secret mismatch',
                <>
                  <M>11036</M> Message-Authenticator invalid, or <M>11038</M> on
                  accounting
                </>,
                'Re-enter it both sides; check for a NAT or load balancer rewriting packets',
              ],
            ]}
          />
        </Stack>
      </Panel>
    </Sheet>
  )
}
