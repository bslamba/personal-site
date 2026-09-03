'use client'

// ============================================================
// Topic — Architecture & Personas
// ============================================================

import React from 'react'
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
} from '../sheet-kit'

export default function ArchitectureSheet() {
  return (
    <Sheet>
      {/* ---------------- what a node is ---------------- */}
      <Panel title="What Cisco ISE actually is" kicker="One image, four hats" span={5}>
        <Stack gap={7}>
          <Prose>
            Cisco ISE is a policy engine that sits between the network and the
            identity stores. Every node runs the <em>same</em> software image;
            what differs is which <strong>personas</strong> you switch on. A
            persona is a set of services, not a separate product — which is why
            a lab and a 2-million-session deployment install identically and
            diverge only in the Deployment page.
          </Prose>

          <KV
            items={[
              ['Node', 'One appliance or VM running the ISE image'],
              ['Persona', 'Which services that node runs — PAN, MnT, PSN, pxGrid'],
              [
                'Role',
                <>Primary or Secondary, set <em>per persona</em>, not per node</>,
              ],
              [
                'Deployment',
                'All nodes registered to one Primary PAN, sharing one database',
              ],
              [
                'Node group',
                <>
                  PSNs that share session state so a peer can issue the CoA if
                  one dies — JGroups on <M>TCP 7800</M>
                </>,
              ],
            ]}
            labelWidth={72}
          />

          <Note label="Design rule">
            Personas can be combined on one node, but PAN and MnT are database
            roles and PSN is a runtime role. Sharing them halves the session
            scale of that node — see the Deployment &amp; Sizing sheet.
          </Note>
        </Stack>
      </Panel>

      {/* ---------------- the personas ---------------- */}
      <Panel title="The four personas" kicker="Services · redundancy · ports" span={7} tone="signal">
        <Table
          head={['Persona', 'What it does', 'Redundancy', 'Max', 'Key ports']}
          widths={['16%', '40%', '17%', '9%', '18%']}
          rows={[
            [
              <>PAN<div className="font-normal text-ink-400">Policy Administration</div></>,
              'The only place configuration is written. Owns the master Oracle configuration DB and replicates every change out to all other nodes. Runs the admin GUI, ERS and OpenAPI, and the internal CA.',
              <>Primary / Secondary<br />
                <span className="text-ink-400">manual promotion (or Auto-Failover)</span></>,
              '2',
              <><M>443</M> <M>9060</M> <M>12001</M></>,
            ],
            [
              <>MnT<div className="font-normal text-ink-400">Monitoring</div></>,
              'Collects logs from every PSN and NAD, holds the session directory in an Oracle TimesTen in-memory DB, and serves Live Logs, Live Sessions, reports and alarms.',
              <>Primary / Secondary<br />
                <span className="text-ink-400">both collect; Primary serves the GUI</span></>,
              '2',
              <><M>20514</M> <M>9443</M> <M>2484</M></>,
            ],
            [
              <>PSN<div className="font-normal text-ink-400">Policy Service</div></>,
              'The workhorse. Terminates RADIUS and TACACS+, evaluates policy, runs profiling, posture, guest and BYOD portals, SXP and the CoA originator. The only persona endpoints ever talk to.',
              <>Scale-out<br />
                <span className="text-ink-400">all active; node groups for CoA takeover</span></>,
              '50',
              <><M>1812/1813</M> <M>49</M> <M>8443</M> <M>8905</M></>,
            ],
            [
              <>pxGrid<div className="font-normal text-ink-400">Platform Exchange Grid</div></>,
              'The context bus. Publishes session, TrustSec and endpoint context to subscribers such as Secure Firewall, Catalyst Center and Secure Network Analytics, and accepts ANC actions back.',
              <>Active / Active from 2.4<br />
                <span className="text-ink-400">(Active / Standby on pxGrid 1.0)</span></>,
              '4',
              <><M>8910</M></>,
            ],
          ]}
        />
        <div className="mt-2">
          <Note label="Also a persona in name only">
            <strong>Device Admin</strong> (TACACS+) and <strong>Passive ID</strong>{' '}
            are <em>services</em> enabled on a PSN, not personas — each is
            licensed and toggled per node under{' '}
            <M>Administration &gt; System &gt; Deployment &gt; node</M>.
          </Note>
        </div>
      </Panel>

      {/* ---------------- registration flow ---------------- */}
      <Panel title="How a node joins the deployment" kicker="Registration in outline" span={5}>
        <Ladder
          actors={['New node', 'Primary PAN', 'Config DB']}
          steps={[
            { from: 0, to: 1, label: 'DNS forward + reverse resolution', tone: 'muted', dashed: true },
            { from: 1, to: 0, label: 'TLS Client/Server Hello · certificate validation', sub: 'admin cert must be trusted both ways' },
            { from: 0, to: 1, label: 'Admin credentials exchanged over 443', tone: 'signal' },
            { from: 1, to: 2, label: 'Export configuration DB to a dump file' },
            { from: 2, to: 0, label: 'DMP + checksum transferred, then imported' },
            { from: 0, to: 1, label: 'JGroups handshake on TCP 12001', tone: 'signal' },
            { from: 1, to: 0, label: 'Missed changes replayed · node reaches In Sync' },
          ]}
        />
        <div className="mt-1.5">
          <Note label="Watch">
            The node keeps its own private key — only certificates move. If
            registration hangs, capture on <M>443</M> and <M>12001</M>: a fatal
            TLS alert means the certificate chain, an unanswered SYN means the
            firewall.
          </Note>
        </div>
      </Panel>

      {/* ---------------- bandwidth ---------------- */}
      <Panel title="Inter-node bandwidth minimums" kicker="Design input" span={3} tone="quiet">
        <Table
          head={['Link', 'Minimum']}
          widths={['66%', '34%']}
          rows={[
            ['MnT ↔ Policy Service', <strong key="a">1 Mbps</strong>],
            ['MnT ↔ Admin', '256 Kbps'],
            ['MnT ↔ MnT (redundant)', '256 Kbps'],
            ['Admin ↔ Policy Service', '256 Kbps'],
            [
              <>Client ↔ PSN <span className="font-normal text-ink-400">with posture</span></>,
              '125 bps / endpoint',
            ],
          ]}
        />
        <div className="mt-2">
          <Prose>
            Latency matters more than throughput. Cisco supports up to{' '}
            <strong>300&nbsp;ms</strong> round trip between PAN and PSN, but
            replication and CoA both feel a slow WAN long before that.
          </Prose>
        </div>
      </Panel>

      {/* ---------------- failure behaviour ---------------- */}
      <Panel title="What happens when a node dies" span={4}>
        <Table
          head={['Lost node', 'Impact', 'Recovery']}
          widths={['20%', '52%', '28%']}
          rows={[
            [
              'Primary PAN',
              'Authentication continues. No configuration changes, no new guest accounts, no internal CA issuance, no endpoint context writes to the master DB.',
              'Promote Secondary PAN (manual, or Auto-Failover after the configured checks)',
            ],
            [
              'Secondary PAN',
              'No user-visible impact. You lose your failover target.',
              'Re-register or rebuild',
            ],
            [
              'Primary MnT',
              'Authentication continues. Live Logs, reports and the session directory go dark until the Secondary takes the GUI.',
              'Automatic — Secondary MnT already collects everything',
            ],
            [
              'PSN',
              <>
                Sessions on that PSN are orphaned. NADs fail over to the next
                server in the AAA group after <M>dead-criteria</M>. Endpoints
                mid-posture restart the flow.
              </>,
              'NAD failover; node group peer issues the CoA',
            ],
            [
              'pxGrid',
              'Context sharing stops; subscribers reconnect to a surviving node. Access control itself is unaffected.',
              'Automatic on pxGrid 2.0 (Active/Active)',
            ],
          ]}
        />
      </Panel>

      {/* ---------------- design questions ---------------- */}
      <Panel title="Questions to settle before the first node is built" kicker="From the design workbook" span={5} tone="quiet">
        <Bullets
          cols={2}
          items={[
            'Deployment model — standalone, small, medium, large or hybrid?',
            'Available bandwidth and latency between every persona?',
            'Sizing: concurrent sessions today, and at year three?',
            'Physical SNS appliances or virtual machines — and which resource profile?',
            'Where do the Active Directory domain controllers sit relative to each PSN?',
            'Central deployment: what happens at a branch when the WAN drops and ISE is unreachable?',
            'What happens if an entire site goes down?',
            'What happens when the Primary PAN goes down?',
            'What happens when an MnT goes down?',
            'What happens when one PSN goes down?',
            'If any node fails, can the survivor carry the load at acceptable latency?',
            'Load balancer in front of the PSNs, or NAD-side server lists?',
          ]}
        />
      </Panel>

      {/* ---------------- processes ---------------- */}
      <Panel title="Processes on a node" kicker="show application status ise" span={4}>
        <Table
          head={['Process', 'What it is']}
          widths={['38%', '62%']}
          rows={[
            ['Database Listener', 'Oracle listener — nothing runs without it'],
            ['Database Server', 'Oracle Enterprise: configuration + operational data'],
            ['Application Server', 'The Tomcat instance behind the GUI and portals'],
            ['Profiler Database', 'Redis, backing the profiling service'],
            ['AD Connector', 'AD runtime — down means no AD authentications'],
            ['M&T Session Database', 'Oracle TimesTen in-memory session directory'],
            ['M&T Log Collector', 'Receives syslog from PSNs and NADs'],
            ['M&T Log Processor', 'Parses and indexes what the collector receives'],
            ['Certificate Authority Service', 'The ISE internal CA, if enabled'],
          ]}
        />
      </Panel>

      {/* ---------------- CLI ---------------- */}
      <Panel title="The commands you actually type" span={3}>
        <Stack gap={6}>
          <Code
            title="Node health"
            code={`show application status ise
show application version ise
show running-config
show ports | include 1812
show inventory
show tech-support`}
          />
          <Code
            title="Restart / reset"
            code={`application stop ise
application start ise
application reset-config ise
application reset-passwd ise admin`}
          />
          <Split
            cols={1}
            parts={[
              {
                title: 'Persona is set in the GUI',
                children: (
                  <Prose>
                    <M>Administration &gt; System &gt; Deployment</M> — tick the
                    personas, set the role, and ISE restarts the services it
                    needs. Changing a persona restarts the application on that
                    node.
                  </Prose>
                ),
              },
            ]}
          />
        </Stack>
      </Panel>

      {/* ---------------- deployment shapes ---------------- */}
      <Panel title="The four deployment shapes" kicker="Detail on the Sizing sheet" span={12} tone="quiet">
        <div className="grid grid-cols-4 gap-3">
          {[
            {
              name: 'Standalone',
              pill: <Pill tone="bad">Lab only</Pill>,
              lines: [
                'PAN + MnT + PSN + pxGrid on one node.',
                'No redundancy of any kind.',
                'Not recommended for production.',
              ],
            },
            {
              name: 'Small',
              pill: <Pill tone="neutral">2 nodes</Pill>,
              lines: [
                'All personas on both nodes.',
                'One Primary, one Secondary — full redundancy.',
                'Up to 50,000 sessions on the right appliance.',
              ],
            },
            {
              name: 'Medium',
              pill: <Pill tone="neutral">Max 8 nodes</Pill>,
              lines: [
                '2 × (PAN/MnT/pxGrid) + up to 6 dedicated PSNs.',
                'Or 2 × (PAN/MnT) + 4 PSN + 2 × (pxGrid/SXP).',
                'PAN and MnT share a node; PSNs are dedicated.',
              ],
            },
            {
              name: 'Large',
              pill: <Pill tone="signal">Max 58 nodes</Pill>,
              lines: [
                '2 dedicated PAN + 2 dedicated MnT.',
                'Up to 50 PSNs and up to 4 pxGrid nodes.',
                'Every persona on its own hardware.',
              ],
            },
          ].map(d => (
            <div key={d.name} className="border border-ink-200 bg-paper-dim px-2 py-1.5">
              <div className="flex items-center justify-between gap-2">
                <span
                  className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-950"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  {d.name}
                </span>
                {d.pill}
              </div>
              <div className="mt-1">
                <Bullets items={d.lines} />
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </Sheet>
  )
}
