'use client'

// ============================================================
// Topic — 802.1X Wired Access
//
// C3PL and the identity control policy have a sheet of their own
// — this one stays on the mechanism and the rollout phases.
//
// The deployment-mode explorer is the heart of the sheet: pick
// Monitor, Low-Impact or Closed and you get that mode's goals,
// what it blocks before and after authentication, and the full
// verbatim interface configuration from the workbook.
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
} from '../sheet-kit'

type ModeId = 'monitor' | 'lowimpact' | 'closed'

interface Mode {
  id: ModeId
  label: string
  name: string
  hint: string
  tone: 'good' | 'warn' | 'bad'
  stance: string
  gist: string
  goals: React.ReactNode[]
  before: React.ReactNode
  after: React.ReactNode
  blocks: React.ReactNode
  build: React.ReactNode[]
  configs: { title: string; code: string }[]
  note: { label: string; tone?: 'signal' | 'warn' | 'good'; body: React.ReactNode }
}

const MODES: Mode[] = [
  {
    id: 'monitor',
    label: 'Monitor Mode',
    name: 'Monitor Mode',
    hint: 'Open access. Authenticate everything, block nothing.',
    tone: 'good',
    stance: 'Port open unconditionally',
    gist:
      'Phase one of every sane rollout. Authentication runs and is logged, but the result is never enforced, so a broken supplicant cannot take a user off the network. You are buying visibility, not control.',
    goals: [
      'No impact to existing network access',
      <>
        See what is on the network — who has a supplicant, who has good
        credentials, who has bad credentials
      </>,
      'Deterrence through accountability',
    ],
    before: <>DHCP, TFTP, EAPoL and HTTP all pass</>,
    after: <>Identical. Nothing changes on success or failure</>,
    blocks: (
      <>
        <strong>Nothing.</strong> Traffic is always allowed irrespective of
        authentication status
      </>
    ),
    build: [
      'Enable 802.1X and MAB',
      <>
        Enable Open Access — &ldquo;all traffic in addition to EAP is allowed.
        Like not having 802.1X enabled except authentications still occur&rdquo;
      </>,
      'Enable Multi-Auth host mode',
      <>
        <strong>No Authorization</strong> — no dACL, no VLAN, no SGT
      </>,
    ],
    configs: [
      {
        title: 'Monitor Mode — interface, verbatim',
        code: `interface GigabitEthernet1/0/1
switchport access vlan 100
switchport mode access
switchport voice vlan 10
authentication host-mode multi-auth
authentication open
authentication port-control auto
mab
dot1x pae authenticator
authentication violation restrict`,
      },
    ],
    note: {
      label: 'Read the logs, not the ports',
      tone: 'good',
      body: (
        <>
          The whole value of Monitor Mode is in{' '}
          <M>Operations &gt; RADIUS &gt; Live Logs</M>. Sit here until failed
          authentications stop being a surprise — every one is a device you would
          have cut off the day you turned enforcement on.
        </>
      ),
    },
  },

  {
    id: 'lowimpact',
    label: 'Low-Impact Mode',
    name: 'Low-Impact Mode',
    hint: 'Open access plus a pre-auth port ACL. Enforce with dACLs.',
    tone: 'warn',
    stance: 'Open, but filtered by an IP ACL',
    gist:
      'Still open access, but a static ingress ACL on the port limits what an unauthenticated endpoint can reach. On success ISE downloads a dACL, which is prepended to that port ACL. The VLAN design never changes.',
    goals: [
      'Begin to control and differentiate network access',
      'Minimise impact to existing network access',
      'Retain the visibility of Monitor Mode',
      <>
        <strong>&ldquo;Low Impact&rdquo; means no need to re-architect your
        network</strong> — keep the existing VLAN design, minimise changes
      </>,
    ],
    before: (
      <>
        Only what <M>PRE-AUTH</M> permits — DHCP, DNS and EAPoL. Everything else
        denied
      </>
    ),
    after: (
      <>
        The downloaded dACL is prepended above the port ACL, so{' '}
        <M>permit ip any any</M> grants full access
      </>
    ),
    blocks: (
      <>
        Pre-auth and post-auth access are both controlled by{' '}
        <strong>IP ACLs</strong>, not by the VLAN
      </>
    ),
    build: [
      'Start from Monitor Mode',
      'Add ACLs, dACLs and flex-auth',
      'Limit the number of devices connecting to the port',
      'Authorize phones with dACLs and the Voice VSA',
    ],
    configs: [
      {
        title: 'Low-Impact Mode — interface, verbatim',
        code: `interface GigabitEthernet1/0/1
switchport access vlan 100
switchport mode access
switchport voice vlan 10
authentication host-mode multi-auth
ip access-group PRE-AUTH in
authentication open
authentication port-control auto
mab
dot1x pae authenticator
authentication violation restrict`,
      },
      {
        title: 'The pre-auth ACL that goes with it',
        code: `ip access-list extended IPV4_PRE_AUTH_ACL
 permit udp any eq bootpc any eq bootps
 permit udp any any eq domain
 deny ip any any`,
      },
    ],
    note: {
      label: 'The ACL is an ingress filter, not a policy',
      body: (
        <>
          The port ACL stays in force for the life of the port. A dACL does not
          replace it — it is inserted <em>above</em> it. So anything the port ACL
          denies and the dACL does not explicitly permit is still dropped, and
          that is exactly the trap the Critical ACL panel describes.
        </>
      ),
    },
  },

  {
    id: 'closed',
    label: 'Closed Mode',
    name: 'Closed Mode',
    hint: 'The IEEE default. Only EAPoL before authentication.',
    tone: 'bad',
    stance: 'Only EAP allowed',
    gist:
      'The standard as written: the port carries nothing but EAPoL until authentication succeeds. Enforcement is by VLAN, so this is where identity-based segmentation lives — and where every timer and every failure event has to be thought about, because there is no safety net.',
    goals: [
      'As per the IEEE specification for 802.1X',
      'No access before authentication',
      'Rapid access for non-802.1X-capable corporate assets',
      'Logical isolation of traffic at the access edge — VLAN segmentation',
    ],
    before: <>EAPoL only. No DHCP, no DNS, no data of any kind</>,
    after: <>Specific access on authentication success — VLAN and/or dACL</>,
    blocks: (
      <>
        <strong>Everything except EAPoL.</strong> A device without a supplicant
        gets nothing until MAB or an event action rescues it
      </>
    ),
    build: [
      'Return to the default "closed" access',
      'Timers or authentication order change',
      'Implement identity-based VLAN assignment',
      <>
        Give <M>fail</M>, <M>no-resp</M> and <M>server dead</M> somewhere to land
        — here, VLAN 101
      </>,
    ],
    configs: [
      {
        title: 'Closed Mode — interface, verbatim',
        code: `interface GigabitEthernet1/0/1
switchport access vlan 100
switchport mode access
switchport voice vlan 10
no authentication open
authentication event fail authorize vlan 101
authentication event no-resp authorize vlan 101
authentication event server dead action authorize vlan 101
authentication port-control auto
mab
dot1x pae authenticator
dot1x timer tx-period 10`,
      },
    ],
    note: {
      label: 'Why tx-period drops to 10',
      tone: 'warn',
      body: (
        <>
          In Closed Mode a device with no supplicant sits with a dead port for the
          whole 802.1X timeout before MAB is even tried. The workbook cuts{' '}
          <M>tx-period</M> from the 30-second default to 10 to shorten that wait.
          Cut it too far and slow supplicants never get to answer.
        </>
      ),
    },
  },
]

export default function Dot1xSheet() {
  const [modeId, setModeId] = useState<ModeId>('monitor')
  const mode = MODES.find(m => m.id === modeId) ?? MODES[0]

  return (
    <Sheet>
      {/* ---------------- the three roles ---------------- */}
      <Panel title="802.1X on a switchport" kicker="Three roles, one port" span={4}>
        <Stack gap={6}>
          <KV
            items={[
              [
                'Supplicant',
                <>
                  The software on the endpoint that speaks EAP. On Windows this is
                  the <strong>Wired AutoConfig</strong> service — it must be
                  Running or there is no wired supplicant at all
                </>,
              ],
              [
                'Authenticator',
                <>
                  The switch. It relays EAP, holds the port state and applies
                  whatever ISE returns. It never validates a credential itself
                </>,
              ],
              [
                'Auth server',
                <>ISE. Terminates EAP, evaluates policy, returns the authorization</>,
              ],
              [
                'Transport',
                <>
                  Endpoint↔switch is <strong>EAPoL</strong> over the L2 link;
                  switch↔ISE is <strong>RADIUS</strong> over L3
                </>,
              ],
            ]}
            labelWidth={62}
          />
          <Table
            head={['port-control', 'Port behaviour']}
            widths={['40%', '60%']}
            rows={[
              [
                <M>auto</M>,
                'Starts unauthorised. Authorises only on a successful authentication. The only value that does anything useful',
              ],
              [
                <M>force-authorized</M>,
                'Default. Port is always authorised — 802.1X is effectively off',
              ],
              [
                <M>force-unauthorized</M>,
                'Port never authorises. A blackhole with a config line',
              ],
            ]}
          />
        </Stack>
      </Panel>

      {/* ---------------- flexauth ---------------- */}
      <Panel title="Flexible Authentication" kicker="Order and priority" span={4} tone="signal">
        <Stack gap={6}>
          <Prose>
            FlexAuth is the set of features that lets you configure the{' '}
            <strong>sequence</strong> and <strong>priority</strong> of 802.1X, MAB
            and local WebAuth on a port. The ladder runs{' '}
            <strong>802.1X → MAB → WebAuth</strong>, triggered by a .1X timeout and
            then a MAB failure.
          </Prose>
          <Code
            title="FlexAuth — interface, verbatim"
            code={`interface GigabitEthernet1/0/1
 switchport access vlan 100
 switchport voice vlan 10
 switchport mode access
 authentication host-mode multi-auth
 authentication order dot1x mab webauth
 authentication priority dot1x webauth
 mab
 authentication port-control auto
 dot1x pae authenticator
!`}
          />
          <Note label="Order is not priority">
            <M>order</M> decides which method is <em>tried</em> first.{' '}
            <M>priority</M> decides which method <em>wins</em> if a higher one
            turns up later — so a device already on via MAB is re-authenticated by
            802.1X the moment a supplicant starts talking.
          </Note>
        </Stack>
      </Panel>

      {/* ---------------- host modes ---------------- */}
      <Panel title="Host modes — limiting sessions" span={4}>
        <Stack gap={6}>
          <Table
            head={['Host mode', 'Behaviour', 'Command']}
            widths={['22%', '48%', '30%']}
            rows={[
              [
                'Single-host',
                'Only one MAC address is allowed. A second MAC causes a security violation',
                <M>host-mode single-host</M>,
              ],
              [
                'Multi-host',
                'The first MAC authenticates. The second endpoint piggybacks on that authentication and bypasses authentication entirely',
                <M>host-mode multi-host</M>,
              ],
              [
                'Multi-domain',
                'Each domain — voice or data — authenticates one MAC. A second MAC in either domain causes a security violation',
                <M>host-mode multi-domain</M>,
              ],
              [
                'Multi-auth',
                'The voice domain authenticates one MAC; the data domain authenticates many. dACL or a single VLAN assignment for all devices',
                <M>host-mode multi-auth</M>,
              ],
            ]}
          />
          <Note label="Multi-host is not a security mode" tone="warn">
            Piggybacking is the point of <M>multi-host</M> — everything behind the
            first authenticated MAC is trusted. Use <M>multi-auth</M> unless you
            have a specific reason not to. The workbook pairs it with{' '}
            <M>authentication violation restrict</M>, which denies and logs the
            offending MAC instead of err-disabling the port.
          </Note>
        </Stack>
      </Panel>

      {/* ---------------- THE DEPLOYMENT MODE EXPLORER ---------------- */}
      <Panel
        title="Deployment mode explorer"
        span={8}
        tone="ink"
        right={
          <span className="normal-case tracking-normal">
            Deploy in phases — Monitor, then Low-Impact, then Closed
          </span>
        }
      >
        <Stack gap={8}>
          <div className="flex items-center justify-between gap-4">
            <Selector
              options={MODES.map(m => ({ id: m.id, label: m.label, hint: m.hint }))}
              value={modeId}
              onChange={setModeId}
            />
            <Pill tone={mode.tone}>{mode.stance}</Pill>
          </div>

          <div className="border-t border-ink-200 pt-2">
            <div className="grid grid-cols-12 gap-3">
              {/* left: what it is for */}
              <div className="col-span-4">
                <h4
                  className="text-[12px] font-bold tracking-tight text-ink-950"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  {mode.name}
                </h4>
                <div className="mt-1">
                  <Prose>{mode.gist}</Prose>
                </div>
                <div className="mt-2">
                  <div
                    className="mb-1 border-b border-ink-300 pb-[2px] text-[9px] font-bold uppercase tracking-[0.11em] text-ink-950"
                    style={{ fontFamily: 'var(--font-heading)' }}
                  >
                    Goals
                  </div>
                  <Bullets items={mode.goals} />
                </div>
              </div>

              {/* middle: what it blocks, how it is built */}
              <div className="col-span-3">
                <div
                  className="mb-1 border-b border-ink-300 pb-[2px] text-[9px] font-bold uppercase tracking-[0.11em] text-ink-950"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  What passes the port
                </div>
                <KV
                  items={[
                    ['Before auth', mode.before],
                    ['After auth', mode.after],
                    ['Blocks', mode.blocks],
                  ]}
                  labelWidth={60}
                />
                <div className="mt-2">
                  <div
                    className="mb-1 border-b border-ink-300 pb-[2px] text-[9px] font-bold uppercase tracking-[0.11em] text-ink-950"
                    style={{ fontFamily: 'var(--font-heading)' }}
                  >
                    How it is built
                  </div>
                  <Bullets items={mode.build} />
                </div>
              </div>

              {/* right: the configuration */}
              <div className="col-span-5">
                <Stack gap={6}>
                  {mode.configs.map(c => (
                    <Code key={c.title} title={c.title} code={c.code} />
                  ))}
                  <Note label={mode.note.label} tone={mode.note.tone}>
                    {mode.note.body}
                  </Note>
                </Stack>
              </div>
            </div>
          </div>
        </Stack>
      </Panel>

      {/* ---------------- timers, verify, debug ---------------- */}
      <Panel title="Timers, verify, debug" span={4} tone="quiet">
        <Stack gap={6}>
          <Table
            head={['Timer', 'Where', 'Default']}
            widths={['50%', '26%', '24%']}
            rows={[
              [<M>StartPeriod</M>, 'Supplicant', '30 s'],
              [<M>AuthPeriod</M>, 'Supplicant', '30 s'],
              [<M>dot1x timeout tx-period</M>, 'NAD', '30'],
              [<M>dot1x max reauth-request</M>, 'NAD', '2'],
              [<M>dot1x timeout supp-timeout</M>, 'NAD', '30'],
              [<M>dot1x max-req</M>, 'NAD', '2'],
              [<M>radius-server timeout</M>, 'NAD', '5'],
              [<M>radius-server retransmit</M>, 'NAD', '3'],
              [
                'EAP session timer',
                'ISE',
                <>
                  120 s
                  <div className="text-ink-400">not configurable</div>
                </>,
              ],
            ]}
          />
          <Split
            cols={1}
            parts={[
              {
                title: 'Verify',
                children: (
                  <Bullets
                    items={[
                      <M>show aaa servers</M>,
                      <M>sh run aaa</M>,
                      <M>
                        test aaa group radius server &lt;A.B.C.D&gt; GroupName
                        Username Password legacy/new style
                      </M>,
                      <M>
                        show authentication sessions interface gigabitEthernet
                        0/1/0 details
                      </M>,
                    ]}
                  />
                ),
              },
            ]}
          />
          <Code
            title="Debug — into the buffer, never the console"
            code={`debug radius
debug dot1x all
debug epm all        ! authorization failures
!
no logging console
no logging monitor
logging buffered 7   ! level first; it resets the size
logging buffered 10000000
clear logging
show logging`}
          />
        </Stack>
      </Panel>

      {/* ---------------- global AAA ---------------- */}
      <Panel title="Catalyst global AAA configuration" kicker="Verbatim" span={7}>
        <div className="grid grid-cols-2 gap-3">
          <Code
            title="Identity, the RADIUS server, and the attributes"
            code={`ip domain name securitydemo.net
!
interface Vlan10
 description **Switch management interface**
 ip address 10.80.60.151 255.255.255.0
!
username radius-test password 0 ISEisC00L
!
aaa new-model
aaa session-id common
!
radius server ISE01
 address ipv4 198.18.133.27 auth-port 1812 acct-port 1813
 automate-tester username radius-test ignore-acct-port probe-on
 key ISEisC00L
!
radius-server attribute 6 on-for-login-auth
radius-server attribute 8 include-in-access-req
radius-server attribute 25 access-request include
radius-server attribute 31 mac format ietf upper-case
radius-server attribute 31 send nas-port-detail mac-only
radius-server dead-criteria time 10 tries 3
radius-server deadtime 15
!`}
          />
          <Code
            title="The AAA group, the CoA listener, the global switches"
            code={`aaa group server radius AAA-GROUP-ISE
 server name ISE01
 ip radius source-interface Vlan10
!
aaa authentication dot1x default group AAA-GROUP-ISE
aaa authorization network default group AAA-GROUP-ISE
aaa accounting update newinfo periodic 2880
aaa accounting dot1x default start-stop group AAA-GROUP-ISE
!
aaa server radius dynamic-author
  client 198.18.133.27 server-key ISEisC00L
!
access-session acl default passthrough
!
authentication mac-move permit
!
device-tracking policy IPDT_POLICY
 no protocol udp
 tracking enable
!
dot1x system-auth-control
dot1x critical eapol`}
          />
        </div>
        <div className="mt-2">
          <Note label="The lines that are not optional">
            <M>ip radius source-interface</M> — without it ISE sees a source IP it
            has no Network Device for, and every request fails with 11007.{' '}
            <M>dynamic-author</M> — without it every CoA is silently dropped.{' '}
            <M>attribute 8 include-in-access-req</M> — without it ISE never learns
            the endpoint&rsquo;s IP address. The same global block also carries the{' '}
            <M>device-sensor</M> filter-lists that feed profiling.
          </Note>
        </div>
      </Panel>

      {/* ---------------- AAA dead ---------------- */}
      <Panel
        title="AAA server dead — critical auth, Critical ACL, Critical MAB"
        span={5}
        tone="signal"
      >
        <Stack gap={6}>
          <Table
            head={['Scenario in Low-Impact Mode', 'What the endpoint gets']}
            widths={['30%', '70%']}
            rows={[
              [
                'Before authentication',
                <>
                  <M>PRE-AUTH-ACL</M> — permit any DHCP, permit any DNS, deny any
                  any. Infra servers only
                </>,
              ],
              [
                'Authentication success',
                <>
                  The dACL <M>permit ip host 10.1.1.1 any</M> is prepended above the
                  PRE-AUTH-ACL. Full access
                </>,
              ],
              [
                'AAA server unreachable',
                <>
                  The port ACL is unchanged. The endpoint may be authorised into the{' '}
                  <strong>critical VLAN</strong>, but the static PRE-AUTH-ACL still
                  blocks it — the problem Critical ACL solves
                </>,
              ],
            ]}
          />
          <Code
            title="Critical MAB — local authentication during server failure, verbatim"
            code={`username 000c293c8dca password 0 000c293c8dca
username 000c293c8dca aaa attribute list mab-local
!
aaa local authentication default authorization mab-local
aaa authorization credential-download mab-local local
!
aaa attribute list mab-local
 attribute type tunnel-medium-type all-802
 attribute type tunnel-private-group-id "150"
 attribute type tunnel-type vlan
 attribute type inacl "CRITICAL-V4"
!
policy-map type control subscriber ACCESS-POL
...
event authentication-failure match-first
 10 class AAA_SVR_DOWN_UNAUTHD_HOST do-until-failure
  10 terminate mab
  20 terminate dot1x
  30 authenticate using mab aaa authc-list mab-local authz-list mab-local
...`}
          />
          <Bullets
            cols={2}
            items={[
              'An additional level of check to authorize hosts during a critical condition',
              'EEM scripts can be used to update the whitelist of MAC addresses dynamically',
              'Sessions re-initialise once server connectivity resumes',
              <>
                <M>dot1x critical eapol</M> sends EAP-Success so the supplicant stops
                retrying through the outage
              </>,
            ]}
          />
        </Stack>
      </Panel>
    </Sheet>
  )
}
