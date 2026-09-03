'use client'

// ============================================================
// Topic — Deployment Models, Sizing & Appliances
//
// The deployment-model explorer is the interactive heart: pick
// standalone / small / medium / large and you get the node
// layout, the persona placement, the session ceiling for that
// row of Cisco's Table 3, and the conditions that make it the
// right answer.
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
  Steps,
  Selector,
} from '../sheet-kit'

// The appliance column order below is Cisco's own, from the
// Performance & Scalability tables. It is NOT numeric. Keep it.
const APPLIANCES = ['3595', '3615', '3715', '3655', '3755', '3695', '3795']

const UNSUP = (
  <span className="font-semibold text-signal-600">Unsupported</span>
)

interface NodeBox {
  name: string
  personas: string
  role: string
}

interface Model {
  id: string
  label: string
  title: string
  pill: React.ReactNode
  gist: string
  nodes: NodeBox[]
  facts: [React.ReactNode, React.ReactNode][]
  ceiling: [React.ReactNode, React.ReactNode][]
  ceilingCaption: React.ReactNode
  choose: React.ReactNode[]
  note: { label: string; tone?: 'signal' | 'warn' | 'good'; body: React.ReactNode }
}

const MODELS: Model[] = [
  {
    id: 'standalone',
    label: 'Standalone',
    title: 'Standalone — one node wearing every hat',
    pill: <Pill tone="bad">1 node · lab only</Pill>,
    gist:
      'PAN, MnT, PSN and pxGrid all on the same appliance or VM instance. Everything works, nothing is redundant, and a single reload takes authentication down with it. Cisco states plainly that it is not recommended for production.',
    nodes: [
      {
        name: 'Node 1',
        personas: 'PAN + MnT + PSN + pxGrid',
        role: 'Standalone — primary by definition',
      },
    ],
    facts: [
      ['Nodes', '1'],
      ['Redundancy', 'None. No secondary for any persona'],
      ['PSN type', <>Shared — the node carries PAN and MnT as well</>],
      ['Max PSNs', 'n/a'],
      ['Set at', <M>Administration &gt; System &gt; Deployment</M>],
    ],
    ceiling: [
      ['Which table', <>Table 4, <strong>Shared PSN</strong> row — the node is a shared PSN</>],
      ['3615', '12,500'],
      ['3595 · 3715 · 3655', '20,000 (3595) · 25,000 (3715, 3655)'],
      ['3755 · 3695 · 3795', '50,000'],
    ],
    ceilingCaption: (
      <>
        Cisco publishes no separate standalone row. Read the{' '}
        <strong>Shared PSN</strong> row of Table 4 and treat it as a hard
        ceiling, not a target.
      </>
    ),
    choose: [
      'Labs, proofs of value and feature testing.',
      'Building a configuration you will back up and restore onto a real deployment.',
      'Never for production — one node is one outage.',
    ],
    note: {
      label: 'The upgrade path out',
      tone: 'warn',
      body: (
        <>
          A standalone node becomes the Primary PAN of a real deployment by
          registering a second node to it. Plan the certificate and DNS work
          before you build it, because both forward and reverse resolution must
          already be right at registration time.
        </>
      ),
    },
  },

  {
    id: 'small',
    label: 'Small',
    title: 'Small — two nodes, everything mirrored',
    pill: <Pill tone="neutral">2–3 nodes</Pill>,
    gist:
      'All personas on both nodes, one primary and one secondary, so every persona has a failover partner. The cheapest shape that survives losing a box. An optional third node can be added as an extra PSN, a pxGrid node or a health-check node.',
    nodes: [
      {
        name: 'Node 1',
        personas: 'PAN + MnT + PSN + pxGrid',
        role: 'Primary PAN · Primary MnT',
      },
      {
        name: 'Node 2',
        personas: 'PAN + MnT + PSN + pxGrid',
        role: 'Secondary PAN · Secondary MnT',
      },
      {
        name: 'Node 3 (optional)',
        personas: 'PSN, or pxGrid, or health-check',
        role: 'Additive — does not change the ceiling',
      },
    ],
    facts: [
      ['Nodes', '2, optionally 3'],
      ['Redundancy', 'Primary / Secondary for every persona'],
      ['PSN type', <>Shared — PAN and MnT sit on the same node</>],
      ['Max PSNs', '2 (3 with the optional node)'],
      ['Roles', <>Set per persona, not per node</>],
    ],
    ceiling: [
      ['Table 3 — Small', ''],
      ['3595 · 3615 · 3715', '20,000 · 12,500 · 25,000'],
      ['3655 · 3755', '25,000 · 50,000'],
      ['3695 · 3795', '50,000 · 50,000'],
    ],
    ceilingCaption: (
      <>
        Small tops out at <strong>50,000</strong> concurrent active sessions,
        and only on a 3755, 3695 or 3795. A 3615 pair caps at 12,500 no matter
        what you do to it.
      </>
    ),
    choose: [
      'A single site, or one campus with a fast core.',
      'Up to 50,000 concurrent sessions on the right appliance.',
      'Where the operational cost of five boxes is not justifiable.',
      'Where losing Live Logs during a node rebuild is acceptable.',
    ],
    note: {
      label: 'Shared, not dedicated',
      body: (
        <>
          Both nodes are <strong>shared</strong> PSNs, so they earn the Shared
          PSN column of Table 4 — roughly half the sessions the same appliance
          would carry as a dedicated PSN. That halving is the price of the
          two-box design, and it is why Medium exists.
        </>
      ),
    },
  },

  {
    id: 'medium',
    label: 'Medium',
    title: 'Medium — shared PAN/MnT, dedicated PSNs',
    pill: <Pill tone="neutral">Max 8 nodes</Pill>,
    gist:
      'PAN, MnT and pxGrid run together on a primary/secondary pair; the policy load moves off onto up to six dedicated PSNs. The PSNs now earn the Dedicated PSN numbers, but the deployment ceiling is still set by the appliance carrying PAN and MnT.',
    nodes: [
      {
        name: 'Node 1',
        personas: 'PAN + MnT + pxGrid',
        role: 'Primary PAN · Primary MnT',
      },
      {
        name: 'Node 2',
        personas: 'PAN + MnT + pxGrid',
        role: 'Secondary PAN · Secondary MnT',
      },
      {
        name: 'Nodes 3–8',
        personas: 'PSN only (up to 6)',
        role: 'All active · node groups for CoA takeover',
      },
    ],
    facts: [
      ['Nodes', 'Up to 8'],
      ['Layout', '2 × (PAN/MnT/pxGrid) + max 6 PSNs'],
      ['Variant', <>2 × (PAN/MnT) + 4 PSN + 2 × (pxGrid/SXP)</>],
      ['PSN type', <>Dedicated — read the top row of Table 4</>],
      ['Node groups', <>JGroups on <M>TCP 7800</M> between PSNs</>],
    ],
    ceiling: [
      ['Table 3 — Medium', ''],
      ['3595 · 3615 · 3715', '20,000 · 12,500 · 75,000'],
      ['3655 · 3755', '25,000 · 150,000'],
      ['3695 · 3795', '50,000 · 150,000'],
    ],
    ceilingCaption: (
      <>
        Medium peaks at <strong>150,000</strong> sessions, on a 3755 or a 3795.
        Note the shape of the row: the 3715 and 3755 leap ahead of the 3655 and
        3695 they outrank numerically.
      </>
    ),
    choose: [
      'Session count above what a shared node can carry.',
      'Multiple sites that each want a local PSN.',
      'A load balancer in front of a PSN farm.',
      'Where MnT logging volume is heavy but not yet worth its own pair of boxes.',
    ],
    note: {
      label: 'Adding PSNs does not raise the ceiling',
      tone: 'warn',
      body: (
        <>
          Table 3 is indexed on the appliance acting as{' '}
          <strong>PAN, MnT or PAN/MnT</strong> — not on the PSNs. Six PSNs
          behind a 3615 pair still cap the deployment at 12,500 sessions. If the
          number you need is not in that row, you are buying a bigger PAN/MnT,
          not more PSNs.
        </>
      ),
    },
  },

  {
    id: 'large',
    label: 'Large',
    title: 'Large — every persona on its own hardware',
    pill: <Pill tone="signal">Max 58 nodes</Pill>,
    gist:
      'Dedicated primary and secondary PAN, dedicated primary and secondary MnT, then a pool of up to 50 PSNs and up to 4 pxGrid nodes. This is the only shape that reaches the seven-figure session counts, and the only one where the appliance choice for PAN/MnT can disqualify you outright.',
    nodes: [
      {
        name: 'Nodes 1–2',
        personas: 'PAN only',
        role: 'Primary + Secondary Administration',
      },
      {
        name: 'Nodes 3–4',
        personas: 'MnT only',
        role: 'Primary + Secondary Monitoring',
      },
      {
        name: 'Nodes 5–54',
        personas: 'PSN only — up to 50',
        role: 'All active · grouped for CoA takeover',
      },
      {
        name: 'Nodes 55–58',
        personas: 'pxGrid — up to 4',
        role: 'Active / Active on pxGrid 2.0',
      },
    ],
    facts: [
      ['Nodes', 'Up to 58'],
      ['Layout', '2 PAN + 2 MnT + ≤ 50 PSN + ≤ 4 pxGrid'],
      ['PSN type', 'Dedicated'],
      ['pxGrid', <>pxGrid 2.0 only from ISE 3.1 — <M>TCP 8910</M></>],
      ['Set at', <M>Administration &gt; System &gt; Deployment</M>],
    ],
    ceiling: [
      ['Table 3 — Large', ''],
      ['3595 · 3615 · 3715', <>500,000 · {UNSUP} · {UNSUP}</>],
      ['3655 · 3755', '500,000 · 750,000'],
      ['3695 · 3795', '2,000,000 · 2,000,000'],
    ],
    ceilingCaption: (
      <>
        <strong>3615 and 3715 are Unsupported as PAN or MnT in a large
        deployment.</strong> That is a platform disqualification, not a
        performance figure — no quantity of PSNs makes it work.
      </>
    ),
    choose: [
      'Beyond 150,000 concurrent sessions.',
      'Geographically distributed PSNs across many sites.',
      'Logging volume that needs MnT on dedicated hardware.',
      'Where PAN configuration work must never contend with policy load.',
    ],
    note: {
      label: 'Buy the PAN/MnT for the DB, not the RADIUS',
      body: (
        <>
          The 3795 carries more RAM and better disk read/write than the 3755 and
          is best suited to dedicated PAN, dedicated MnT or PAN/MnT. It provides{' '}
          <strong>no added value as a dedicated PSN</strong> — both stop at
          100,000. Spend the money where the database is.
        </>
      ),
    },
  },
]

export default function DeploymentSheet() {
  const [modelId, setModelId] = useState(MODELS[0].id)
  const model = MODELS.find(m => m.id === modelId) ?? MODELS[0]

  return (
    <Sheet>
      {/* ---------------- THE MODEL EXPLORER ---------------- */}
      <Panel
        title="Deployment model explorer"
        span={12}
        tone="ink"
        right={
          <span className="normal-case tracking-normal">
            Four shapes — pick one and read its ceiling
          </span>
        }
      >
        <Stack gap={8}>
          <div className="flex items-center justify-between gap-4">
            <Selector
              options={MODELS.map(m => ({ id: m.id, label: m.label, hint: m.gist }))}
              value={modelId}
              onChange={setModelId}
              label="Model"
            />
            {model.pill}
          </div>

          <div className="border-t border-ink-200 pt-2">
            <div className="grid grid-cols-12 gap-3">
              {/* node layout */}
              <div className="col-span-3">
                <h4
                  className="text-[12px] font-bold tracking-tight text-ink-950"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  {model.title}
                </h4>
                <div className="mt-1">
                  <Prose>{model.gist}</Prose>
                </div>
              </div>

              <div className="col-span-3">
                <div
                  className="mb-1 border-b border-ink-300 pb-[2px] text-[9px] font-bold uppercase tracking-[0.11em] text-ink-950"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  Node layout and persona placement
                </div>
                <div className="flex flex-col gap-[3px]">
                  {model.nodes.map(n => (
                    <div
                      key={n.name}
                      className="border border-ink-200 bg-paper-dim px-1.5 py-[3px]"
                    >
                      <div
                        className="text-[8.5px] font-bold uppercase tracking-[0.1em] text-signal-600"
                        style={{ fontFamily: 'var(--font-heading)' }}
                      >
                        {n.name}
                      </div>
                      <div
                        className="text-[10px] font-semibold leading-[1.35] text-ink-950"
                        style={{ fontFamily: 'var(--font-heading)' }}
                      >
                        {n.personas}
                      </div>
                      <div
                        className="text-[9px] leading-[1.3] text-ink-400"
                        style={{ fontFamily: 'var(--font-heading)' }}
                      >
                        {n.role}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-1.5">
                  <KV items={model.facts} labelWidth={64} />
                </div>
              </div>

              {/* ceiling */}
              <div className="col-span-3">
                <div
                  className="mb-1 border-b border-ink-300 pb-[2px] text-[9px] font-bold uppercase tracking-[0.11em] text-ink-950"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  Session ceiling by appliance
                </div>
                <KV items={model.ceiling} labelWidth={92} />
                <div className="mt-1.5">
                  <Prose>{model.ceilingCaption}</Prose>
                </div>
              </div>

              {/* when to choose */}
              <div className="col-span-3">
                <div
                  className="mb-1 border-b border-ink-300 pb-[2px] text-[9px] font-bold uppercase tracking-[0.11em] text-ink-950"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  When to choose it
                </div>
                <Bullets items={model.choose} />
                <div className="mt-2">
                  <Note label={model.note.label} tone={model.note.tone}>
                    {model.note.body}
                  </Note>
                </div>
              </div>
            </div>
          </div>
        </Stack>
      </Panel>

      {/* ---------------- TABLE 3 ---------------- */}
      <Panel
        title="Table 3 — Max concurrent active sessions"
        kicker="Appliance acting as PAN, MnT or PAN/MnT"
        span={7}
        tone="signal"
      >
        <Table
          head={[
            'Deployment',
            ...APPLIANCES.map(a => (
              <span key={a}>
                SNS
                <br />
                {a}
              </span>
            )),
          ]}
          widths={['15%', '12%', '12%', '12%', '12%', '12%', '12%', '13%']}
          align={['left', 'right', 'right', 'right', 'right', 'right', 'right', 'right']}
          rows={[
            ['Large', '500,000', UNSUP, UNSUP, '500,000', '750,000', '2,000,000', '2,000,000'],
            ['Medium', '20,000', '12,500', '75,000', '25,000', '150,000', '50,000', '150,000'],
            ['Small', '20,000', '12,500', '25,000', '25,000', '50,000', '50,000', '50,000'],
          ]}
        />
        <div className="mt-2">
          <Note label="Read the column order twice">
            The appliance columns are <strong>not</strong> in numeric order —
            Cisco prints them <M>3595 · 3615 · 3715 · 3655 · 3755 · 3695 · 3795</M>.
            The 3700 series is interleaved with the 3600 series, so a careless
            read swaps a 75,000 for a 25,000. This table is indexed on the
            PAN/MnT appliance, not on the PSNs.
          </Note>
        </div>
      </Panel>

      {/* ---------------- TABLE 4 ---------------- */}
      <Panel
        title="Table 4 — Sessions per PSN"
        kicker="Dedicated vs shared"
        span={5}
      >
        <Table
          head={['PSN type', ...APPLIANCES.map(a => <span key={a}>{a}</span>)]}
          widths={['24%', '11%', '11%', '11%', '11%', '11%', '11%', '10%']}
          align={['left', 'right', 'right', 'right', 'right', 'right', 'right', 'right']}
          rows={[
            [
              <>Dedicated<div className="font-normal text-ink-400">PSN persona only</div></>,
              '40,000', '25,000', '50,000', '50,000', '100,000', '100,000', '100,000',
            ],
            [
              <>Shared<div className="font-normal text-ink-400">multiple personas</div></>,
              '20,000', '12,500', '25,000', '25,000', '50,000', '50,000', '50,000',
            ],
          ]}
        />
        <div className="mt-2">
          <Note label="Footnote to the 3795 column">
            The SNS 3795 has more RAM and better disk read/write performance. It
            is best suited to a <strong>dedicated PAN, dedicated MnT or
            PAN/MnT</strong> and provides <strong>no added value</strong> when
            deployed as a dedicated PSN. Sharing personas onto a node halves its
            session count on every platform in the table.
          </Note>
        </div>
      </Panel>

      {/* ---------------- APPLIANCES ---------------- */}
      <Panel title="SNS appliances" kicker="Three live series" span={5}>
        <Stack gap={6}>
          <Table
            head={['Series', 'Models', 'Notes']}
            widths={['17%', '31%', '52%']}
            rows={[
              [
                'SNS 3600',
                <>3615 · 3655 · 3695</>,
                <>Small / medium / large. An end-of-life notice is published for the series.</>,
              ],
              [
                'SNS 3700',
                <>3715 · 3755 · 3795</>,
                <>Small / medium / large. Data-sheet scale is stated for ISE 3.1 P6 and later. An end-of-life notice is published.</>,
              ],
              [
                'SNS 3800',
                <>3815 · 3855 · 3895</>,
                <>Based on Cisco UCS C225 M8. Introduced for ISE <strong>3.5</strong>, back-supported on <strong>3.3 P7</strong> and <strong>3.4 P4</strong>.</>,
              ],
            ]}
          />
          <Table
            head={['SNS 3700 spec', '3715', '3755', '3795']}
            widths={['28%', '24%', '24%', '24%']}
            rows={[
              ['CPU', 'Intel 4310 2.1 GHz', 'Intel 4316 2.3 GHz', 'Intel 4316 2.3 GHz'],
              ['Cores / threads', '12 / 24', '20 / 40', '20 / 40'],
              ['Memory', '32 GB', '96 GB', '256 GB'],
              ['Disk', '1 × 600 GB SAS', '4 × 600 GB SAS', '8 × 600 GB SAS'],
              ['RAID', '0', '10', '10'],
            ]}
          />
          <Prose>
            All three carry 2 × 10GBase-T plus 4 × 10GE SFP. ISE 3.5 supports
            all nine models across the three series; detailed 3800-series CPU,
            memory and disk figures live in the 3800 data sheet and are not
            reproduced here.
          </Prose>
        </Stack>
      </Panel>

      {/* ---------------- VMs ---------------- */}
      <Panel title="Virtual machines and cloud" kicker="Match a profile to earn its numbers" span={4}>
        <Stack gap={6}>
          <Prose>
            A VM earns an appliance&rsquo;s scale numbers only if it is built to
            that appliance&rsquo;s resource profile. Under-provision the CPU,
            memory or disk and Tables 3 and 4 simply do not apply to it — there
            is no partial credit and ISE will not warn you.
          </Prose>
          <Code
            title="Size the VM against a profile, then read that column"
            code={`SNS-3715 profile   12 cores / 24 threads    32 GB RAM   1 x 600 GB   RAID 0
SNS-3755 profile   20 cores / 40 threads    96 GB RAM   4 x 600 GB   RAID 10
SNS-3795 profile   20 cores / 40 threads   256 GB RAM   8 x 600 GB   RAID 10

Extra-small VM      8 vCPU                  32 GB RAM   (from ISE 3.2)`}
          />
          <KV
            items={[
              ['VMware', <>OVA templates v14+ on ESXi <strong>7.0, 8.0, 9.0</strong>. vMotion hot and cold migration supported from 3.5</>],
              ['Microsoft', <>Hyper-V on Windows Server 2012 R2+ · Azure Stack HCI 23H2+</>],
              ['KVM / Nutanix', <>QEMU 2.12.0+ · Nutanix AOS 7.0+ with AHV and NC2</>],
              ['OpenShift', 'Red Hat OCP 4.19 and later'],
              ['Native cloud', 'AWS, Microsoft Azure, Oracle Cloud Infrastructure'],
              ['Licence', <>A platform licence is required — <M>R-ISE-VMC-K9=</M> VM Common</>],
            ]}
            labelWidth={72}
          />
        </Stack>
      </Panel>

      {/* ---------------- BANDWIDTH ---------------- */}
      <Panel title="Inter-node bandwidth minimums" kicker="Design input" span={3} tone="quiet">
        <Table
          head={['Link', 'Minimum']}
          widths={['64%', '36%']}
          rows={[
            ['Monitoring ↔ Policy Service', <strong key="a">1 Mbps</strong>],
            ['Monitoring ↔ Admin', '256 Kbps'],
            ['Monitoring ↔ Monitoring (redundant)', '256 Kbps'],
            [
              <>Admin ↔ Policy Service{' '}
                <span className="font-normal text-ink-400">(redundant admin)</span></>,
              '256 Kbps',
            ],
            [
              <>Client ↔ Policy Service{' '}
                <span className="font-normal text-ink-400">with posture</span></>,
              '125 bps / endpoint',
            ],
          ]}
        />
        <div className="mt-2">
          <Note label="Multiply the last row">
            125 bps per endpoint sounds like nothing until you put 20,000
            posture clients behind one WAN link. Size the client-to-PSN path
            from the endpoint count at that site, not from the deployment total.
          </Note>
        </div>
      </Panel>

      {/* ---------------- SIZING METHOD ---------------- */}
      <Panel title="From an endpoint count to a bill of materials" kicker="The method" span={7}>
        <Steps
          cols={2}
          items={[
            <>Count <strong>concurrent active sessions</strong> at peak, not owned endpoints. A laptop with a wired dock and Wi-Fi is two sessions; a phone with a PC behind it is two on one port.</>,
            <>Add growth. Sizing to today&rsquo;s number leaves nothing for the year-three estate or a merger.</>,
            <>Pick the model from the <strong>node count you need</strong> — 2–3 nodes small, up to 8 medium, up to 58 large.</>,
            <>Choose the PAN/MnT appliance from <strong>Table 3</strong>, in the row for that model. This sets the deployment ceiling.</>,
            <>Choose the PSN appliance from <strong>Table 4</strong>, using the Dedicated row for medium and large, the Shared row for standalone and small.</>,
            <>Size for <strong>N+1</strong>: the surviving PSNs must carry the full session count when one is down or being patched.</>,
            <>Check the bandwidth minimums on every persona-to-persona path, and the client-to-PSN path per site.</>,
            <>Size TACACS+ separately — device administration scales on network devices, not endpoints.</>,
          ]}
        />
        <div className="mt-2">
          <Note label="The mistake that costs a refresh" tone="warn">
            Sizing the PSNs correctly and the PAN/MnT cheaply. The PAN/MnT
            appliance sets the number in Table 3, and it is the one you cannot
            fix later by adding boxes. Two 3615s will never carry a large
            deployment, at any PSN count.
          </Note>
        </div>
      </Panel>

      {/* ---------------- TACACS SCALE ---------------- */}
      <Panel title="TACACS+ device-administration scale" kicker="Counted in NADs" span={5} tone="quiet">
        <Table
          head={['Deployment', '3615 3715', '3815', '3655 3755', '3855', '3695 3795 3895']}
          widths={['20%', '17%', '13%', '17%', '13%', '20%']}
          align={['left', 'right', 'right', 'right', 'right', 'right']}
          rows={[
            ['Small', '1,000', '2,500', '10,000', '10,000', '10,000'],
            ['Medium', '2,500', '5,000', '25,000', '50,000', '50,000'],
            ['Large', UNSUP, UNSUP, '50,000', '100,000', <>300,000 <span className="text-ink-400">*</span></>],
          ]}
        />
        <div className="mt-2">
          <KV
            items={[
              ['* 300,000', <>Supported from <strong>ISE 3.5 Patch 3</strong> onward</>],
              ['Throughput', <>Dedicated PSN, internal identity store: <strong>2,500–3,200 TPS</strong>. External identity store: <strong>2,000–2,500 TPS</strong></>],
              ['TLS 1.3 cost', <>Roughly a <strong>30–40% reduction</strong> in TACACS+ throughput</>],
              ['Licence', <>Per PSN — <M>L-ISE-TACACS-ND=</M>, no endpoint impact</>],
            ]}
            labelWidth={72}
          />
        </div>
      </Panel>
    </Sheet>
  )
}
