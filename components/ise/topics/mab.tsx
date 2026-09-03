'use client'

// ============================================================
// Topic — MAC Authentication Bypass
//
// The scenario explorer is the interactive core: standalone MAB,
// MAB reached by 802.1X timeout, Critical MAB during an AAA
// outage, and MAB made useful by profiling — each with its own
// configuration and its own behaviour.
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

type ScenarioId = 'standalone' | 'fallback' | 'critical' | 'profiled'

interface Scenario {
  id: ScenarioId
  label: string
  hint: string
  name: string
  pill: string
  tone: 'good' | 'warn' | 'bad' | 'neutral'
  gist: string
  behaviour: React.ReactNode[]
  facts: [React.ReactNode, React.ReactNode][]
  configs: { title: string; code: string }[]
  note: { label: string; tone?: 'signal' | 'warn' | 'good'; body: React.ReactNode }
}

const SCENARIOS: Scenario[] = [
  {
    id: 'standalone',
    label: 'Standalone MAB',
    hint: 'A port where no supplicant will ever exist.',
    name: 'Standalone MAB',
    pill: 'No 802.1X on the port',
    tone: 'neutral',
    gist:
      'The printer, the badge reader, the building-management controller. Nothing on this port will ever run a supplicant, so there is no point making it wait out an 802.1X timeout first. MAB runs on the first frame the switch sees.',
    behaviour: [
      'The switch learns the source MAC from the first frame and immediately builds an Access-Request',
      <>
        No <M>dot1x pae authenticator</M>, so no EAP-Request/Identity is ever sent
        and no timeout is served
      </>,
      <>
        <M>single-host</M> is the right host mode here — one device, one MAC, and a
        violation if anything else appears behind it
      </>,
      'Authorization still applies in full: dACL, VLAN and SGT all work exactly as they do for 802.1X',
    ],
    facts: [
      ['Speed', <>Immediate — nothing to wait for</>],
      ['Identity', <>The MAC, in both <M>User-Name</M> and <M>User-Password</M></>],
      ['Lookup', <>Internal Endpoints store, then any other store in the sequence</>],
      ['Risk', <>The credential is printed on the underside of the device</>],
    ],
    configs: [
      {
        title: 'IOS-XE — a MAB-only access port',
        code: `interface GigabitEthernet1/0/12
 description ** printer - no supplicant **
 switchport access vlan 100
 switchport mode access
 authentication host-mode single-host
 authentication port-control auto
 mab
 authentication violation restrict`,
      },
    ],
    note: {
      label: 'Do not leave the port open',
      body: (
        <>
          A MAB-only port with <M>authentication open</M> still on it from the
          Monitor Mode rollout authorises nothing and blocks nothing — it is an
          unprotected access port that happens to write log entries.
        </>
      ),
    },
  },

  {
    id: 'fallback',
    label: 'MAB after 802.1X',
    hint: 'The FlexAuth ladder: 802.1X, then MAB, then WebAuth.',
    name: 'MAB reached by 802.1X timeout',
    pill: 'FlexAuth fallback',
    tone: 'warn',
    gist:
      'The normal campus case. Every port runs 802.1X first, because a supplicant is always preferred; MAB catches whatever did not answer. The cost is the wait — the port is doing nothing useful while the switch retries EAP-Request/Identity into silence.',
    behaviour: [
      <>
        The switch sends <strong>EAP-Request/Identity</strong> and retries it every{' '}
        <M>tx-period</M>, up to <M>dot1x max reauth-request</M> times
      </>,
      <>
        On timeout it falls to MAB, learns the source MAC from any packet, and
        sends it as the identity
      </>,
      <>
        If MAB also fails, <M>authentication order</M> continues to local WebAuth
      </>,
      <>
        <M>authentication priority dot1x webauth</M> means a supplicant that wakes
        up later still wins — the MAB session is replaced by an 802.1X one
      </>,
    ],
    facts: [
      ['Trigger', <>802.1X timeout, then any packet from the endpoint</>],
      ['Order', <M>authentication order dot1x mab webauth</M>],
      ['Priority', <M>authentication priority dot1x webauth</M>],
      [
        'Tuning',
        <>
          <M>dot1x timeout tx-period 30</M> and <M>dot1x max reauth-request 2</M>{' '}
          are the defaults; Closed Mode cuts tx-period to 10
        </>,
      ],
    ],
    configs: [
      {
        title: 'FlexAuth — interface, verbatim from the workbook',
        code: `interface GigabitEthernet1/0/1
 switchport access vlan 100
 switchport voice vlan 10
 switchport mode access
 authentication host-mode multi-auth
 authentication order dot1x mab webauth
 authentication priority dot1x webauth
 mab
 authentication port-control auto
 dot1x pae authenticator
!`,
      },
    ],
    note: {
      label: 'The wait is only invisible in Monitor and Low-Impact mode',
      tone: 'warn',
      body: (
        <>
          With <M>authentication open</M> the endpoint has connectivity throughout
          the 802.1X timeout, so nobody notices. In Closed Mode the same timeout is
          a dead port — which is why the workbook lowers <M>tx-period</M> there and
          nowhere else.
        </>
      ),
    },
  },

  {
    id: 'critical',
    label: 'Critical MAB',
    hint: 'The AAA server is unreachable. Authenticate locally.',
    name: 'Critical MAB — local authentication during server failure',
    pill: 'IBNS 2.0 only',
    tone: 'bad',
    gist:
      'An IBNS 2.0 feature that lets the switch authenticate endpoints against a local list of MAC addresses when ISE cannot be reached. Unlike a blanket critical VLAN it is selective: this MAC is let on, that one is not.',
    behaviour: [
      <>
        The <M>AAA_SVR_DOWN_UNAUTHD_HOST</M> class fires on the{' '}
        <M>authentication-failure</M> event, terminates the in-flight MAB and
        802.1X attempts, and re-runs MAB against the local lists
      </>,
      <>
        The local <M>aaa attribute list</M> carries the same authorization the
        RADIUS server would have — VLAN 150 and the <M>CRITICAL-V4</M> ingress ACL
      </>,
      'An additional level of check to authorize hosts during a critical condition',
      'EEM scripts can be used to update the whitelist of MAC addresses dynamically',
      'Sessions re-initialise once server connectivity resumes',
    ],
    facts: [
      ['Dead criteria', <M>radius-server dead-criteria time 10 tries 3</M>],
      ['Deadtime', <M>radius-server deadtime 15</M>],
      [
        'Probe',
        <M>automate-tester username radius-test ignore-acct-port probe-on</M>,
      ],
      [
        'EAPoL signal',
        <>
          <M>dot1x critical eapol</M> — send EAP-Success to the supplicant so it
          stops retrying during the outage
        </>,
      ],
    ],
    configs: [
      {
        title: 'Critical MAB — verbatim from the workbook',
        code: `username 000c293c8dca password 0 000c293c8dca
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
...`,
      },
    ],
    note: {
      label: 'Two MAC formats in one configuration',
      tone: 'warn',
      body: (
        <>
          The local <M>username</M> lines are written unseparated and lower-case —{' '}
          <M>000c293c8dca</M> — while the wire format for Calling-Station-ID is set
          globally by <M>radius-server attribute 31 mac format ietf upper-case</M>.
          ISE normalises what arrives over RADIUS. The switch&rsquo;s own local
          database does not: it is matched literally.
        </>
      ),
    },
  },

  {
    id: 'profiled',
    label: 'MAB + profiling',
    hint: 'MAB says the MAC exists. Profiling says what it is.',
    name: 'MAB with profiling',
    pill: 'The only version worth deploying',
    tone: 'good',
    gist:
      'On its own MAB proves only that a MAC address is in a list. Profiling is what turns it into a decision: the endpoint arrives as Unknown, gets limited access, is classified from CDP, LLDP and DHCP data, and is then re-authorized by CoA into the profile it deserves.',
    behaviour: [
      <>
        First authorization matches <M>Wired_MAB</M> and returns{' '}
        <strong>Limited_Access</strong> — the endpoint is still Unknown
      </>,
      <>
        Device Sensor ships CDP, LLDP and DHCP TLVs to ISE inside RADIUS
        Accounting; the profiler classifies the endpoint
      </>,
      <>
        The endpoint lands in{' '}
        <M>Endpoint Identity Groups:Profiled:Cisco-IP-Phone</M>, a profiler CoA
        fires, and the second authorization matches the phone rule
      </>,
      <>
        The <strong>Cisco_IP_Phones</strong> profile returns the voice AV-pair, so
        the switch permits the phone into the voice domain
      </>,
    ],
    facts: [
      [
        'AuthZ profile',
        <M>Policy &gt; Policy Elements &gt; Results &gt; Authorization &gt; Authorization Profiles</M>,
      ],
      ['Name', <>Cisco_IP_Phones — Access Type <M>ACCESS_ACCEPT</M>, device profile Cisco</>],
      [
        'Common task',
        <>
          <strong>Voice Domain Permission</strong> — the checkbox that emits the
          AV-pair below
        </>,
      ],
      ['AV-pair', <M>cisco-av-pair = device-traffic-class=voice</M>],
    ],
    configs: [
      {
        title: 'Switch — what has to be on for the profiler to see anything',
        code: `device-sensor filter-spec dhcp include list DHCP-LIST
device-sensor filter-spec lldp include list LLDP-LIST
device-sensor filter-spec cdp include list CDP-LIST
device-sensor accounting
device-sensor notify all-changes
!
aaa accounting update newinfo periodic 2880
aaa accounting dot1x default start-stop group AAA-GROUP-ISE`,
      },
    ],
    note: {
      label: 'The two rules that make the flow visible',
      tone: 'good',
      body: (
        <>
          <M>DEMO-LIMITED-ACCESS</M> matches <M>Wired_MAB</M> and returns{' '}
          <M>Limited_Access</M> — that is the policy before the device is profiled.{' '}
          <M>DEMO-PHONES-ACCESS</M> matches{' '}
          <M>IdentityGroup·Name EQUALS Endpoint Identity Groups:Profiled:Cisco-IP-Phone</M>{' '}
          and returns <M>Cisco_IP_Phones</M> — the policy once it is. Watch the hit
          counters move between them.
        </>
      ),
    },
  },
]

export default function MabSheet() {
  const [scenarioId, setScenarioId] = useState<ScenarioId>('standalone')
  const s = SCENARIOS.find(x => x.id === scenarioId) ?? SCENARIOS[0]

  return (
    <Sheet>
      {/* ---------------- what MAB is ---------------- */}
      <Panel title="What MAB actually is" kicker="An identity with no secret" span={3}>
        <Stack gap={6}>
          <Prose>
            MAC Authentication Bypass authenticates a device by its MAC address
            alone. The switch learns the source MAC from any frame the endpoint
            sends and presents it to ISE as the identity. There is no supplicant,
            no credential and no proof of anything.
          </Prose>
          <KV
            items={[
              [
                'Identity',
                <>
                  The endpoint MAC, sent as <M>User-Name</M> — and as{' '}
                  <M>User-Password</M>
                </>,
              ],
              ['Trigger', <>802.1X timeout, or the first frame on a MAB-only port</>],
              [
                'Store',
                <>
                  The internal <strong>Endpoints</strong> database, or any identity
                  store in the sequence configured to process host lookups
                </>,
              ],
              [
                'Right answer for',
                <>
                  Printers, badge and door controllers, cameras, building
                  management, OT and medical gear, phones without certificates —
                  anything that will never run a supplicant
                </>,
              ],
              [
                'Wrong answer for',
                <>Anything that could run a supplicant. MAB is the exception list</>,
              ],
            ]}
            labelWidth={66}
          />
        </Stack>
      </Panel>

      {/* ---------------- the ladder ---------------- */}
      <Panel title="Bypassing a known MAC address" kicker="802.1X timeout → MAB" span={3} tone="signal">
        <Ladder
          actors={['Endpoint', 'Switch', 'Cisco ISE']}
          steps={[
            {
              from: 1,
              to: 0,
              label: <>EAP: What&rsquo;s your Id?</>,
              sub: 'EAPoL — retried every tx-period',
              tone: 'muted',
            },
            {
              from: 1,
              to: 1,
              label: '802.1X timeout — no response',
              sub: 'the endpoint has no supplicant',
              tone: 'muted',
              dashed: true,
            },
            {
              from: 0,
              to: 1,
              label: 'Any Packet',
              sub: 'the switch learns the source MAC',
            },
            {
              from: 1,
              to: 2,
              label: <>RADIUS Access-Request &mdash; User: 00-10-23-AA-1F-38</>,
              sub: 'Service-Type 10 (Call-Check), NAS-Port-Type 15',
              tone: 'signal',
            },
            {
              from: 2,
              to: 1,
              label: 'ACCESS-ACCEPT',
              sub: 'dACL, VLAN, SGT — authorization is unchanged by MAB',
              tone: 'signal',
            },
          ]}
        />
        <div className="mt-1.5">
          <Note label="No packet, no MAB">
            MAB cannot start until the endpoint transmits something. A device that
            boots silently and waits to be spoken to sits unauthenticated on a
            closed port indefinitely.
          </Note>
        </div>
      </Panel>

      {/* ---------------- how ISE recognises it ---------------- */}
      <Panel title="How ISE recognises a MAB request" kicker="Two attributes" span={3}>
        <Stack gap={6}>
          <Table
            head={['Scenario', 'Service-Type', 'NAS-Port-Type']}
            widths={['44%', '30%', '26%']}
            rows={[
              ['Wired MAB', '10 (Call-Check)', '15 (Ethernet)'],
              ['Wired 802.1X', '2 (Framed)', '15 (Ethernet)'],
              ['Wireless 802.1X', '2 (Framed)', '19 (IEEE 802.11)'],
            ]}
          />
          <Prose>
            That pair is the whole of it. The built-in <M>Wired_MAB</M> condition is
            exactly Service-Type Call-Check plus NAS-Port-Type Ethernet, and it is
            what every MAB authorization rule keys off.
          </Prose>
          <KV
            items={[
              [
                'Calling-Station-ID',
                'The MAC of the device initiating the request — the laptop, phone or IoT endpoint',
              ],
              [
                'Called-Station-ID',
                'The MAC of the network device the calling station is connected to — the switchport, or the AP and SSID',
              ],
            ]}
            labelWidth={80}
          />
        </Stack>
      </Panel>

      {/* ---------------- MAC formats ---------------- */}
      <Panel title="The MAC address format problem" span={3} tone="quiet">
        <Stack gap={6}>
          <Table
            head={['Format', 'Looks like', 'Where you meet it']}
            widths={['26%', '38%', '36%']}
            rows={[
              ['IETF, upper', '00-0C-29-3C-8D-CA', 'Calling-Station-ID, when attribute 31 is set as below'],
              ['Cisco dotted', '000c.293c.8dca', 'IOS show output, MAC address tables'],
              ['Colon', '00:0C:29:3C:8D:CA', 'Most non-Cisco NADs and WLCs'],
              ['Unformatted', '000c293c8dca', 'Local switch usernames in Critical MAB'],
            ]}
          />
          <Code
            title="Pin the format the switch sends"
            code={`radius-server attribute 31 mac format ietf upper-case
radius-server attribute 31 send nas-port-detail mac-only`}
          />
          <Note label="Where the normalisation stops">
            ISE normalises Calling-Station-ID into one internal MAC representation,
            so a mixed estate of switches, WLCs and third-party NADs still produces
            one endpoint object. Nothing normalises the strings you type by hand —
            local <M>username</M> lines, static endpoint imports and CSV uploads are
            matched as written.
          </Note>
        </Stack>
      </Panel>

      {/* ---------------- THE SCENARIO EXPLORER ---------------- */}
      <Panel
        title="MAB scenario explorer"
        span={12}
        tone="ink"
        right={
          <span className="normal-case tracking-normal">
            Four ways a MAB session gets built
          </span>
        }
      >
        <Stack gap={8}>
          <div className="flex items-center justify-between gap-4">
            <Selector
              options={SCENARIOS.map(x => ({ id: x.id, label: x.label, hint: x.hint }))}
              value={scenarioId}
              onChange={setScenarioId}
            />
            <Pill tone={s.tone}>{s.pill}</Pill>
          </div>

          <div className="border-t border-ink-200 pt-2">
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-4">
                <h4
                  className="text-[12px] font-bold tracking-tight text-ink-950"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  {s.name}
                </h4>
                <div className="mt-1">
                  <Prose>{s.gist}</Prose>
                </div>
                <div className="mt-2">
                  <div
                    className="mb-1 border-b border-ink-300 pb-[2px] text-[9px] font-bold uppercase tracking-[0.11em] text-ink-950"
                    style={{ fontFamily: 'var(--font-heading)' }}
                  >
                    What happens
                  </div>
                  <Bullets items={s.behaviour} />
                </div>
              </div>

              <div className="col-span-3">
                <div
                  className="mb-1 border-b border-ink-300 pb-[2px] text-[9px] font-bold uppercase tracking-[0.11em] text-ink-950"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  The specifics
                </div>
                <KV items={s.facts} labelWidth={74} />
                <div className="mt-2">
                  <Note label={s.note.label} tone={s.note.tone}>
                    {s.note.body}
                  </Note>
                </div>
              </div>

              <div className="col-span-5">
                <Stack gap={6}>
                  {s.configs.map(c => (
                    <Code key={c.title} title={c.title} code={c.code} />
                  ))}
                </Stack>
              </div>
            </div>
          </div>
        </Stack>
      </Panel>

      {/* ---------------- endpoints and profiling ---------------- */}
      <Panel title="Endpoints, identity groups and what profiling adds" span={5}>
        <Stack gap={6}>
          <Prose>
            A MAB request is a lookup, so the endpoint database is the identity
            store. Groups are how you turn a pile of MAC addresses into something an
            authorization rule can reason about — and profiling is what fills the
            groups without anyone typing a MAC.
          </Prose>
          <KV
            items={[
              [
                'Internal store',
                <>
                  Every endpoint ISE has ever seen, keyed on MAC, with every
                  attribute any probe has collected for it
                </>,
              ],
              [
                'Identity groups',
                <>
                  Static groups you populate yourself, plus the{' '}
                  <M>Profiled</M> subtree that the profiler maintains — for example{' '}
                  <M>Endpoint Identity Groups:Profiled:Cisco-IP-Phone</M>
                </>,
              ],
              [
                'Matched by',
                <>
                  <M>IdentityGroup·Name</M> for the group, or{' '}
                  <M>EndPoints:EndPointPolicy</M> for the profile itself
                </>,
              ],
            ]}
            labelWidth={78}
          />
          <Table
            head={['Rule', 'Condition', 'Result']}
            widths={['24%', '46%', '30%']}
            rows={[
              [
                'DEMO-LIMITED-ACCESS',
                <M>Wired_MAB</M>,
                <>
                  <M>Limited_Access</M>
                  <div className="text-ink-400">
                    the original policy, before the device is profiled
                  </div>
                </>,
              ],
              [
                'DEMO-PHONES-ACCESS',
                <M>
                  IdentityGroup·Name EQUALS Endpoint Identity
                  Groups:Profiled:Cisco-IP-Phone
                </M>,
                <>
                  <M>Cisco_IP_Phones</M>
                  <div className="text-ink-400">
                    the final policy, once the device is profiled and placed in the
                    group
                  </div>
                </>,
              ],
            ]}
          />
          <Note label="Order matters more than usual here">
            The phone rule has to sit <em>above</em> the generic{' '}
            <M>Wired_MAB</M> rule. Every profiled endpoint still matches{' '}
            <M>Wired_MAB</M> — it never stops being a MAB session — so a broad MAB
            rule placed first swallows every specific rule beneath it.
          </Note>
        </Stack>
      </Panel>

      {/* ---------------- the security reality ---------------- */}
      <Panel title="MAB is spoofable — what actually mitigates it" span={4} tone="signal">
        <Stack gap={6}>
          <Prose>
            The credential is a MAC address, and a MAC address is printed on the
            device, broadcast in every frame, and settable in one command on any
            operating system. MAB is an <em>allow-list</em>, not an authentication.
            Treat everything it admits as untrusted.
          </Prose>
          <Table
            head={['Control', 'What it buys you', 'What it does not']}
            widths={['24%', '42%', '34%']}
            rows={[
              [
                'Profiling',
                'The endpoint must also look like the device it claims to be — CDP, LLDP and DHCP fingerprints, at a minimum certainty factor you set',
                'A determined attacker can replay a fingerprint. Never set a minimum CF so low that one weak condition promotes an endpoint',
              ],
              [
                'dACL',
                'Least privilege for whatever the MAC does get — a printer reaches the print server and nothing else',
                'Nothing about who is behind the MAC',
              ],
              [
                'TrustSec SGT',
                'Segmentation that survives the VLAN and IP design, enforced away from the access port',
                'Requires the enforcement points to be built out first',
              ],
              [
                'Anomalous behaviour detection',
                <>
                  Flags a MAC whose <M>NAS-Port-Type</M>, DHCP Class ID or endpoint
                  policy changes — wired to wireless, printer to workstation — sets{' '}
                  <M>AnomalousBehaviour</M> true, and can CoA it into quarantine
                </>,
                <>
                  Cisco is explicit: it &ldquo;does not address all potential
                  scenarios for MAC address spoofing&rdquo;
                </>,
              ],
              [
                'Host mode',
                <>
                  <M>single-host</M> or <M>multi-auth</M> with{' '}
                  <M>authentication violation restrict</M> stops a hub full of
                  devices riding one authorised MAC
                </>,
                <>
                  <M>multi-host</M> does the opposite — the second device
                  piggybacks and is never authenticated
                </>,
              ],
            ]}
          />
        </Stack>
      </Panel>

      {/* ---------------- verify ---------------- */}
      <Panel title="Verify, and the failure you will actually see" span={3} tone="quiet">
        <Stack gap={6}>
          <Split
            cols={1}
            parts={[
              {
                title: 'On the switch',
                children: (
                  <Bullets
                    items={[
                      <M>
                        show authentication sessions interface gigabitEthernet
                        0/1/0 details
                      </M>,
                      <M>show aaa servers</M>,
                      <M>debug radius</M>,
                      <M>debug dot1x all</M>,
                      <M>debug epm all</M>,
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
                title: 'In ISE',
                children: (
                  <Bullets
                    items={[
                      <M>Operations &gt; RADIUS &gt; Live Logs</M>,
                      <>
                        The <strong>Steps</strong> trace in the detailed report —{' '}
                        <M>11001</M> Received RADIUS Access-Request →{' '}
                        <M>11002</M> Access-Accept or <M>11003</M> Access-Reject
                      </>,
                      <>
                        <M>Context Visibility &gt; Endpoints</M> for the attribute
                        list ISE holds on that MAC
                      </>,
                    ]}
                  />
                ),
              },
            ]}
          />
          <Note label="22056 — Subject not found in the applicable identity store(s)">
            The single most common MAB failure. The MAC is not in the endpoint
            database, or the identity source sequence does not include a store that
            processes host lookups. Add the endpoint, fix the sequence, or set{' '}
            <em>If User not found = CONTINUE</em> and add a CWA or guest
            authorization rule to catch it.
          </Note>
        </Stack>
      </Panel>
    </Sheet>
  )
}
