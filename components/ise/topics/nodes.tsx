'use client'

// ============================================================
// Topic — Node Registration & Replication
//
// The 23-step join ladder is the centre of this sheet. The
// interactive part is small on purpose: pick a log file and it
// tells you which steps of that ladder it covers.
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

interface LogFile {
  id: string
  label: string
  file: string
  steps: string
  phase: string
  contains: React.ReactNode
  look: React.ReactNode[]
  cmd: string
}

const LOGS: LogFile[] = [
  {
    id: 'psc',
    label: 'ise-psc.log',
    file: 'ise-psc.log',
    steps: 'Steps 1 – 14',
    phase: 'Discovery, TLS and certificate exchange',
    contains: (
      <>
        The main ISE application log. For a join it carries the{' '}
        <strong>DNS queries</strong>, <strong>certificate validation</strong>,{' '}
        <strong>certificate replication</strong> and{' '}
        <strong>sync status control</strong>.
      </>
    ),
    look: [
      <>
        Name resolution failing in either direction — the PAN resolving the
        node, or the node resolving the PAN
      </>,
      <>
        Certificate validation errors against the Trusted Certificates store:
        wrong chain, missing root, expired admin certificate
      </>,
      <>Credential or authorisation failures around the Configure Node submit</>,
      <>Shared certificate replication not reaching the node&rsquo;s NSSDB</>,
    ],
    cmd: `show logging application ise-psc.log tail`,
  },
  {
    id: 'ade',
    label: 'ADE.log',
    file: 'ADE.log',
    steps: 'Steps 15 – 18',
    phase: 'Database export, transfer and import',
    contains: (
      <>
        The underlying appliance OS log. It contains the{' '}
        <strong>database import and export process</strong> along with{' '}
        <strong>service start and stop</strong> — which is exactly the window
        where the node has stopped everything except its database.
      </>
    ),
    look: [
      <>The export on the PAN failing, or never reaching the current SCN</>,
      <>
        Disk space on either node — a DMP file plus the running database needs
        room on both sides
      </>,
      <>Services that stopped for the import and never came back up</>,
      <>Checksum mismatch on the transferred DMP file</>,
    ],
    cmd: `show logging system ade/ADE.log`,
  },
  {
    id: 'repl',
    label: 'replication.log',
    file: 'replication.log',
    steps: 'Steps 19 – 23',
    phase: 'JGroups, sync status and the replay of missed changes',
    contains: (
      <>
        Deployment replication — components <M>replication-deployment</M>,{' '}
        <M>JGroup</M> and <M>JMS</M>. Use it for problems{' '}
        <strong>after the DB import</strong>, and for DMP file transfer
        failures. This is where you look when a node sits at{' '}
        <strong>Out of Sync</strong>.
      </>
    ),
    look: [
      <>
        The JGroups connection on <M>TCP 12001</M> never establishing — the
        node is the TLS client here, the reverse of step 3
      </>,
      <>Certificate validation failing on the node side at step 22</>,
      <>Sync status updates sent but the missed changes never replayed</>,
      <>A node that reaches In Sync and then drifts back out under load</>,
    ],
    cmd: `show logging application replication.log tail`,
  },
]

export default function NodesSheet() {
  const [logId, setLogId] = useState(LOGS[0].id)
  const log = LOGS.find(l => l.id === logId) ?? LOGS[0]

  return (
    <Sheet>
      {/* ---------------- what a join is ---------------- */}
      <Panel title="What registration actually is" kicker="Join process in a nutshell" span={4}>
        <Stack gap={7}>
          <Prose>
            A join is <strong>authenticated configuration database
            replication</strong> from the Primary PAN to the node being joined.
            Everything else — the TLS handshakes, the certificate shuffling, the
            firewall rules — exists to make that copy safe and to keep it
            up to date afterwards.
          </Prose>
          <KV
            items={[
              [
                'Start it at',
                <>
                  <M>Administration &gt; System &gt; Deployment</M> →{' '}
                  <strong>Register</strong> → Register an ISE Node
                </>,
              ],
              [
                'Step 2 form',
                'Configure Node — hostname, FQDN, IP address, and the personas the node will run',
              ],
              [
                'Channels',
                <>
                  <M>TCP 443</M> TLS for the join itself · <M>TCP 12001</M>{' '}
                  JGroups for replication · <M>UDP/TCP 53</M> DNS, both
                  directions
                </>,
              ],
              [
                'What moves',
                'The configuration database, as a dump taken to a point in time, plus certificates',
              ],
            ]}
            labelWidth={72}
          />
          <Note label="Private keys never move">
            Only certificates are downloaded — the node keeps its own private
            key. The shared certificates that come the other way are any system
            wildcard certificates (a portal certificate, for instance) plus the
            PAN&rsquo;s SAML certificate, and they land in the node&rsquo;s{' '}
            <M>~/.pki/nssdb</M>.
          </Note>
        </Stack>
      </Panel>

      {/* ---------------- node groups ---------------- */}
      <Panel title="Node groups — why PSNs are grouped" span={4} tone="quiet">
        <Stack gap={7}>
          <Prose>
            A node group is a set of <strong>PSNs</strong> that share session
            information over JGroups. It is not a load-balancing construct —
            NADs still pick their own server from the AAA group. It exists so
            that a session does not die with the node that owns it.
          </Prose>
          <KV
            items={[
              ['Members', 'Policy Service nodes only'],
              [
                'Transport',
                <>
                  <M>TCP 7800</M> — JGroups clustering for node-group membership
                </>,
              ],
              [
                'What it buys',
                'If a PSN fails, a peer in the same group can issue the CoA for sessions the dead node owned',
              ],
              [
                'Grouping rule',
                'Group PSNs that are close to each other and serve the same sites — not PSNs at opposite ends of a WAN',
              ],
            ]}
            labelWidth={78}
          />
          <Note label="Two different JGroups">
            <M>TCP 12001</M> is deployment-wide replication between every node
            and the PAN. <M>TCP 7800</M> is node-group membership between PSNs.
            They are separate flows, and a firewall that permits one and blocks
            the other produces a deployment that replicates fine but never fails
            over cleanly.
          </Note>
        </Stack>
      </Panel>

      {/* ---------------- deregistration ---------------- */}
      <Panel title="Deregistration and re-registration" span={4}>
        <Stack gap={7}>
          <Prose>
            Deregistering a node returns it to <strong>standalone</strong> with
            its own copy of the configuration database. It stops receiving
            replication immediately, and it keeps running with whatever it last
            knew — which is the property the hybrid upgrade method exploits.
          </Prose>
          <Bullets
            items={[
              <>
                Deregistration is available from the GUI or the CLI; the
                Deployment node list carries <strong>Edit</strong>,{' '}
                <strong>Register</strong> and <strong>Syncup</strong> on the
                same toolbar
              </>,
              <>
                <strong>Re-registration is a full join.</strong> The whole
                23-step sequence runs again, including a fresh configuration
                database copy. It is not a cheap operation and it is not
                instant on a large database
              </>,
              <>
                A reimaged node comes back with new self-signed certificates, so
                the trust that made the first join work has to be re-established
                before the second one will
              </>,
              <>
                <strong>Syncup</strong> forces a resynchronisation of a node
                showing Out of Sync — try it before you deregister anything
              </>,
            ]}
          />
          <Note label="Order of operations" tone="warn">
            Deregister <em>then</em> reimage. Reimaging a node that is still
            registered leaves the PAN holding a deployment entry for a node that
            no longer exists, and the replacement cannot register under the same
            name until that entry is cleared.
          </Note>
        </Stack>
      </Panel>

      {/* ---------------- THE LADDER ---------------- */}
      <Panel
        title="The join sequence, all 23 steps"
        kicker="443 → DMP → 12001 · click to enlarge"
        span={12}
        tone="signal"
      >
        <Ladder
          actors={['DNS', 'Primary PAN', 'Joining node']}
          columns={3}
          steps={[
            { from: 1, to: 1, label: 'Register an ISE Node (GUI)' },
            { from: 1, to: 0, label: 'Who is the node?', tone: 'muted', dashed: true },
            {
              from: 1,
              to: 2,
              label: 'Client Hello / Server Hello',
              sub: 'TLS on 443 — PAN is the client',
            },
            { from: 1, to: 1, label: 'Certificate validation vs trust store' },
            { from: 1, to: 2, label: 'Credentials + PAN info' },
            { from: 2, to: 2, label: 'User authentication / authorisation' },
            { from: 2, to: 0, label: 'Who is the PAN?', tone: 'muted', dashed: true },
            { from: 2, to: 1, label: 'Standalone node info' },
            { from: 1, to: 1, label: 'Configure Node form submitted' },
            { from: 1, to: 1, label: 'Node details saved to the DB' },
            {
              from: 2,
              to: 1,
              label: 'Certificates download → saved to PAN DB',
              sub: 'certificates only; private keys stay',
            },
            { from: 1, to: 1, label: 'FW rules updated to permit JGroups in' },
            {
              from: 1,
              to: 2,
              label: 'Shared certificates replicated → NSSDB',
              sub: 'wildcard system certs + PAN SAML cert',
            },
            { from: 2, to: 2, label: 'FW rules updated for the new role' },
            { from: 1, to: 1, label: 'Config DB exported up to current SCN' },
            { from: 1, to: 2, label: 'DMP file + checksum transferred', tone: 'signal' },
            { from: 2, to: 2, label: 'DB import — all services but the DB stopped' },
            { from: 1, to: 1, label: 'DB dump destroyed on both nodes' },
            { from: 2, to: 2, label: 'JGroups process starts' },
            { from: 2, to: 0, label: 'Who is the PAN?', tone: 'muted', dashed: true },
            {
              from: 2,
              to: 1,
              label: 'Client Hello / Server Hello',
              sub: 'TCP 12001 — the node is the client now',
              tone: 'signal',
            },
            { from: 2, to: 2, label: 'Certificate validation vs trust store' },
            {
              from: 2,
              to: 1,
              label: 'Sync status + request changes from SCN',
              sub: 'PAN replays missed changes; node applies them',
              tone: 'signal',
            },
          ]}
        />
      </Panel>

      {/* ---------------- replication ---------------- */}
      <Panel title="The replication model" kicker="Full once, incremental forever" span={6}>
        <Stack gap={7}>
          <Prose>
            The join performs one <strong>full copy</strong>. After that the PAN
            publishes changes <strong>incrementally</strong> — its JGroups
            process pushes database changes out to every registered node, and
            each node applies them.
          </Prose>
          <KV
            items={[
              [
                'SCN',
                <>
                  System Change Number. The PAN database is constantly changing
                  as endpoints are seen and ownership moves, so it cannot be
                  stopped for a copy. A dump is taken up to one SCN, and the new
                  node then asks for everything after it
                </>,
              ],
              [
                'Import',
                'Before the import the node stops every service except the database. Afterwards it resets the local Redis profiler database',
              ],
              [
                'Steady state',
                <>
                  DB Changes Publishing from the PAN over <M>TCP 12001</M>
                </>,
              ],
            ]}
            labelWidth={64}
          />
          <Table
            head={['State', 'What it means']}
            widths={['32%', '68%']}
            rows={[
              [
                <Pill key="a" tone="good">In Sync</Pill>,
                'The node has the full database and is receiving published changes',
              ],
              [
                <Pill key="b" tone="bad">Out of Sync</Pill>,
                'Changes are not landing. Try Syncup, then read replication.log — the usual causes are the 12001 path and certificates, not the database',
              ],
            ]}
          />
          <Note label="Sync status is an assertion">
            After the import the node must contact the PAN over JGroups and say
            the import completed. To do that it has to resolve the PAN&rsquo;s
            FQDN and verify the PAN&rsquo;s certificate — so a node stuck just
            short of In Sync is nearly always a DNS or certificate problem
            wearing a database costume.
          </Note>
        </Stack>
      </Panel>

      {/* ---------------- troubleshooting ---------------- */}
      <Panel
        title="Troubleshooting a failed join"
        span={6}
        tone="ink"
        right={<span className="normal-case tracking-normal">Pick a log</span>}
      >
        <Stack gap={7}>
          <Selector
            size="sm"
            options={LOGS.map(l => ({ id: l.id, label: l.label }))}
            value={logId}
            onChange={setLogId}
          />

          <div className="border-t border-ink-200 pt-2">
            <div className="flex items-baseline justify-between gap-2">
              <span
                className="text-[11px] font-bold tracking-tight text-ink-950"
                style={{ fontFamily: 'var(--font-heading)' }}
              >
                {log.file}
              </span>
              <Pill tone="signal">{log.steps}</Pill>
            </div>
            <div className="mt-[3px]">
              <Prose>
                <strong>{log.phase}.</strong> {log.contains}
              </Prose>
            </div>
            <div className="mt-2">
              <div
                className="mb-1 border-b border-ink-300 pb-[2px] text-[9px] font-bold uppercase tracking-[0.11em] text-ink-950"
                style={{ fontFamily: 'var(--font-heading)' }}
              >
                What to look for
              </div>
              <Bullets items={log.look} />
            </div>
            <div className="mt-2">
              <Code title="Read it" code={log.cmd} />
            </div>
          </div>

          <Split
            cols={1}
            parts={[
              {
                title: 'Packet capture — what each port tells you',
                children: (
                  <Stack gap={5}>
                    <Table
                      head={['Symptom', 'Ports']}
                      widths={['66%', '34%']}
                      rows={[
                        ['Fatal TLS errors', <><M key="a">443</M> <M key="b">12001</M></>],
                        ['Certificates and certificate chains', <><M key="c">443</M> <M key="d">12001</M></>],
                        ['Un-answered SYNs', <M key="e">12001</M>],
                      ]}
                    />
                    <Code
                      title="Capture between the PAN and the failing node"
                      code={`ip host <node-ip> and (port 443 or port 12001)`}
                    />
                  </Stack>
                ),
              },
            ]}
          />

          <Note label="Do not start by enabling debugs" tone="good">
            In roughly 90% of join failures the default logging levels are
            enough. Read the three files in step order first — the failure is
            almost always visible at the default level, and turning on debugs
            just buries it.
          </Note>
        </Stack>
      </Panel>
    </Sheet>
  )
}
