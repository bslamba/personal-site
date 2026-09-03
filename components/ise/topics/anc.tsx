'use client'

// ============================================================
// Topic — Threat Containment & ANC
//
// The action explorer is the interactive part: pick an ANC
// action and you get what ISE sends, what the NAD does with it,
// when the action is the right one, and how it is reversed.
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
  Steps,
  Ladder,
  Selector,
} from '../sheet-kit'

interface Action {
  id: string
  label: string
  name: string
  scope: string
  gist: string
  sends: React.ReactNode[]
  nad: React.ReactNode[]
  when: React.ReactNode[]
  reverse: React.ReactNode
  coa: [React.ReactNode, React.ReactNode][]
  note: { label: string; tone?: 'signal' | 'warn' | 'good'; body: React.ReactNode }
}

const ACTIONS: Action[] = [
  {
    id: 'quarantine',
    label: 'Quarantine',
    name: 'Quarantine',
    scope: 'Wired and wireless',
    gist:
      'The only action that changes what the endpoint is allowed to reach rather than whether it is connected at all. Cisco: “moves endpoints to a restricted VLAN using exception authorization policies.” In practice ISE stamps the session with the ANC policy name and your own exception rule decides what restricted means.',
    sends: [
      <>
        An ANC policy assignment against the endpoint, which sets{' '}
        <M>Session:ANCPolicy</M> on the active session
      </>,
      <>
        A CoA to the NAD so the session is re-authorised and the authorization
        policy runs again
      </>,
      <>
        On the re-authorisation, whatever your exception rule returns — a
        restrictive dACL, a quarantine VLAN, a quarantine SGT, or the built-in{' '}
        <M>DenyAccess</M>
      </>,
    ],
    nad: [
      'Re-authorises the existing session in place — the endpoint keeps its link and, if you use a dACL rather than a VLAN, its IP address',
      'Applies the new dACL, VLAN or SGT from the Access-Accept',
      'Wireless works identically; nothing here needs a physical port',
    ],
    when: [
      'The default containment action, and the one to build first',
      'When you still need to reach the endpoint — for forensics, for an EDR agent to phone home, for the user to see a message',
      'When the endpoint is wireless, where Shut Down is not available at all',
    ],
    reverse: (
      <>
        Unassign the ANC policy — the <strong>Unquarantine</strong> operation.
        Cisco: <em>&ldquo;returns endpoints to original VLAN for full network
        access&rdquo;</em>. A CoA <strong>is</strong> triggered on unassignment, so
        the endpoint recovers on its own.
      </>
    ),
    coa: [
      ['CoA on assign', 'Yes'],
      ['CoA on unassign', 'Yes'],
      ['Combines with', <>Re_Authenticate — the only supported pairing</>],
    ],
    note: {
      label: 'Quarantine on its own does nothing',
      tone: 'warn',
      body: (
        <>
          Assigning the policy sets an attribute and fires a CoA. If no
          authorization rule matches <M>Session:ANCPolicy</M>, the session
          re-authorises straight back into the access it already had. The
          exception rule <em>is</em> the containment.
        </>
      ),
    },
  },

  {
    id: 'shutdown',
    label: 'Shut Down',
    name: 'Shut_Down',
    scope: 'Wired only',
    gist:
      'Cisco: “deactivates NAS ports.” The switchport is administratively taken down and stays down. The bluntest instrument ISE has, and the only one that survives the endpoint being unplugged and moved — because the port, not the endpoint, is what is disabled.',
    sends: [
      <>The ANC policy assignment, then a CoA carrying the disable-port command</>,
      <>
        The Cisco VSA for this is{' '}
        <M>subscriber:command=disable-host-port</M>
      </>,
    ],
    nad: [
      'Takes the access port down administratively',
      'Everything behind that port loses connectivity, not just the offending endpoint',
      'The port stays down until someone intervenes on the switch',
    ],
    when: [
      'A confirmed compromise on a single-host port where the priority is stopping traffic immediately',
      'Never on a multi-host, multi-auth or multi-domain port — you take out the phone, the AP and everything else behind it',
      'Not available for wireless endpoints',
    ],
    reverse: (
      <>
        Manually. <strong>No CoA is triggered when a Shut_Down ANC policy is
        unassigned</strong> — un-assigning does not bring the port back. Someone
        has to <M>no shutdown</M> the interface, or bounce it, on the switch
        itself.
      </>
    ),
    coa: [
      ['CoA on assign', 'Yes'],
      ['CoA on unassign', <strong key="n">No</strong>],
      ['Combines with', 'Nothing'],
    ],
    note: {
      label: 'The asymmetry that catches people',
      tone: 'warn',
      body: (
        <>
          Every other action is reversible from the ISE GUI. This one is not.
          Treat Shut_Down as an action that generates a truck roll, and make sure
          whoever authorises it knows that before they click.
        </>
      ),
    },
  },

  {
    id: 'portbounce',
    label: 'Port Bounce',
    name: 'Port_Bounce',
    scope: 'Wired only',
    gist:
      'Cisco: “bounces network ports to force reauthentication.” A shut then no-shut, which drops link long enough that the endpoint re-DHCPs and re-authenticates from scratch. Use it when a policy change needs the endpoint to pick up new addressing rather than just a new ACL.',
    sends: [
      <>The ANC policy assignment, then a CoA carrying the bounce command</>,
      <>
        The Cisco VSA for this is <M>subscriber:command=bounce-host-port</M>
      </>,
    ],
    nad: [
      'Shuts and re-enables the access port',
      'Link goes down, so the endpoint restarts DHCP and 802.1X or MAB',
      'Everything behind the port is bounced with it',
    ],
    when: [
      'When the endpoint must land in a different VLAN and will not renew its address on its own',
      'To force a clean re-authentication after a policy or profile change',
      'Never on a multi-host or multi-auth port, for the same reason as Shut Down',
    ],
    reverse: (
      <>
        There is nothing to reverse — the port comes back by itself within a
        second or two. Unassigning the ANC policy triggers a CoA, so the endpoint
        is re-evaluated normally afterwards.
      </>
    ),
    coa: [
      ['CoA on assign', 'Yes'],
      ['CoA on unassign', 'Yes'],
      ['Combines with', 'Nothing'],
    ],
    note: {
      label: 'It is a nudge, not containment',
      body: (
        <>
          A bounce on its own re-authenticates the endpoint into whatever policy
          would otherwise match — which, if nothing else changed, is the access
          it already had. Bounce is a delivery mechanism for a change you have
          already made, not a containment action in itself.
        </>
      ),
    },
  },

  {
    id: 'reauth',
    label: 'Re-Authenticate',
    name: 'Re_Authenticate',
    scope: 'Wired and wireless',
    gist:
      'Cisco: “triggers reauthentication on active sessions.” The gentlest action — the session is re-authenticated in place, keeping the link up and the address intact. Its job is to make a policy change you have already made take effect now rather than at the next reauth timer.',
    sends: [
      <>The ANC policy assignment, then a CoA-Reauthenticate to the NAD</>,
      <>
        The Cisco VSA for this is <M>subscriber:command=reauthenticate</M>
      </>,
    ],
    nad: [
      'Re-runs authentication for the session without dropping it',
      'The endpoint sees at most a slight delay — no link flap, no DHCP renewal',
      'Safe on multi-auth and multi-domain ports, unlike bounce and shut down',
    ],
    when: [
      'Paired with Quarantine — the two are the only actions that can be combined',
      'To push a newly matched authorization result onto a live session',
      'Wherever session churn is unacceptable but the policy result must change now',
    ],
    reverse: (
      <>
        Nothing to reverse. Unassigning the policy triggers a further CoA and the
        session is evaluated against the normal rule set again.
      </>
    ),
    coa: [
      ['CoA on assign', 'Yes'],
      ['CoA on unassign', 'Yes'],
      ['Combines with', <>Quarantine</>],
    ],
    note: {
      label: 'Not a containment action',
      body: (
        <>
          Re_Authenticate changes nothing by itself. It is the mechanism by which
          another decision — a new exception rule, a new ANC assignment, a
          reprofile — reaches a session that is already up.
        </>
      ),
    },
  },
]

export default function AncSheet() {
  const [aid, setAid] = useState(ACTIONS[0].id)
  const a = ACTIONS.find(x => x.id === aid) ?? ACTIONS[0]

  return (
    <Sheet>
      {/* ---------------- what ANC is ---------------- */}
      <Panel title="What Adaptive Network Control is" kicker="Advantage licence" span={4}>
        <Stack gap={7}>
          <Prose>
            ANC applies a containment action to one endpoint{' '}
            <strong>out of band from normal policy evaluation</strong>. An
            operator, or an external system over pxGrid or the API, names an
            endpoint and an action; ISE stamps the session and issues a CoA. It
            is a service on the Administration node and works on wired and
            wireless.
          </Prose>

          <KV
            items={[
              [
                'Prerequisite',
                'An active session carrying a MAC address, IP address or session ID. No session, nothing to act on',
              ],
              [
                'Enabling it',
                <>
                  Cisco states ANC is <strong>disabled by default</strong> and is
                  enabled through pxGrid, but does not name the GUI page — find
                  the toggle in your release rather than trusting a path from
                  anywhere else
                </>,
              ],
              ['Policies', <M>Operations &gt; Adaptive Network Control &gt; Policy List</M>],
              ['Assignment', <M>Operations &gt; Adaptive Network Control &gt; Endpoint Assignment</M>],
              [
                'Exceptions',
                <M>Policy &gt; Policy Sets &gt; set &gt; Authorization Policy &gt; Exceptions</M>,
              ],
              ['Attribute', <M>Session:ANCPolicy</M>],
            ]}
            labelWidth={66}
          />

          <Note label="The licence line">
            ANC — sold as <strong>Rapid Threat Containment</strong> — sits in{' '}
            <strong>Advantage</strong>, alongside profiling, BYOD, pxGrid and
            TrustSec. It is not in Essentials, and it does not need Premier.
          </Note>
        </Stack>
      </Panel>

      {/* ---------------- the containment sequence ---------------- */}
      <Panel
        title="Rapid Threat Containment, end to end"
        kicker="Detection → CoA → quarantine"
        span={5}
        tone="signal"
      >
        <Stack gap={7}>
          <Prose>
            Rapid Threat Containment is a pattern, not a product: a security tool
            that sees something ISE cannot decides an endpoint is bad — a custom
            security event, an IPS hit, a vulnerability score — and tells ISE, the
            one system that can actually take it off the network, to contain it.
          </Prose>

          <Ladder
            actors={['Security product', 'ISE pxGrid', 'ISE PSN', 'Switch / WLC']}
            steps={[
              {
                from: 0,
                to: 1,
                label: 'Apply ANC policy — com.cisco.ise.config.anc',
                sub: 'TCP 8910, STOMP or REST',
                tone: 'signal',
              },
              {
                from: 1,
                to: 2,
                label: 'Session:ANCPolicy set on the session',
                dashed: true,
              },
              {
                from: 2,
                to: 3,
                label: 'CoA — UDP 1700 / 3799',
                sub: 'exception rule matched ANCPolicy',
                tone: 'signal',
              },
              { from: 3, to: 2, label: 'Access-Request, same session' },
              {
                from: 2,
                to: 3,
                label: 'Accept — quarantine dACL / VLAN / SGT',
                sub: 'or DenyAccess outright',
              },
              {
                from: 1,
                to: 0,
                label: 'Status on /topic/com.cisco.ise.anc',
                tone: 'muted',
                dashed: true,
              },
            ]}
          />
        </Stack>
      </Panel>

      {/* ---------------- how ANC is driven ---------------- */}
      <Panel title="Three ways to drive it" span={3} tone="quiet">
        <Stack gap={6}>
          <Split
            cols={1}
            parts={[
              {
                title: '1 — By hand',
                children: (
                  <Prose>
                    An operator assigns the policy by MAC or IP at{' '}
                    <M>Operations &gt; Adaptive Network Control &gt; Endpoint Assignment</M>,
                    or acts on the endpoint from Context Visibility. Fine for
                    incident response, useless as a control at scale.
                  </Prose>
                ),
              },
              {
                title: '2 — From authorization policy',
                children: (
                  <Prose>
                    An exception rule matching <M>Session:ANCPolicy</M> is what
                    turns an assignment into enforcement. Exceptions are
                    evaluated <strong>before</strong> the normal rule set, which
                    is why quarantine wins regardless of what the endpoint would
                    otherwise have matched.
                  </Prose>
                ),
              },
              {
                title: '3 — Programmatically',
                children: (
                  <Stack gap={5}>
                    <Prose>
                      Over <strong>pxGrid</strong> using{' '}
                      <M>com.cisco.ise.config.anc</M>, or over the{' '}
                      <strong>ERS / OpenAPI</strong> interface — create, read and
                      delete ANC policies, and apply or clear one against an
                      endpoint by MAC or IP.
                    </Prose>
                    <Note label="Approved is not authorised" tone="warn">
                      A pxGrid client being <strong>ENABLED</strong> is not
                      enough. It must also sit in the <strong>ANC</strong> group
                      under <M>Administration &gt; pxGrid Services &gt; Client Management &gt; Groups</M>.
                    </Note>
                  </Stack>
                ),
              },
            ]}
          />
        </Stack>
      </Panel>

      {/* ---------------- THE ACTION EXPLORER ---------------- */}
      <Panel
        title="ANC action explorer"
        span={12}
        tone="ink"
        right={
          <span className="normal-case tracking-normal">
            What ISE sends · what the NAD does · how you undo it
          </span>
        }
      >
        <Stack gap={8}>
          <div className="flex items-center justify-between gap-4">
            <Selector
              options={ACTIONS.map(x => ({ id: x.id, label: x.label, hint: x.gist }))}
              value={aid}
              onChange={setAid}
            />
            <Pill tone={a.scope === 'Wired only' ? 'bad' : 'good'}>{a.scope}</Pill>
          </div>

          <div className="border-t border-ink-200 pt-2">
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-4">
                <h4
                  className="text-[12px] font-bold tracking-tight text-ink-950"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  {a.name}
                </h4>
                <div className="mt-1">
                  <Prose>{a.gist}</Prose>
                </div>
                <div className="mt-2">
                  <KV items={a.coa} labelWidth={92} />
                </div>
              </div>

              <div className="col-span-3">
                <div
                  className="mb-1 border-b border-ink-300 pb-[2px] text-[9px] font-bold uppercase tracking-[0.11em] text-ink-950"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  What ISE sends
                </div>
                <Bullets items={a.sends} />
                <div className="mt-2">
                  <div
                    className="mb-1 border-b border-ink-300 pb-[2px] text-[9px] font-bold uppercase tracking-[0.11em] text-ink-950"
                    style={{ fontFamily: 'var(--font-heading)' }}
                  >
                    What the NAD does
                  </div>
                  <Bullets items={a.nad} />
                </div>
              </div>

              <div className="col-span-3">
                <div
                  className="mb-1 border-b border-ink-300 pb-[2px] text-[9px] font-bold uppercase tracking-[0.11em] text-ink-950"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  When to use it
                </div>
                <Bullets items={a.when} />
                <div className="mt-2">
                  <div
                    className="mb-1 border-b border-ink-300 pb-[2px] text-[9px] font-bold uppercase tracking-[0.11em] text-ink-950"
                    style={{ fontFamily: 'var(--font-heading)' }}
                  >
                    How to reverse it
                  </div>
                  <Prose>{a.reverse}</Prose>
                </div>
              </div>

              <div className="col-span-2">
                <Note label={a.note.label} tone={a.note.tone}>
                  {a.note.body}
                </Note>
              </div>
            </div>
          </div>
        </Stack>
      </Panel>

      {/* ---------------- building it ---------------- */}
      <Panel title="Building it — the rule quarantine actually needs" span={5}>
        <Stack gap={6}>
          <Steps
            items={[
              <>
                Create the restrictive <strong>authorization profile</strong> — a
                dACL, a quarantine VLAN, a quarantine SGT, or the built-in{' '}
                <M>DenyAccess</M>
              </>,
              <>
                Create the <strong>ANC policy</strong> at{' '}
                <M>Operations &gt; Adaptive Network Control &gt; Policy List &gt; Add</M>{' '}
                and choose the action
              </>,
              <>
                Create the <strong>authorization exception rule</strong> matching{' '}
                <M>Session:ANCPolicy</M>
              </>,
              <>Assign the policy to an endpoint by IP, by MAC, or over pxGrid / ERS</>,
            ]}
          />

          <Code
            title="The exception rule, and the NAD config that makes CoA land"
            code={`! ---- authorization EXCEPTION, run before the rule set ----
IF    Session:ANCPolicy  EQUALS  Quarantine
THEN  Quarantine_Profile     ! dACL / VLAN / SGT / DenyAccess

! ---- IOS-XE: without this the CoA is silently dropped ----
aaa server radius dynamic-author
 client 10.1.1.10 server-key <shared-secret>
 client 10.1.1.11 server-key <shared-secret>
 auth-type any
!
aaa authorization network default group ISE-GROUP
aaa accounting dot1x default start-stop group ISE-GROUP
radius-server vsa send authentication
radius-server vsa send accounting`}
          />

          <Table
            head={['CoA command on the device', 'Cisco VSA']}
            widths={['38%', '62%']}
            rows={[
              ['Bounce host port', <M key="a">subscriber:command=bounce-host-port</M>],
              ['Disable host port', <M key="b">subscriber:command=disable-host-port</M>],
              ['Reauthenticate host', <M key="c">subscriber:command=reauthenticate</M>],
              [
                'Terminate session',
                'A standard RFC 5176 Disconnect-Request — no VSA required',
              ],
            ]}
          />
        </Stack>
      </Panel>

      {/* ---------------- integrations ---------------- */}
      <Panel title="What drives ANC in practice" kicker="pxGrid subscribers" span={4}>
        <Stack gap={6}>
          <Table
            head={['Product', 'What it sees', 'What it asks ISE for']}
            widths={['30%', '38%', '32%']}
            rows={[
              [
                'Secure Network Analytics',
                'Flow anomalies against host groups, as a Custom Security Event',
                'A Response Management action that applies an ANC policy to the offending host',
              ],
              [
                'Secure Firewall (FMC)',
                'User- and SGT-aware policy hits; it already subscribes to the session directory',
                'Containment of a host it has just seen do something it does not like',
              ],
              [
                'Threat-Centric NAC',
                'Vulnerability and threat scores from AMP and Qualys, written onto the endpoint',
                'Nothing directly — it feeds authorization conditions instead of calling ANC',
              ],
              [
                'Any pxGrid client',
                'Whatever it is good at',
                <>
                  <M>com.cisco.ise.config.anc</M> to apply or clear, and{' '}
                  <M>/topic/com.cisco.ise.anc</M> to watch the result
                </>,
              ],
            ]}
          />

          <KV
            items={[
              ['Transport', <>REST and STOMP over WebSocket on <M>TCP 8910</M></>],
              ['Service', <M>com.cisco.ise.config.anc</M>],
              ['Status topic', <M>/topic/com.cisco.ise.anc</M>],
              ['Verify', <M>Administration &gt; pxGrid Services &gt; Diagnostics</M>],
            ]}
            labelWidth={62}
          />
        </Stack>
      </Panel>

      {/* ---------------- traps ---------------- */}
      <Panel title="The things that catch people" span={3}>
        <Stack gap={6}>
          <Note label="An assignment is not an enforcement" tone="warn">
            Assigning an ANC policy only sets <M>Session:ANCPolicy</M> and fires a
            CoA. Without an authorization exception rule matching that attribute
            the endpoint re-authorises straight back into full access, and the
            operator sees a policy applied and nothing happen.
          </Note>

          <Note label="Un-assigning Shut_Down does nothing" tone="warn">
            A CoA is triggered when Quarantine, Port_Bounce or Re_Authenticate is
            assigned <em>or</em> unassigned. It is{' '}
            <strong>not</strong> triggered when a Shut_Down policy is unassigned.
            The port stays down until someone touches the switch.
          </Note>

          <Bullets
            items={[
              <>
                <strong>Only Quarantine and Re_Authenticate combine.</strong>{' '}
                Every other pairing is unsupported. <strong>Shut_Down is
                unavailable for wireless</strong> — there is no NAS port
              </>,
              <>
                <strong>Shut Down and Port Bounce hit the port, not the
                endpoint.</strong> On a multi-domain or multi-auth port that
                means the phone, the AP and everyone else behind it
              </>,
              <>
                <strong>No active session, no ANC.</strong> An endpoint ISE has
                only ever profiled cannot be quarantined
              </>,
              <>
                <strong>Test the exception rule before the integration.</strong>{' '}
                Assign by hand from Endpoint Assignment and watch Live Logs for
                the CoA and the re-authorisation. If that fails, no amount of
                pxGrid debugging will help
              </>,
            ]}
          />
        </Stack>
      </Panel>
    </Sheet>
  )
}
