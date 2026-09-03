'use client'

// ============================================================
// Topic — Upgrade, Patching & Backup
//
// The method explorer is the interactive part: four ways to get
// to the next release, each with its own flow, its profile from
// the selection matrix, and what it actually asks of you.
// ============================================================

import React, { useState } from 'react'
import {
  Sheet,
  Panel,
  KV,
  Bullets,
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

interface Method {
  id: string
  label: string
  name: string
  suits: React.ReactNode
  flow: { label: string; detail?: React.ReactNode; tone?: 'signal' | 'ink' }[]
  profile: [React.ReactNode, React.ReactNode][]
  complexity: string
  complexityTone: 'good' | 'warn' | 'bad' | 'neutral'
  detail: React.ReactNode
  note: { label: string; tone?: 'signal' | 'warn' | 'good'; body: React.ReactNode }
}

const METHODS: Method[] = [
  {
    id: 'backup',
    label: 'Backup / Reimage / Restore',
    name: 'Backup, Reimage, Restore',
    suits: (
      <>
        Best suited if the existing hardware or VM configuration is{' '}
        <strong>not supported</strong> by the newer Cisco ISE version. It is
        also the only method that leaves you with a genuinely clean image.
      </>
    ),
    flow: [
      { label: 'Back up config DB', detail: 'and record the encryption key' },
      { label: 'Install or reimage', detail: 'target release on new or existing HW/VM' },
      { label: 'Restore the backup', detail: 'onto the new Primary PAN' },
      { label: 'Join nodes', detail: 'register each node to the new deployment' },
      { label: 'Install latest patch', detail: 'to the suggested patch level', tone: 'signal' },
    ],
    profile: [
      ['Complexity', 'Medium'],
      ['Appliance access', 'Required'],
      ['Parallel', 'Yes'],
      ['Rollback', 'Not possible — requires reimaging back to the previous version'],
      ['Previous artifacts', 'None. Clean image'],
      ['Time', 'Medium'],
      ['Resources', 'Large number of staff, or additional VM resource'],
      ['Errors', 'Minimal'],
    ],
    complexity: 'Medium',
    complexityTone: 'warn',
    detail: (
      <Code
        title="ISE CLI — the whole method in five commands"
        code={`! On the current Primary PAN, before you touch anything
backup PRE-UPG repository REPO ise-config \\
  encryption-key plain <key>
backup PRE-UPG-OPS repository REPO ise-operational \\
  encryption-key plain <key>
show backup history

! On the freshly installed node, after setup
restore <backup-file> repository REPO \\
  encryption-key plain <key>
show restore status`}
      />
    ),
    note: {
      label: 'The key is the backup',
      tone: 'warn',
      body: (
        <>
          A configuration backup cannot be restored without the encryption key
          you typed when you took it. Record it with the backup, not in your
          head. Restore only onto the <strong>same release</strong> the backup
          came from, or the release Cisco documents as compatible — a
          configuration backup is not an upgrade mechanism by itself.
        </>
      ),
    },
  },

  {
    id: 'gui',
    label: 'GUI upgrade',
    name: 'GUI upgrade',
    suits: (
      <>
        Best suited if the existing hardware or VM configuration{' '}
        <strong>is supported</strong> by the newer Cisco ISE version. This is
        the default answer for most deployments.
      </>
    ),
    flow: [
      { label: 'Single-click upgrade', detail: 'drive the whole deployment from the PAN' },
      { label: 'Choose PSN order', detail: 'customisable ordering' },
      { label: 'PSNs in tandem or groups', detail: 'never the whole estate at once', tone: 'signal' },
      { label: 'Promote PAN & MnT', detail: 'restore the original roles' },
      { label: 'Install latest patch', detail: '', tone: 'signal' },
    ],
    profile: [
      ['Complexity', 'Easy'],
      ['Appliance access', 'Minimal — mainly for the URT'],
      ['Parallel', 'PSNs only'],
      ['Rollback', 'Limited'],
      ['Previous artifacts', 'Maintained — including disk issues inherited from previous defects'],
      ['Time', 'Longer'],
      ['Resources', 'Small number of staff'],
      ['Errors', 'Possible if not following best practice'],
    ],
    complexity: 'Easy',
    complexityTone: 'good',
    detail: (
      <Stack gap={6}>
        <Split
          cols={1}
          parts={[
            {
              title: 'Full upgrade vs split upgrade',
              children: (
                <Bullets
                  items={[
                    <>
                      <strong>Full upgrade</strong> takes the whole deployment
                      through in one workflow. Full and split options first
                      appeared in the GUI in <strong>3.1</strong>
                    </>,
                    <>
                      <strong>Split upgrade</strong>, reworked in{' '}
                      <strong>3.3</strong>, updates the deployment in phases so
                      part of it keeps authenticating throughout — this is the
                      method Cisco walks through for 3.4 P6 → 3.5 P3
                    </>,
                    <>
                      <strong>Upgrade rollback</strong> for the single upgrade
                      flow arrived in <strong>3.4</strong>, along with automatic
                      log-bundle generation during the upgrade
                    </>,
                  ]}
                />
              ),
            },
          ]}
        />
        <Code
          title="Per node, before and after"
          code={`show application status ise
show application version ise
show logging system ade/ADE.log`}
        />
      </Stack>
    ),
    note: {
      label: 'Easy is not the same as safe',
      body: (
        <>
          The GUI method carries the old disk forward, so any latent filesystem
          damage from an earlier defect comes with it. Run the URT first, and if
          a node has a history of disk alarms, reimage that node instead of
          upgrading it.
        </>
      ),
    },
  },

  {
    id: 'cli',
    label: 'CLI upgrade',
    name: 'CLI upgrade',
    suits: (
      <>
        Best suited if there has been an <strong>upgrade failure</strong>, or
        when you need more granularity than the workflow gives you. Cisco marks
        it plainly: <strong>recommended for troubleshooting only</strong>.
      </>
    ),
    flow: [
      { label: 'Manual process', detail: 'no orchestration, you are the orchestrator' },
      { label: 'Node by node', detail: 'upgrade each node individually' },
      { label: 'Copy image — 9 GB', detail: 'to every node, from a repository', tone: 'signal' },
      { label: 'Prepare and execute', detail: 'per node' },
      { label: 'Monitor individually', detail: 'watch each node to completion' },
      { label: 'Install latest patch', detail: '', tone: 'signal' },
    ],
    profile: [
      ['Complexity', 'Complex — a manual process'],
      ['Appliance access', 'Required'],
      ['Parallel', 'Yes, but in a specific order'],
      ['Rollback', 'Yes'],
      ['Previous artifacts', 'Maintained'],
      ['Time', 'Medium, but requires active monitoring per node'],
      ['Resources', 'Small number of staff'],
      ['Errors', 'Possible if not skilled in the CLI'],
    ],
    complexity: 'Complex',
    complexityTone: 'bad',
    detail: (
      <Stack gap={6}>
        <Prose>
          The cost nobody plans for is the image itself:{' '}
          <strong>9 GB per node</strong>, copied to every node from a
          repository. On a large deployment across a WAN, that transfer is the
          long pole — stage it days before the window, not during it.
        </Prose>
        <Code
          title="Repository and node state — verify before you start"
          code={`show repository <repository-name>
show disks
show application version ise
show application status ise

! progress and failures land in the OS log
show logging system ade/ADE.log`}
        />
      </Stack>
    ),
    note: {
      label: 'Cisco says troubleshooting only',
      tone: 'warn',
      body: (
        <>
          Use the CLI when the GUI workflow has already failed and you need to
          drive one node at a time, or when you need the granularity for a
          genuinely awkward deployment. Reaching for it first because it feels
          more controllable is how people end up with a half-upgraded
          deployment and no rollback plan.
        </>
      ),
    },
  },

  {
    id: 'hybrid',
    label: 'Hybrid deregister',
    name: 'Hybrid approach — deregister one node',
    suits: (
      <>
        Deregister just one ISE node, make it standalone and upgrade{' '}
        <em>that</em>. Every other node is then newly built or reimaged and
        registered to it. One real upgrade, many clean installs.
      </>
    ),
    flow: [
      { label: 'Deregister Secondary PAN', detail: 'from the GUI or CLI' },
      { label: 'Reimage all other nodes', detail: 'clean install of the target release' },
      { label: 'Join and sync', detail: 'manually register every node to the PAN', tone: 'signal' },
      { label: 'Promote original Primary PAN', detail: '' },
      { label: 'Reimage the upgraded node', detail: 'the one you deregistered' },
      { label: 'Join it back', detail: 'register it to the deployment' },
      { label: 'Install latest patch', detail: '', tone: 'signal' },
    ],
    profile: [
      ['Complexity', 'Easy'],
      ['Appliance access', 'Required'],
      ['Parallel', 'Only one node is genuinely upgraded'],
      ['Rollback', 'Limited'],
      ['Previous artifacts', 'None. Clean image'],
      ['Time', 'Longer'],
      ['Resources', 'Larger number of staff, plus temporary VM resource'],
      ['Errors', 'Minimal'],
    ],
    complexity: 'Easy',
    complexityTone: 'good',
    detail: (
      <Stack gap={6}>
        <Prose>
          The appeal is that the configuration database is carried across by a
          single upgraded node, while every other node in the estate arrives
          clean. The price is time and hands: each reimaged node has to be
          registered and brought to <strong>In Sync</strong> individually.
        </Prose>
        <Bullets
          items={[
            <>
              Deregistration returns a node to standalone with its own database —
              that is what makes the deregistered Secondary PAN upgradable on
              its own
            </>,
            <>
              Every reimaged node is a fresh registration: DNS forward and
              reverse, certificate trust, and a full configuration DB copy over{' '}
              <M>TCP 12001</M>. See the Node Registration sheet
            </>,
            <>
              Budget temporary VM resource — for a period you are running the
              old deployment and the new one side by side
            </>,
          ]}
        />
      </Stack>
    ),
    note: {
      label: 'Watch the certificates',
      body: (
        <>
          Reimaged nodes come back with new self-signed certificates. Export
          system certificates with private keys and the internal CA certificates
          before you start, or every re-registration stalls on certificate
          validation.
        </>
      ),
    },
  },
]

export default function UpgradeSheet() {
  const [methodId, setMethodId] = useState(METHODS[1].id)
  const method = METHODS.find(m => m.id === methodId) ?? METHODS[0]

  return (
    <Sheet>
      {/* ---------------- the order ---------------- */}
      <Panel
        title="The node upgrade order — and why it is that order"
        kicker="Six steps, no improvising"
        span={8}
        tone="signal"
      >
        <Stack gap={7}>
          <Flow
            steps={[
              { label: '1 · Secondary PAN', detail: 'auto-promoted to Primary of the new deployment' },
              { label: '2 · Secondary MnT', detail: 'auto-promoted to Primary MnT' },
              { label: '3 · PSNs', detail: 'in batches — not all at once', tone: 'signal' },
              { label: '4 · Primary MnT', detail: 'joins as Secondary MnT' },
              { label: '5 · Primary PAN', detail: 'joins as Secondary PAN' },
              { label: '6 · Promote back', detail: 'manual, to restore original roles', tone: 'signal' },
            ]}
          />
          <div className="grid grid-cols-2 gap-3">
            <Prose>
              The order exists because the first node you upgrade{' '}
              <strong>becomes the new deployment</strong>. Upgrading the
              Secondary PAN gives you a working target that is not the node
              still running production, so the old deployment keeps
              authenticating while nodes cross over. The Primary PAN goes last
              because until it moves it is the thing you fall back to.
            </Prose>
            <Bullets
              items={[
                <>
                  PSNs move in <strong>batches</strong> so RADIUS never stops —
                  the estate must always have live PSNs in the NAD server list
                  on both sides
                </>,
                <>
                  Roles invert during the process. The nodes that end up Primary
                  in the new deployment are your <em>secondaries</em>, and step
                  6 is a manual promotion back
                </>,
                <>
                  Disable <strong>automatic PAN failover</strong> first, or a
                  half-migrated deployment will try to fail over mid-upgrade
                </>,
              ]}
            />
          </div>
        </Stack>
      </Panel>

      {/* ---------------- URT ---------------- */}
      <Panel title="Upgrade Readiness Tool & health checks" kicker="Run it days early" span={4}>
        <Stack gap={6}>
          <Prose>
            The URT rehearses the configuration-database upgrade and tells you
            what would have failed. It belongs in the week{' '}
            <em>before</em> the maintenance window, not in it.
          </Prose>
          <Bullets
            items={[
              <>Place the URT bundle on the node locally and run it there</>,
              <>
                Run it <strong>before</strong> the actual upgrade maintenance
                schedule — its findings usually mean work
              </>,
              <>
                While the URT is running, do <strong>not</strong> take backups
                and do <strong>not</strong> make persona changes
              </>,
            ]}
          />
          <Split
            cols={1}
            parts={[
              {
                title: 'Health Checks',
                children: (
                  <Stack gap={5}>
                    <Prose>
                      <M>Administration &gt; System &gt; Health Checks</M> — and
                      it runs automatically before an upgrade, producing{' '}
                      <M>HealthChecksReport.json</M>.
                    </Prose>
                    <Bullets
                      items={[
                        'Disk space, load average, NTP and DNS',
                        'Certificate validity and expiry, trust-store consistency',
                        'Deployment and replication state',
                        'Licence state and CA integrity',
                      ]}
                    />
                  </Stack>
                ),
              },
            ]}
          />
        </Stack>
      </Panel>

      {/* ---------------- THE METHOD EXPLORER ---------------- */}
      <Panel
        title="Upgrade method explorer"
        span={12}
        tone="ink"
        right={
          <span className="normal-case tracking-normal">
            Four ways across — pick by constraint, not by preference
          </span>
        }
      >
        <Stack gap={8}>
          <div className="flex items-center justify-between gap-4">
            <Selector
              options={METHODS.map(m => ({ id: m.id, label: m.label }))}
              value={methodId}
              onChange={setMethodId}
              label="Method"
            />
            <Pill tone={method.complexityTone}>{method.complexity}</Pill>
          </div>

          <Flow steps={method.flow} />

          <div className="border-t border-ink-200 pt-2">
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-4">
                <h4
                  className="text-[12px] font-bold tracking-tight text-ink-950"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  {method.name}
                </h4>
                <div className="mt-1">
                  <Prose>{method.suits}</Prose>
                </div>
                <div className="mt-2">
                  <Note label={method.note.label} tone={method.note.tone}>
                    {method.note.body}
                  </Note>
                </div>
              </div>

              <div className="col-span-3">
                <div
                  className="mb-1 border-b border-ink-300 pb-[2px] text-[9px] font-bold uppercase tracking-[0.11em] text-ink-950"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  Selection matrix
                </div>
                <KV items={method.profile} labelWidth={88} />
              </div>

              <div className="col-span-5">
                <div
                  className="mb-1 border-b border-ink-300 pb-[2px] text-[9px] font-bold uppercase tracking-[0.11em] text-ink-950"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  What it actually asks of you
                </div>
                {method.detail}
              </div>
            </div>
          </div>
        </Stack>
      </Panel>

      {/* ---------------- checklists ---------------- */}
      <Panel title="Pre- and post-upgrade tasks" kicker="From the workbook" span={6} tone="quiet">
        <Split
          parts={[
            {
              title: 'Before — 20 items',
              children: (
                <Bullets
                  items={[
                    'Check hardware / VM configuration compatibility',
                    'Check Microsoft AD server version compatibility',
                    'Compatibility check for other integrations (Catalyst Center and so on)',
                    'Check whether VM licence conversion is required',
                    <>
                      Take a Cisco ISE <strong>configuration backup</strong> —
                      and note the key
                    </>,
                    'Take an operational backup (optional)',
                    'Export all endpoints to CSV',
                    'Back up load balancer configurations',
                    <>
                      Export system certificates <strong>with private keys</strong>
                    </>,
                    'Export the internal CA certificates from the CLI',
                    'Note AD, RSA token and MDM credentials',
                    'Screenshot the profiler configuration of every PSN',
                    'Purge excess operational data',
                    'Purge inactive endpoints and guest accounts',
                    'Run the CLI cleanup from previous upgrades',
                    'Delete expired certificates',
                    <>
                      Disable <strong>automatic PAN failover</strong>
                    </>,
                    'Disable scheduled backups',
                    'Place the URT locally and run it, ahead of the window',
                    'While the URT runs: no backups, no persona changes',
                  ]}
                />
              ),
            },
            {
              title: 'After — 8 items',
              children: (
                <Stack gap={6}>
                  <Bullets
                    items={[
                      'Verify services are running on all nodes',
                      'Clean up previous upgrades',
                      'Test and verify use cases',
                      'Verify virtual machine settings',
                      <>
                        <strong>Re-join Active Directory</strong>
                      </>,
                      'Enable automatic PAN failover',
                      'Enable scheduled backups',
                      'Convert to the new licence types',
                    ]}
                  />
                  <Note label="The one that catches everyone">
                    Re-joining Active Directory. Services come up, the GUI looks
                    healthy, and AD-backed authentications fail because the join
                    did not survive. Check{' '}
                    <M>show application status ise</M> for the AD Connector and
                    read <M>ad_agent.log</M> before you declare the window
                    closed.
                  </Note>
                </Stack>
              ),
            },
          ]}
        />
      </Panel>

      {/* ---------------- backup ---------------- */}
      <Panel title="Backup, restore and repositories" span={3}>
        <Stack gap={6}>
          <Code
            title="ISE CLI"
            code={`backup <name> repository <repo> ise-config \\
  encryption-key plain <key>
backup <name> repository <repo> ise-operational \\
  encryption-key plain <key>
restore <file> repository <repo> \\
  encryption-key plain <key>
show backup history
show restore status
show repository <repository-name>`}
          />
          <KV
            items={[
              [
                'ise-config',
                'The configuration database — policy, nodes, certificates, network devices. Taken on the PAN',
              ],
              [
                'ise-operational',
                'The MnT database — logs, sessions, reports. Large, and optional before an upgrade',
              ],
              [
                'Repositories',
                <>DISK, FTP, SFTP, NFS, CD-ROM, HTTP, HTTPS — minimum 100 GB for all deployment types</>,
              ],
              [
                'GUI',
                <M>Administration &gt; System &gt; Backup &amp; Restore</M>,
              ],
              [
                'Purging',
                <M>Administration &gt; System &gt; Maintenance &gt; Operational Data Purging</M>,
              ],
            ]}
            labelWidth={72}
          />
        </Stack>
      </Panel>

      {/* ---------------- patching ---------------- */}
      <Panel title="Patching" kicker="A version is a train plus a level" span={3} tone="quiet">
        <Stack gap={6}>
          <Prose>
            What you run is not &ldquo;3.5&rdquo; — it is 3.5 Patch 3. Cisco
            names the suggested release as a patch level, security fixes arrive
            as patches, and every one of the four upgrade methods ends with the
            same chevron: <strong>install the latest patch</strong>.
          </Prose>
          <KV
            items={[
              ['Check', <M>show application version ise</M>],
              [
                'Suggested',
                <>3.5 P3, or 3.4 P6 if you are already on 3.4 and need nothing from 3.5</>,
              ],
              [
                'Order',
                'Patch after the whole deployment is on the new release, not part-way through',
              ],
              [
                'Before patching',
                'Take a fresh configuration backup — the pre-upgrade one is now the wrong version',
              ],
            ]}
            labelWidth={74}
          />
          <Note label="Purge before you upgrade, not after">
            Operational data purging and endpoint purging are on the pre-upgrade
            list for a reason: a bloated MnT database makes every step slower,
            and the endpoint purge job only runs once a day at 1:00 a.m.
          </Note>
        </Stack>
      </Panel>
    </Sheet>
  )
}
