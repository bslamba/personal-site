'use client'

// ============================================================
// Topic — IBNS 2.0 and C3PL
//
// The event explorer is the interactive part: pick an event in
// the identity control policy and you get what fires it, the
// class-maps it needs, the verbatim policy block, and what the
// switch actually does when it runs.
//
// Configuration is transcribed from the two sources the author
// asked for — the network-node.com C3PL walkthrough and Cisco's
// IBNS 2.0 troubleshooting document — rather than paraphrased.
// Where the two differ (do-all against do-until-failure,
// match-all against match-first) both are shown, because both
// are legitimate and the difference matters.
// ============================================================

import React, { useState } from 'react'
import {
  Sheet,
  Panel,
  Table,
  KV,
  Note,
  Prose,
  Stack,
  Code,
  Pill,
  M,
  Split,
  Flow,
  Selector,
} from '../sheet-kit'

interface EventSpec {
  id: string
  label: string
  name: string
  fires: React.ReactNode
  does: React.ReactNode
  needs?: { title: string; code: string }
  block: { title: string; code: string }
  note?: { label: string; tone?: 'signal' | 'warn' | 'good'; body: React.ReactNode }
}

const EVENTS: EventSpec[] = [
  {
    id: 'session-started',
    label: 'session-started',
    name: 'event session-started',
    fires: (
      <>
        Link comes up and the Access Session Manager sees a new MAC on the
        port. This is the entry point of every policy — if you write nothing
        else, write this.
      </>
    ),
    does: (
      <>
        Starts both authentication methods with a priority each. This is the
        single biggest behavioural change from IBNS 1.0: 802.1X and MAB run{' '}
        <strong>concurrently</strong>, not one after the other, so a MAB-only
        endpoint no longer waits out the full dot1x timeout before it gets on.
        Priority decides which result wins if both succeed.
      </>
    ),
    block: {
      title: 'Start both methods, dot1x wins',
      code: `policy-map type control subscriber DOT1X-DEFAULT
 event session-started match-all
  10 class always do-all
   10 authenticate using dot1x priority 10
   20 authenticate using mab priority 20`,
    },
    note: {
      label: 'Priority, not order',
      tone: 'good',
      body: (
        <>
          A lower number is a stronger method. With dot1x at 10 and MAB at 20, a
          printer that answers MAB gets on immediately, and if a supplicant later
          answers 802.1X on the same port the stronger method takes the session
          over.
        </>
      ),
    },
  },

  {
    id: 'authentication-failure',
    label: 'authentication-failure',
    name: 'event authentication-failure',
    fires: (
      <>
        A method returned a definitive failure, or timed out, or the RADIUS
        server did not answer at all. Every one of those is a different problem
        and deserves a different response — which is the whole reason C3PL
        exists.
      </>
    ),
    does: (
      <>
        Classes are evaluated in order, and the first matching class decides.
        Separate <M>aaa-timeout</M> (the server is down — this is not the
        endpoint&rsquo;s fault) from a real dot1x failure (no supplicant, so try
        MAB) from a real MAB failure (nothing here is allowed on).
      </>
    ),
    needs: {
      title: 'The class-maps this event needs',
      code: `! the server did not answer
class-map type control subscriber match-any AAA-DOWN
 match result-type aaa-timeout

! dot1x ran and there was no supplicant
class-map type control subscriber match-all DOT1X_NO_RESP
 match method dot1x
 match result-type method dot1x agent-not-found

! dot1x ran and the switch got an authoritative failure
class-map type control subscriber match-all DOT1X-FAILED
 match method dot1x
 match result-type method dot1x authoritative

! MAB ran and ISE said no
class-map type control subscriber match-all MAB_FAILED
 match method mab
 match result-type method mab authoritative`,
    },
    block: {
      title: 'Three different failures, three different answers',
      code: `policy-map type control subscriber DOT1X-DEFAULT
 event authentication-failure match-first
  ! 1. ISE is unreachable - authorise locally, do not punish the user
  10 class AAA-DOWN do-all
   10 authorize
   20 activate service-template CRITICAL
   30 terminate dot1x
   40 terminate mab
  ! 2. No supplicant answered - fall through to MAB
  20 class DOT1X_NO_RESP do-until-failure
   10 terminate dot1x
   20 authenticate using mab priority 20
  ! 3. MAB was rejected - stop, and retry in a minute
  30 class MAB_FAILED do-until-failure
   10 terminate mab
   20 authentication-restart 60
  ! 4. Anything else - clear down and retry
  40 class always do-until-failure
   10 terminate dot1x
   20 terminate mab
   30 authentication-restart 60`,
    },
    note: {
      label: 'This is the payoff',
      tone: 'good',
      body: (
        <>
          In IBNS 1.0 a dead RADIUS server dropped the endpoint into a critical{' '}
          <em>VLAN</em>, which meant renumbering and often a broken session.
          Here it stays on its own VLAN and simply gets a permissive ACL from a
          service template. Nothing moves.
        </>
      ),
    },
  },

  {
    id: 'agent-found',
    label: 'agent-found',
    name: 'event agent-found',
    fires: (
      <>
        An EAPoL-Start arrived on a port that had already settled — typically a
        laptop that MAB let on, whose supplicant has now woken up.
      </>
    ),
    does: (
      <>
        Tears down the weaker method and re-runs 802.1X so the session is
        upgraded to the strong credential. Without this event the endpoint would
        sit on its MAB authorisation for the life of the session.
      </>
    ),
    block: {
      title: 'Upgrade the session to 802.1X',
      code: `policy-map type control subscriber DOT1X-DEFAULT
 event agent-found match-all
  10 class always do-until-failure
   10 terminate mab
   20 authenticate using dot1x priority 10`,
    },
    note: {
      label: 'Order matters here',
      body: (
        <>
          Terminate MAB <em>before</em> starting dot1x. Leaving both running on
          a single-host port is how you end up with a session that flaps between
          two authorization profiles.
        </>
      ),
    },
  },

  {
    id: 'violation',
    label: 'violation',
    name: 'event violation',
    fires: (
      <>
        More MACs appeared on the port than the host mode permits — a hub, an
        unmanaged switch, or a second device behind a phone on a port set to
        multi-domain.
      </>
    ),
    does: (
      <>
        Decides what to do about the extra MAC. <M>restrict</M> drops its
        traffic and leaves the existing session alone. The alternatives are{' '}
        <M>protect</M>, and shutting the port — which on a port with a phone on
        it takes the phone down too.
      </>
    ),
    block: {
      title: 'Drop the extra MAC, keep the session',
      code: `policy-map type control subscriber DOT1X-DEFAULT
 event violation match-all
  10 class always do-all
   10 restrict`,
    },
    note: {
      label: 'Do not reach for shutdown',
      tone: 'warn',
      body: (
        <>
          A violation on an access port is far more often someone plugging in a
          desk switch than an attack. <M>restrict</M> contains it and leaves you
          a log entry; a shutdown creates a support call and, on a
          phone-plus-PC port, takes out the phone as well.
        </>
      ),
    },
  },

  {
    id: 'aaa-available',
    label: 'aaa-available',
    name: 'event aaa-available',
    fires: (
      <>
        RADIUS comes back. The switch learns this from the{' '}
        <M>automate-tester</M> probe on the server definition, which is why that
        line is not optional.
      </>
    ),
    does: (
      <>
        Unwinds critical authorisation: remove the emergency service template
        and re-authenticate everything properly, so sessions that came up during
        the outage get their real authorization profile.
      </>
    ),
    needs: {
      title: 'The probe that makes recovery automatic',
      code: `radius server ise
 address ipv4 10.1.1.10 auth-port 1812 acct-port 1813
 automate-tester username probe-user
 key <shared-secret>`,
    },
    block: {
      title: 'Come back out of critical auth',
      code: `policy-map type control subscriber DOT1X-DEFAULT
 event aaa-available match-all
  10 class IN-CRITICAL-AUTH do-until-failure
   10 clear-authenticated-data-hosts-on-port
   20 activate service-template DEFAULT_LINKSEC_POLICY_SHOULD_SECURE
   30 authenticate using dot1x priority 10
   40 authenticate using mab priority 20
  20 class NOT-IN-CRITICAL-AUTH do-until-failure
   10 terminate dot1x
   20 terminate mab
   30 authenticate using dot1x priority 10
   40 authenticate using mab priority 20`,
    },
    note: {
      label: 'Verify this one on your platform',
      tone: 'warn',
      body: (
        <>
          The two class names above are the conventional built-in pair, and the
          shape of this event is standard, but neither of the two sources this
          sheet is built from transcribes it. Treat it as a pattern to check
          against your own IOS-XE release, not as a quoted configuration.
        </>
      ),
    },
  },
]

export default function IbnsSheet() {
  const [eventId, setEventId] = useState(EVENTS[0].id)
  const ev = EVENTS.find(e => e.id === eventId) ?? EVENTS[0]

  return (
    <Sheet>
      {/* ---------------- 1.0 vs 2.0 ---------------- */}
      <Panel title="IBNS 1.0 against IBNS 2.0" kicker="What actually changed" span={4}>
        <Stack gap={6}>
          <Prose>
            The legacy <M>authentication</M> commands are knobs on a fixed state
            machine: you set them, and the switch decides what to do. IBNS 2.0
            replaces that machine with <strong>C3PL</strong> — Cisco Common
            Classification Policy Language — so you write the state machine
            yourself, as <strong>event → class → action</strong>.
          </Prose>
          <Table
            head={['', 'IBNS 1.0', 'IBNS 2.0 / C3PL']}
            widths={['24%', '38%', '38%']}
            rows={[
              [
                'Model',
                'Fixed state machine, configured by knobs',
                'A policy you write: events, classes, ordered actions',
              ],
              [
                'Methods',
                'Sequential — dot1x must time out before MAB starts',
                'Concurrent, each with a priority. No waiting',
              ],
              [
                'Failure handling',
                'One response to every kind of failure',
                'A different response per failure class',
              ],
              [
                'Server down',
                'Critical VLAN — the endpoint is renumbered',
                'Critical ACL via a service template — nothing moves',
              ],
              [
                'Reuse',
                'Configuration repeated on every interface',
                'Held in memory once and called many times',
              ],
              [
                'Per-interface AAA',
                'One global server list',
                'Differentiated Authentication — servers per interface',
              ],
            ]}
          />
        </Stack>
      </Panel>

      {/* ---------------- object model ---------------- */}
      <Panel title="The C3PL object model" kicker="What you build, in order" span={4} tone="signal">
        <Stack gap={6}>
          <Flow
            steps={[
              { label: 'Class-map', detail: 'match a condition' },
              { label: 'Service template', detail: 'what to apply' },
              { label: 'Policy-map', detail: 'event → class → action', tone: 'signal' },
              { label: 'Interface', detail: 'service-policy' },
            ]}
          />
          <KV
            items={[
              [
                'Class-map',
                <>
                  <M>type control subscriber</M>, <M>match-all</M> or{' '}
                  <M>match-any</M>. Matches on method, result type, and session
                  state
                </>,
              ],
              [
                'Service template',
                <>
                  A named bundle of things to apply to a session — an ACL, a
                  VLAN, a timer. Local on the switch, or pushed by ISE with{' '}
                  <M>subscriber:service-name</M>
                </>,
              ],
              [
                'Policy-map',
                <>
                  <M>type control subscriber</M> — the Identity Control Policy.
                  Numbered classes inside numbered events, numbered actions
                  inside each class
                </>,
              ],
              [
                'Interface template',
                <>Binds a set of interface commands to many ports at once</>,
              ],
              [
                'Session Manager',
                <>
                  Runs the policy and owns MAB, 802.1X, WebAuth, VLAN, dACL and
                  SGT for the session
                </>,
              ],
            ]}
            labelWidth={82}
          />
          <Split
            cols={2}
            parts={[
              {
                title: 'do-all',
                children: (
                  <Prose>
                    Run every action in the class, regardless of whether an
                    earlier one failed.
                  </Prose>
                ),
              },
              {
                title: 'do-until-failure',
                children: (
                  <Prose>
                    Stop at the first action that fails. The safer default for
                    anything sequential.
                  </Prose>
                ),
              },
            ]}
          />
        </Stack>
      </Panel>

      {/* ---------------- conversion ---------------- */}
      <Panel title="Switching a switch to new style" kicker="Do this before you touch anything" span={4} tone="quiet">
        <Stack gap={6}>
          <Code
            title="The display mode"
            code={`! show and accept the C3PL syntax
authentication display new-style

! verification changes with it
show access-session interface Gi1/0/1 details    <-- new style
show authentication session interface Gi1/0/1 detail   <-- legacy, stops working`}
          />
          <Note label="Clear the ports first" tone="warn">
            If existing 802.1X port configuration is still in place when you run{' '}
            <M>authentication display new-style</M>, the switch converts{' '}
            <strong>every port&rsquo;s configuration into its own individual
            C3PL policy</strong>. You end up with one policy per interface,
            which is the opposite of the point. Strip the interfaces back first,
            then convert, then apply one consistent policy.
          </Note>
          <Split
            cols={1}
            parts={[
              {
                title: 'Global configuration, unchanged',
                children: (
                  <Code
                    code={`aaa new-model
aaa authentication dot1x default group radius
aaa authorization exec default local
aaa authorization network default group radius
aaa accounting identity default start-stop group radius
aaa session-id common
dot1x system-auth-control`}
                  />
                ),
              },
            ]}
          />
        </Stack>
      </Panel>

      {/* ---------------- THE EVENT EXPLORER ---------------- */}
      <Panel
        title="Identity control policy explorer"
        span={12}
        tone="ink"
        right={
          <span className="normal-case tracking-normal">
            Pick an event — this is the whole policy, one event at a time
          </span>
        }
      >
        <Stack gap={7}>
          <div className="flex items-center justify-between gap-4">
            <Selector
              options={EVENTS.map(e => ({ id: e.id, label: e.label }))}
              value={eventId}
              onChange={setEventId}
              label="Event"
            />
            <Pill tone="signal">{ev.name}</Pill>
          </div>

          <div className="grid grid-cols-12 gap-3 border-t border-ink-200 pt-2">
            <div className="col-span-3">
              <div
                className="mb-[3px] border-b border-ink-300 pb-[1px] text-[9px] font-bold uppercase tracking-[0.1em] text-ink-950"
                style={{ fontFamily: 'var(--font-heading)' }}
              >
                What fires it
              </div>
              <Prose>{ev.fires}</Prose>

              <div
                className="mb-[3px] mt-2 border-b border-ink-300 pb-[1px] text-[9px] font-bold uppercase tracking-[0.1em] text-ink-950"
                style={{ fontFamily: 'var(--font-heading)' }}
              >
                What it does
              </div>
              <Prose>{ev.does}</Prose>

              {ev.note && (
                <div className="mt-2">
                  <Note label={ev.note.label} tone={ev.note.tone}>
                    {ev.note.body}
                  </Note>
                </div>
              )}
            </div>

            <div className="col-span-4">
              <div
                className="mb-[3px] border-b border-ink-300 pb-[1px] text-[9px] font-bold uppercase tracking-[0.1em] text-ink-950"
                style={{ fontFamily: 'var(--font-heading)' }}
              >
                What it depends on
              </div>
              {ev.needs ? (
                <Code title={ev.needs.title} code={ev.needs.code} />
              ) : (
                <Prose>
                  Nothing beyond the policy-map itself — this event matches{' '}
                  <M>class always</M>.
                </Prose>
              )}
            </div>

            <div className="col-span-5">
              <div
                className="mb-[3px] border-b border-ink-300 pb-[1px] text-[9px] font-bold uppercase tracking-[0.1em] text-ink-950"
                style={{ fontFamily: 'var(--font-heading)' }}
              >
                The policy block
              </div>
              <Code title={ev.block.title} code={ev.block.code} />
            </div>
          </div>
        </Stack>
      </Panel>

      {/* ---------------- the whole thing ---------------- */}
      <Panel title="A complete, working configuration" kicker="Copy this · click to enlarge" span={6}>
        <div className="grid grid-cols-2 gap-2">
          <Code
            title="1–3 · AAA, the fallback, the conditions"
            code={`aaa new-model
aaa authentication dot1x default group radius
aaa authorization network default group radius
aaa accounting identity default start-stop group radius
aaa session-id common
dot1x system-auth-control
!
radius server ise
 address ipv4 10.1.1.10 auth-port 1812 acct-port 1813
 automate-tester username probe-user
 key <shared-secret>
!
aaa server radius dynamic-author
 client 10.1.1.10 server-key <shared-secret>
 auth-type any
!
! what to apply when ISE is down
ip access-list extended ACL-ALLOW
 permit ip any any
!
service-template CRITICAL
 access-group ACL-ALLOW
!
! the conditions
class-map type control subscriber match-any AAA-DOWN
 match result-type aaa-timeout
!
class-map type control subscriber match-all DOT1X_NO_RESP
 match method dot1x
 match result-type method dot1x agent-not-found
!
class-map type control subscriber match-all MAB_FAILED
 match method mab
 match result-type method mab authoritative`}
          />
          <Code
            title="4–5 · The policy, and the port"
            code={`policy-map type control subscriber DOT1X-DEFAULT
 event session-started match-all
  10 class always do-all
   10 authenticate using dot1x priority 10
   20 authenticate using mab priority 20
 event authentication-failure match-first
  10 class AAA-DOWN do-all
   10 authorize
   20 activate service-template CRITICAL
   30 terminate dot1x
   40 terminate mab
  20 class DOT1X_NO_RESP do-until-failure
   10 terminate dot1x
   20 authenticate using mab priority 20
  30 class MAB_FAILED do-until-failure
   10 terminate mab
   20 authentication-restart 60
  40 class always do-until-failure
   10 terminate dot1x
   20 terminate mab
   30 authentication-restart 60
 event agent-found match-all
  10 class always do-until-failure
   10 terminate mab
   20 authenticate using dot1x priority 10
 event violation match-all
  10 class always do-all
   10 restrict
!
interface range GigabitEthernet1/0/1-24
 switchport mode access
 switchport access vlan 100
 switchport voice vlan 10
 ip access-group IPV4-PRE-AUTH-ACL in
 access-session host-mode multi-auth
 access-session port-control auto
 access-session closed
 mab
 dot1x pae authenticator
 dot1x timeout tx-period 10
 authentication periodic
 authentication timer reauthenticate server
 spanning-tree portfast
 service-policy type control subscriber DOT1X-DEFAULT`}
          />
        </div>
      </Panel>

      {/* ---------------- verify ---------------- */}
      <Panel title="Verify and debug" kicker="New-style commands" span={3} tone="quiet">
        <Stack gap={6}>
          <Code
            title="Verify"
            code={`show access-session interface Gi1/0/1 details
show access-session
show class-map type control subscriber all
show policy-map type control subscriber name DOT1X-DEFAULT
show service-template
show aaa servers
show authentication display`}
          />
          <Code
            title="Debug — into the buffer, never the console"
            code={`debug mab all
debug dot1x all
debug radius
debug aaa authentication
debug aaa authorization`}
          />
          <Note label="The one that catches people out">
            <M>show authentication session … detail</M> stops returning anything
            useful once the switch is in new style. The command is now{' '}
            <M>show access-session … details</M> — note the plural.
          </Note>
        </Stack>
      </Panel>

      {/* ---------------- gotchas ---------------- */}
      <Panel title="What usually goes wrong" span={3}>
        <Stack gap={5}>
          <Table
            head={['Symptom', 'Usually because']}
            widths={['40%', '60%']}
            rows={[
              [
                'A policy per port appeared',
                <>
                  <M>authentication display new-style</M> was run with port
                  configuration still in place
                </>,
              ],
              [
                'Nothing authenticates',
                <>
                  No <M>service-policy type control subscriber</M> on the
                  interface — the policy exists but nothing calls it
                </>,
              ],
              [
                'MAB never runs',
                <>
                  No <M>mab</M> on the interface, or the failure event has no
                  class for <M>agent-not-found</M>
                </>,
              ],
              [
                'Critical auth never fires',
                <>
                  No <M>automate-tester</M>, so the switch never marks the
                  server dead and never returns <M>aaa-timeout</M>
                </>,
              ],
              [
                'Sessions never recover',
                <>
                  No <M>aaa-available</M> event, so endpoints stay on the
                  critical template after ISE returns
                </>,
              ],
              [
                'Show command empty',
                <>Still typing the legacy <M>show authentication session</M></>,
              ],
            ]}
          />
        </Stack>
      </Panel>
    </Sheet>
  )
}
