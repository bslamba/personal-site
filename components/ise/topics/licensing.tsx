'use client'

// ============================================================
// Topic — Licensing & Smart Licensing
//
// The tier explorer is the interactive core: pick a licence and
// you get what it unlocks, how it is consumed, and — the part
// people actually need — what stops working if you do not have
// it.
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

interface Licence {
  id: string
  label: string
  title: string
  pill: React.ReactNode
  gist: string
  unlocks: React.ReactNode[]
  facts: [React.ReactNode, React.ReactNode][]
  without: React.ReactNode[]
  note: { label: string; tone?: 'signal' | 'warn' | 'good'; body: React.ReactNode }
}

const LICENCES: Licence[] = [
  {
    id: 'essentials',
    label: 'Essentials',
    title: 'Essentials — user visibility and enforcement',
    pill: <Pill tone="neutral">Subscription · per endpoint</Pill>,
    gist:
      'The floor. Every session that authenticates consumes one, and every higher tier contains it. If you are doing nothing but 802.1X and guest, this is the whole licence estate.',
    unlocks: [
      <>AAA and <strong>802.1X</strong> — RADIUS authentication and authorization</>,
      <>Guest access — <strong>Hotspot</strong>, <strong>Self-Registration</strong> and <strong>Sponsored</strong> portals</>,
      <>Easy Connect / <strong>PassiveID</strong></>,
      <>MAB, certificate-based EAP methods, policy sets, network device groups</>,
      <>Data Connect requires <em>at least</em> Essentials and is disabled if the licence lapses</>,
    ],
    facts: [
      ['Model', 'Subscription — 1, 3 or 5 year terms'],
      ['Counted on', 'Concurrent active sessions, not owned endpoints'],
      ['Consumed at', <>RADIUS <strong>Accounting Start</strong></>],
      ['Released at', <>RADIUS <strong>Accounting Stop</strong></>],
      ['Start date', 'Default 3 days post-purchase; up to 90 days forward. Co-termination supported'],
    ],
    without: [
      'Nothing authenticates. This is not a feature licence, it is the right to run a session.',
      'A deployment out of compliance on Essentials is out of compliance full stop.',
    ],
    note: {
      label: 'What "concurrent" means',
      body: (
        <>
          Monitor <strong>peak active endpoints</strong>, not the endpoint
          database. A laptop docked and on Wi-Fi at the same time is two
          sessions and two Essentials licences.
        </>
      ),
    },
  },

  {
    id: 'advantage',
    label: 'Advantage',
    title: 'Advantage — context, with Essentials inside it',
    pill: <Pill tone="neutral">Subscription · includes Essentials</Pill>,
    gist:
      'Everything that gives ISE context about an endpoint beyond its credentials: what it is, who owns it, what tag it carries, and who else gets told. In 3.x it contains Essentials rather than sitting beside it.',
    unlocks: [
      <>Device <strong>profiling</strong> and classification</>,
      <><strong>BYOD</strong> registration and provisioning, with the built-in CA</>,
      <><strong>pxGrid</strong> — standard, pxGrid Cloud and pxGrid Direct, context in or out</>,
      <><strong>TrustSec</strong> / Group-Based Policy (SGTs)</>,
      <><strong>User Defined Networks</strong> (UDN)</>,
      <>Endpoint Analytics visibility and enforcement</>,
      <><strong>Rapid Threat Containment</strong> via Adaptive Network Control (ANC)</>,
      <>Workload Connector support</>,
    ],
    facts: [
      ['Model', 'Subscription'],
      ['Contains', 'Essentials'],
      [
        'Consumed at',
        <>Accounting Start, <em>when an Advantage feature is referenced in the matched authorization rule</em></>,
      ],
      [
        'Profiling nuance',
        <>Profiling consumes Advantage <strong>only when a dynamic profiling attribute appears in a matched authorization rule</strong> — visibility alone does not</>,
      ],
      ['Released at', 'RADIUS session end'],
    ],
    without: [
      'No profiling-driven authorization — every unknown endpoint stays unknown to policy.',
      'No BYOD onboarding and no internal CA issuance for user devices.',
      'No SGT assignment, so TrustSec segmentation cannot be driven from ISE.',
      'No pxGrid, so Secure Firewall, Catalyst Center and SNA get no session context.',
      'No ANC, so no quarantine or shut action from an integrated threat product.',
    ],
    note: {
      label: 'The tier you accidentally consume',
      tone: 'warn',
      body: (
        <>
          Referencing <M>EndPoints:EndPointPolicy</M> in one authorization rule
          pulls every endpoint that matches it onto an Advantage licence.
          Consumption follows the <em>matched rule</em>, not your intent — audit
          the policy set before buying to the count you assumed.
        </>
      ),
    },
  },

  {
    id: 'premier',
    label: 'Premier',
    title: 'Premier — compliance, with Advantage inside it',
    pill: <Pill tone="signal">Subscription · the full stack</Pill>,
    gist:
      'The compliance tier: posture, MDM and threat. Anything that asks "is this endpoint healthy?" rather than "what is this endpoint?" lives here.',
    unlocks: [
      <>Device <strong>posture</strong> assessment and remediation</>,
      <><strong>MDM compliance</strong> integration</>,
      <><strong>Threat-Centric NAC</strong> (TC-NAC)</>,
      <>Everything in Advantage and Essentials</>,
    ],
    facts: [
      ['Model', 'Subscription'],
      ['Contains', 'Advantage, and therefore Essentials'],
      ['Consumed at', <>When the endpoint uses posture, MDM or threat-based features in policy</>],
      ['Released at', 'RADIUS session end'],
      ['Ports it implies', <>Posture on <M>8905</M> and <M>8443</M>; TC-NAC over <M>443</M></>],
    ],
    without: [
      'No posture assessment — no compliance check, no remediation, no quarantine on non-compliance.',
      'No MDM compliance conditions in authorization policy.',
      'No Threat-Centric NAC, so vulnerability and threat scores cannot drive access.',
    ],
    note: {
      label: 'Buy it for the endpoints that need it',
      body: (
        <>
          Premier is consumed per session that actually uses a Premier feature.
          Posture the corporate estate and leave guests and IoT on the tiers
          they need — the licence follows the matched policy, so the policy is
          where you control the bill.
        </>
      ),
    },
  },

  {
    id: 'deviceadmin',
    label: 'Device Admin',
    title: 'Device Admin — TACACS+ on a Policy Service Node',
    pill: <Pill tone="good">Perpetual · per PSN</Pill>,
    gist:
      'A separate, perpetual licence that switches TACACS+ services on for one PSN. It sits entirely outside the endpoint tiers and does not interact with them.',
    unlocks: [
      <>TACACS+ device administration services on a PSN — <M>TCP 49</M></>,
      <>Authentication, authorization and command accounting for network devices</>,
      <>TACACS+ over TLS 1.3 on ISE 3.4 and 3.5</>,
    ],
    facts: [
      ['PID', <M>L-ISE-TACACS-ND=</M>],
      ['Model', 'Perpetual, not subscription'],
      ['Scope', <><strong>Each PSN that uses TACACS+ requires its own licence</strong> (releases 2.4+). Legacy classic Device Admin licences were cluster-wide</>],
      ['Endpoint impact', <><strong>None.</strong> TACACS+ device administration does not count toward endpoint usage</>],
      ['NAD limit', 'No limit is imposed on the number of network devices you can manage'],
      ['Essentials?', 'Not needed to manage NADs such as routers and switches'],
    ],
    without: [
      'The Device Administration service will not enable on the node.',
      'No TACACS+ — network device logins fall back to local accounts or an old ACS.',
    ],
    note: {
      label: 'The per-node trap',
      tone: 'warn',
      body: (
        <>
          People buy one Device Admin licence and enable TACACS+ on four PSNs.
          Since 2.4 that is four licences. Count the PSNs that will actually
          terminate <M>TCP 49</M>, and remember that device-admin scale is
          measured in <strong>network devices</strong>, not endpoints.
        </>
      ),
    },
  },

  {
    id: 'vm',
    label: 'VM / Platform',
    title: 'Virtual machine licences — the platform right',
    pill: <Pill tone="good">Perpetual · per VM</Pill>,
    gist:
      'The right to run the ISE image on a virtual or cloud instance at all. It is orthogonal to the endpoint tiers: a VM still needs Essentials for its sessions.',
    unlocks: [
      <>Running an ISE node as a VM or on IaaS — the licensing page calls it the <strong>Platform License</strong></>,
      <>One <strong>VM Common</strong> licence covers a Large, Medium or Small VM deployment</>,
    ],
    facts: [
      ['VM Common', <><M>R-ISE-VMC-K9=</M> — perpetual, the current SKU</>],
      ['Legacy SKUs', <><M>R-ISE-VMS-K9=</M> Small · <M>R-ISE-VMM-K9=</M> Medium · <M>R-ISE-VML-K9=</M> Large — perpetual</>],
      ['Conversion', <>Classic Small/Medium/Large convert to VM Common at <strong>1:1</strong></>],
      ['VM Free', <><M>R-ISE-VMF-K9=</M> for eligible first-time customers with a Catalyst Advantage Subscription for Switching</>],
      ['Evaluation', <><strong>90 days</strong>, <strong>100 endpoints</strong>, all features. Extendable a further 90 days via SCM using the UDI</>],
      ['Support SKUs', <><M>SVS-ISE-SUP-B</M> Basic (included) · <M>-S</M> Solution · <M>-E</M> Enhanced · <M>-P</M> Premium</>],
    ],
    without: [
      'A virtual or cloud node is not entitled, regardless of how many endpoint licences you hold.',
      'Physical SNS appliances need no platform licence — this applies to VMs and IaaS only.',
    ],
    note: {
      label: 'Consolidate on upgrade',
      tone: 'good',
      body: (
        <>
          &ldquo;Convert to new licence types&rdquo; is a post-upgrade task for a
          reason. ISE 3.1 consolidated the virtual appliance licences into VM
          Common; leaving legacy Small/Medium/Large SKUs in place is a
          reconciliation problem you will meet at renewal.
        </>
      ),
    },
  },
]

export default function LicensingSheet() {
  const [licId, setLicId] = useState(LICENCES[0].id)
  const lic = LICENCES.find(l => l.id === licId) ?? LICENCES[0]

  return (
    <Sheet>
      {/* ---------------- THE TIER EXPLORER ---------------- */}
      <Panel
        title="Licence explorer"
        span={12}
        tone="ink"
        right={
          <span className="normal-case tracking-normal">
            What it unlocks, when it is consumed, what breaks without it
          </span>
        }
      >
        <Stack gap={8}>
          <div className="flex items-center justify-between gap-4">
            <Selector
              options={LICENCES.map(l => ({ id: l.id, label: l.label, hint: l.gist }))}
              value={licId}
              onChange={setLicId}
              label="Licence"
            />
            {lic.pill}
          </div>

          <div className="border-t border-ink-200 pt-2">
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-3">
                <h4
                  className="text-[12px] font-bold tracking-tight text-ink-950"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  {lic.title}
                </h4>
                <div className="mt-1">
                  <Prose>{lic.gist}</Prose>
                </div>
                <div className="mt-2">
                  <Note label={lic.note.label} tone={lic.note.tone}>
                    {lic.note.body}
                  </Note>
                </div>
              </div>

              <div className="col-span-3">
                <div
                  className="mb-1 border-b border-ink-300 pb-[2px] text-[9px] font-bold uppercase tracking-[0.11em] text-ink-950"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  What it unlocks
                </div>
                <Bullets items={lic.unlocks} />
              </div>

              <div className="col-span-3">
                <div
                  className="mb-1 border-b border-ink-300 pb-[2px] text-[9px] font-bold uppercase tracking-[0.11em] text-ink-950"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  How it is counted
                </div>
                <KV items={lic.facts} labelWidth={78} />
              </div>

              <div className="col-span-3">
                <div
                  className="mb-1 border-b border-ink-300 pb-[2px] text-[9px] font-bold uppercase tracking-[0.11em] text-ink-950"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  What it costs you to go without
                </div>
                <Bullets items={lic.without} />
                <div className="mt-2">
                  <Prose>
                    ISE 3.5 adds enhanced per-endpoint consumption{' '}
                    <em>tracking</em> for profiling, TrustSec, pxGrid and pxGrid
                    Direct. It changes visibility, not enforcement.
                  </Prose>
                </div>
              </div>
            </div>
          </div>
        </Stack>
      </Panel>

      {/* ---------------- 2.x vs 3.x ---------------- */}
      <Panel
        title="2.x additive, 3.x nested"
        kicker="The structural change"
        span={5}
        tone="signal"
      >
        <Stack gap={6}>
          <Prose>
            In 2.x, Plus and Apex were <strong>add-ons stacked on top of
            Base</strong> — you bought Base for everyone and Plus or Apex for
            the subset that needed them. In 3.x the tiers are{' '}
            <strong>strictly nested</strong>: Premier contains Advantage, which
            contains Essentials. You buy one tier per endpoint, not a stack.
          </Prose>
          <Table
            head={['2.x', '3.x', 'Features carried across']}
            widths={['14%', '17%', '69%']}
            rows={[
              [
                <>Base<div className="font-normal text-ink-400">Network Onboarding</div></>,
                'Essentials',
                'AAA and 802.1X · Guest (Hotspot, Self-Reg, Sponsored) · Easy Connect (PassiveID). TrustSec moved up to Advantage in the 3.x model.',
              ],
              [
                <>Plus<div className="font-normal text-ink-400">Context</div></>,
                'Advantage',
                'Profiling · BYOD (+CA, +MDP) · Context sharing via pxGrid, pxGrid Cloud and pxGrid Direct · Rapid Threat Containment (ANC). 3.x adds TrustSec, Endpoint Analytics and User Defined Networks.',
              ],
              [
                <>Apex<div className="font-normal text-ink-400">Compliance</div></>,
                'Premier',
                'Posture · Mobile Device Management compliance · Threat-Centric NAC (TC-NAC).',
              ],
            ]}
          />
          <Note label="Where SLR breaks the nesting" tone="warn">
            Under <strong>Specific Licence Reservation</strong>, higher tiers do{' '}
            <strong>not</strong> automatically cover the lower ones — each tier
            has to be reserved separately. This is the one place the 3.x
            inclusion rule does not hold, and it catches air-gapped deployments
            out.
          </Note>
        </Stack>
      </Panel>

      {/* ---------------- LADDER ---------------- */}
      <Panel
        title="Licence allocation — when a licence is actually consumed"
        kicker="Accounting, not authentication"
        span={7}
      >
        <Ladder
          actors={['Endpoint', 'Network Access Device', 'Identity Services Engine']}
          steps={[
            { from: 0, to: 1, label: 'EAP / MAB authentication' },
            { from: 1, to: 2, label: 'RADIUS Access-Request', tone: 'muted' },
            { from: 2, to: 1, label: 'RADIUS Access-Accept', sub: 'no licence is allocated during authentication', tone: 'muted' },
            { from: 1, to: 0, label: 'EAP / MAB Success' },
            { from: 1, to: 2, label: 'RADIUS Accounting Start', sub: 'LICENCE ALLOCATED — Essentials, plus Advantage or Premier if the matched authorization rule used those features', tone: 'signal' },
            { from: 0, to: 1, label: 'Network session', dashed: true, tone: 'muted' },
            { from: 0, to: 1, label: 'Endpoint disconnects' },
            { from: 1, to: 2, label: 'RADIUS Accounting Stop', sub: 'LICENCE RELEASED — every licence held by the session returns to the pool', tone: 'signal' },
          ]}
        />
        <div className="mt-1.5">
          <Note label="The consequence">
            <strong>No licence is consumed during authentication.</strong> If
            accounting is not configured on the NAD, ISE never sees a Start and
            the session is never counted — and never released either, because
            there is no Stop. Broken accounting shows up as a licence count that
            does not match reality long before it shows up anywhere else.
          </Note>
        </div>
      </Panel>

      {/* ---------------- SMART LICENSING ---------------- */}
      <Panel title="Smart Licensing, CSSM and air-gapped networks" span={5}>
        <Stack gap={6}>
          <KV
            items={[
              [
                'The model',
                <>ISE reports usage over <strong>HTTPS</strong> to the Cisco Smart Software Manager (CSSM) portal. There is no per-node PAK</>,
              ],
              [
                'Mandatory from',
                <><strong>ISE 3.0 and later supports only Smart Licensing.</strong> Traditional licence files are gone</>,
              ],
              ['Requires', 'ISE to be able to reach Cisco SSM, directly or through a proxy'],
            ]}
            labelWidth={82}
          />
          <Split
            parts={[
              {
                title: 'SSM on-prem',
                children: (
                  <Bullets
                    items={[
                      <><strong>ISE 2.6 and later</strong> support SSM on-premises servers for Smart Licensing.</>,
                      <>The on-prem server talks to Cisco; ISE only ever talks to the on-prem server.</>,
                      <>The usual answer for a network that has no direct internet egress but is not truly air-gapped.</>,
                    ]}
                  />
                ),
              },
              {
                title: 'Specific Licence Reservation',
                children: (
                  <Bullets
                    items={[
                      <>SLR deploys a licence on a device <strong>without communicating usage information to Cisco SSM</strong> at all.</>,
                      <>Intended for highly secure networks; supported on platforms with Smart Licensing enabled.</>,
                      <>Remember the tier exception — reserve Essentials, Advantage and Premier separately.</>,
                    ]}
                  />
                ),
              },
            ]}
          />
        </Stack>
      </Panel>

      {/* ---------------- TROUBLESHOOTING ---------------- */}
      <Panel title="Troubleshooting licensing" kicker="Reachability, logs, APIs" span={7} tone="quiet">
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-6">
            <div
              className="mb-1 border-b border-ink-300 pb-[2px] text-[9px] font-bold uppercase tracking-[0.11em] text-ink-950"
              style={{ fontFamily: 'var(--font-heading)' }}
            >
              What ISE contacts, by version
            </div>
            <Table
              head={['ISE version', 'Destination', 'Port']}
              widths={['38%', '42%', '20%']}
              rows={[
                [
                  <>3.0 p7, 3.1 p5,<br />3.2 or higher</>,
                  <M>smartreceiver.cisco.com</M>,
                  <M>443</M>,
                ],
                [
                  'Lower versions',
                  <>
                    <M>tools.cisco.com</M>
                    <br />
                    <M>tools1.cisco.com</M>
                    <br />
                    <M>tools2.cisco.com</M>
                  </>,
                  <M>443</M>,
                ],
              ]}
            />
            <div className="mt-2">
              <div
                className="mb-1 border-b border-ink-300 pb-[2px] text-[9px] font-bold uppercase tracking-[0.11em] text-ink-950"
                style={{ fontFamily: 'var(--font-heading)' }}
              >
                Registration and renewal errors
              </div>
              <Bullets
                items={[
                  <><strong>Firewalls</strong> or other devices blocking the traffic.</>,
                  <><strong>DNS problems</strong> — if ISE cannot resolve the FQDN for <M>tools.cisco.com</M> or <M>smartreceiver.cisco.com</M>, the registration API call never leaves.</>,
                  <>Issues with the <strong>Smart Licensing Portal</strong> itself.</>,
                ]}
              />
            </div>
          </div>

          <div className="col-span-6">
            <div
              className="mb-1 border-b border-ink-300 pb-[2px] text-[9px] font-bold uppercase tracking-[0.11em] text-ink-950"
              style={{ fontFamily: 'var(--font-heading)' }}
            >
              Set these to DEBUG, then read ise-psc.log
            </div>
            <KV
              items={[
                [<M>License</M>, <>logs to <M>ise-psc.log</M></>],
                [<M>admin-license</M>, <>logs to <M>ise-psc.log</M></>],
              ]}
              labelWidth={92}
            />
            <div className="mt-2">
              <Code
                title="MnT API calls — how many licences are actually in use"
                code={`https://<MnTNodeIP>/admin/API/mnt/Session/ActiveCount
https://<MnTNodeIP>/admin/API/mnt/Session/License/LicenseCountsFromSessionDB
https://<MnTNodeIP>/admin/API/mnt/License/Base
https://<MnTNodeIP>/admin/API/mnt/License/Intermediate
https://<MnTNodeIP>/admin/API/mnt/License/Premium
https://<MnTNodeIP>/admin/API/mnt/Session/ActiveList`}
              />
              <div className="mt-1.5">
                <Prose>
                  Call them straight from the browser against the MnT node. Note
                  the legacy tier names still baked into the paths —{' '}
                  <M>Base</M>, <M>Intermediate</M>, <M>Premium</M> — which map
                  onto Essentials, Advantage and Premier.
                </Prose>
              </div>
            </div>
          </div>
        </div>
      </Panel>
    </Sheet>
  )
}
