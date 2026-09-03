'use client'

// ============================================================
// Topic — Logging & Troubleshooting
//
// The interactive panel is the log-file explorer: every file
// worth opening, what it holds, when to open it, and the exact
// show logging command that gets you into it.
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
  Steps,
  Pill,
  M,
  Split,
  Flow,
  Selector,
} from '../sheet-kit'

// ------------------------------------------------------------
// Log files
// ------------------------------------------------------------

type Plane = 'Runtime' | 'Admin' | 'Platform'

interface LogFile {
  id: string
  label: string
  file: string
  plane: Plane
  gist: string
  holds: React.ReactNode[]
  when: React.ReactNode
  cmd: string
  grep: React.ReactNode[]
}

const LOGS: LogFile[] = [
  {
    id: 'psc',
    label: 'ise-psc',
    file: 'ise-psc.log',
    plane: 'Admin',
    gist:
      'The application server’s “everything else” log, and the first stop for anything on the admin plane. In most cases the default logging level is already enough — no debug required.',
    holds: [
      <>Licensing, RBAC, admin GUI and application-server faults</>,
      <>Posture, client provisioning, <M>nsf</M>, <M>nsf-session</M>, <M>swiss</M></>,
      <>SAML, sponsor portal, BYOD, certificate provisioning, TrustSec, pxGrid</>,
      <><strong>Policy evaluation</strong>, PAN failover, IP access restriction, endpoint scripts</>,
      <>Node join: DNS queries, certificate validation and replication, sync-status control</>,
    ],
    when: (
      <>
        Admin-plane problems, and the first fourteen steps of a node join — read it
        alongside <M>ADE.log</M> and <M>replication.log</M> for the rest.
      </>
    ),
    cmd: `show logging application ise-psc.log tail
show logging application ise-psc.log | include <keyword>`,
    grep: [
      <>The node FQDN, when a join is stuck</>,
      <>The portal name or the certificate CN</>,
      <>The admin username, for an RBAC refusal</>,
    ],
  },

  {
    id: 'prrt',
    label: 'prrt-server',
    file: 'prrt-server.log',
    plane: 'Runtime',
    gist:
      'The runtime AAA log, and the single most important file for a failing authentication. It holds the full RADIUS and TACACS+ packet handling and the policy decision trace — the same story the Live Logs Steps pane tells, complete.',
    holds: [
      <><M>runtime-AAA</M>, <M>dot1x</M> and <M>mab</M> — the whole conversation</>,
      <><strong>Active Directory</strong> and <strong>LDAP</strong> as the runtime sees them</>,
      <>Profiling, posture, guest and sponsor portal, BYOD, TrustSec</>,
      <>Vulnerability assessment, logs and reports</>,
    ],
    when: (
      <>
        A failed authentication the Live Logs detail does not explain. Beware the
        cost: debug on <M>runtime-aaa</M>, <M>runtime-logging</M> and{' '}
        <M>runtime-config</M> significantly impacts performance and must not run
        for more than <strong>15 minutes</strong>. For one endpoint, use Endpoint
        Debug instead.
      </>
    ),
    cmd: `show logging application prrt-server.log tail
show logging application prrt-server.log | include <Audit Session Id>`,
    grep: [
      <>The <strong>Audit Session Id</strong> — the only thing that ties one session together</>,
      <>The endpoint MAC, in the NAD&rsquo;s own formatting</>,
      <>The NAD IP address</>,
    ],
  },

  {
    id: 'prrtmgmt',
    label: 'prrt-management',
    file: 'prrt-management.log',
    plane: 'Runtime',
    gist:
      'Runtime process management. Its one distinctive job is ODBC identity store problems, which do not surface in prrt-server.log.',
    holds: [
      <>Runtime process start, stop and supervision</>,
      <><strong>ODBC identity store</strong> connection and query failures</>,
    ],
    when: (
      <>
        An ODBC store that authenticates intermittently, or a runtime process that
        keeps restarting.
      </>
    ),
    cmd: `show logging application prrt-management.log tail`,
    grep: [<>The ODBC connection name</>, <>The stored-procedure name</>],
  },

  {
    id: 'ad',
    label: 'ad_agent',
    file: 'ad_agent.log',
    plane: 'Runtime',
    gist:
      'The Active Directory connector. Everything ISE does towards a domain controller that is not itself a policy decision is written here.',
    holds: [
      <>Join and leave against a join point; DC discovery and failover</>,
      <>Kerberos, LDAP and RPC exchanges</>,
      <>Machine account password refresh</>,
      <>Identity resolution and identity rewrite</>,
    ],
    when: (
      <>
        A join that fails, AD authentications that work only sometimes, or any
        &ldquo;Active Directory servers are not available&rdquo;. Pair it with the AD{' '}
        <strong>Diagnostic Tool</strong> on the join point.
      </>
    ),
    cmd: `show logging application ad_agent.log tail
show logging application ad_agent.log | include <DC name>`,
    grep: [<>The domain controller hostname</>, <>The join-point name</>, <>The failing username</>],
  },

  {
    id: 'profiler',
    label: 'profiler',
    file: 'profiler.log',
    plane: 'Runtime',
    gist:
      'Endpoint profiling — every probe, the attribute changes they produce, and the profile matching that follows.',
    holds: [
      <>All probes: DHCP, RADIUS, SNMP, NetFlow, DNS, HTTP, NMAP, AD, pxGrid</>,
      <>Profile matching and the certainty factor arithmetic</>,
      <>Attribute changes and reprofiling events</>,
      <>Guest portal, BYOD and My Devices portal components</>,
    ],
    when: (
      <>
        An endpoint that will not profile, profiles as the wrong thing, or flips
        between profiles. Prove the switch first with{' '}
        <M>show device-sensor cache all</M>.
      </>
    ),
    cmd: `show logging application profiler.log tail
show logging application profiler.log | include <MAC>`,
    grep: [
      <>The endpoint MAC</>,
      <>The profile name you expected</>,
      <>The attribute — <M>dhcp-class-identifier</M>, <M>cdpCachePlatform</M></>,
    ],
  },

  {
    id: 'guest',
    label: 'guest',
    file: 'guest.log',
    plane: 'Admin',
    gist:
      'Guest and sponsor portal flows end to end — the portal render, the login, the account lookup, the device registration.',
    holds: [
      <>Guest portal and sponsor portal sessions</>,
      <>The portal framework, and posture and BYOD hand-offs</>,
      <>MDM and certificate provisioning from inside a portal</>,
    ],
    when: (
      <>
        The redirect works but the portal does not, a guest login fails, or a
        sponsor cannot create an account. If the redirect never happens, the fault
        is on the NAD and this file will be silent.
      </>
    ),
    cmd: `show logging application guest.log tail`,
    grep: [<>The portal name</>, <>The guest username</>, <>The session ID from the redirect URL</>],
  },

  {
    id: 'repl',
    label: 'replication',
    file: 'replication.log',
    plane: 'Platform',
    gist:
      'Deployment replication. Where you look when a secondary reads Out of Sync, and where the tail end of a node join is written.',
    holds: [
      <><M>replication-deployment</M>, <M>JGroup</M> and <M>JMS</M></>,
      <>Problems after the database import, and DMP transfer failures</>,
      <>Sync-status updates and sequence-number requests over JGroups</>,
    ],
    when: (
      <>
        A node stuck at Out of Sync, or a join that passed the certificate exchange
        and then stalled. Capture on <M>TCP 12001</M> at the same time.
      </>
    ),
    cmd: `show logging application replication.log tail`,
    grep: [<>The joining node&rsquo;s FQDN</>, <>&ldquo;Out of Sync&rdquo;</>, <>The SCN in the import</>],
  },

  {
    id: 'ade',
    label: 'ADE',
    file: 'ade/ADE.log',
    plane: 'Platform',
    gist:
      'The ADE-OS log — the appliance operating system underneath ISE. Note the different verb: this is a system log, not an application log.',
    holds: [
      <>Service start and stop at the OS layer</>,
      <>Patching and upgrade</>,
      <>Network, NTP and DNS as the OS sees them</>,
      <>Database import and export during a node join</>,
    ],
    when: (
      <>
        ISE services that will not start, a patch that fails, clock or resolver
        problems, and the middle of a node join. Using{' '}
        <M>show logging application</M> here returns an error that looks like a
        missing file.
      </>
    ),
    cmd: `show logging system ade/ADE.log tail
show logging system                  ! list the system logs`,
    grep: [<>The service name</>, <>The NTP peer address</>, <>The patch or upgrade bundle</>],
  },

  {
    id: 'catalina',
    label: 'catalina.out',
    file: 'appserver/catalina.out',
    plane: 'Admin',
    gist:
      'Raw output from the Tomcat container the GUI and the portals run inside. Java stack traces land here and nowhere else.',
    holds: [
      <><M>org-apache</M>, <M>org-apache-cxf</M>, <M>org-apache-digester</M></>,
      <>Container start-up, deployment failures, uncaught exceptions</>,
    ],
    when: (
      <>
        The Application Server process is up but the GUI throws an error page, or a
        portal returns a 500. Read it after <M>ise-psc.log</M>, not before.
      </>
    ),
    cmd: `show logging application appserver/catalina.out tail`,
    grep: [<>&ldquo;Exception&rdquo; and &ldquo;Caused by&rdquo;</>, <>The servlet or portal path from the URL</>],
  },

  {
    id: 'local',
    label: 'iseLocalStore',
    file: 'localStore/iseLocalStore.log',
    plane: 'Admin',
    gist:
      'The local syslog store — the raw, human-readable stream of every auditable event ISE generates, identical to what a remote syslog target receives. The best file in the system for grepping message codes.',
    holds: [
      <>Every authentication result, including the <M>5200</M> and <M>5400</M> messages</>,
      <><M>70000 NOTICE</M> administrator audit entries</>,
      <>The same messages your SIEM gets, before the SIEM reshapes them</>,
    ],
    when: (
      <>
        Auditing who changed what, and any time you want to count occurrences of a
        message code rather than read one session in depth.
      </>
    ),
    cmd: `show logging application localStore/iseLocalStore.log | include "70000 NOTICE"
show logging application localStore/iseLocalStore.log | include 5400
show logging application localStore/iseLocalStore.log | count`,
    grep: [
      <><M>&quot;70000 NOTICE&quot;</M> — the admin audit trail</>,
      <>A message code, e.g. <M>11036</M></>,
      <>The endpoint MAC or the username</>,
    ],
  },

  {
    id: 'pxgrid',
    label: 'pxgrid-server',
    file: 'pxgrid-server.log',
    plane: 'Admin',
    gist:
      'The whole of pxGrid 2.0 in one file. pxGrid 1.0 spread the same material across five logs — pxgrid-cm, pxgrid-jabberd, pxgrid-pubsub, pxgrid-controller, pxgrid-install — and those went with the version.',
    holds: [
      <>Client account creation, activation and approval state</>,
      <>Service registration, topics and subscriptions</>,
      <>Certificate validation failures on the 8910 handshake</>,
    ],
    when: (
      <>
        A subscriber that connects and receives nothing, an integration whose{' '}
        <strong>Test</strong> fails, or a client stuck at PENDING.
      </>
    ),
    cmd: `show logging application pxgrid-server.log tail
show logging application pxgrid-server.log | include <client name>`,
    grep: [
      <>The client name from the Clients list</>,
      <>The service, e.g. <M>com.cisco.ise.session</M></>,
      <>The certificate CN</>,
    ],
  },

  {
    id: 'mnt',
    label: 'mnt-processor',
    file: 'mnt-processor.log',
    plane: 'Platform',
    gist:
      'The Monitoring node’s log-processing pipeline — ingestion of syslog and ISE-messaging events into the MnT database.',
    holds: [
      <>Collection, parsing and indexing of events arriving from the PSNs</>,
      <>Backpressure and queue behaviour on a busy MnT</>,
    ],
    when: (
      <>
        Live Logs are empty, lagging by minutes, or missing sessions you can see
        succeeding on the switch. That is ingestion, not policy.
      </>
    ),
    cmd: `show logging application mnt-processor.log tail`,
    grep: [<>The PSN hostname whose events are missing</>, <>Queue or backlog warnings</>],
  },

  {
    id: 'sxp',
    label: 'sxp',
    file: 'sxp_appserver/sxp.log',
    plane: 'Runtime',
    gist:
      'The TrustSec SXP engine on the PSN — peer connections and the binding table ISE itself holds.',
    holds: [
      <>The <M>sxp</M> and <M>sgtbinding</M> components</>,
      <>Peer connections on <M>TCP 64999</M>, and the internal <M>TCP 9644</M></>,
      <>Binding learn, refresh and purge events</>,
    ],
    when: (
      <>
        An SXP peer that will not come up, or bindings visible in{' '}
        <M>show cts role-based sgt-map all</M> on the switch but missing from{' '}
        <strong>All SXP Mappings</strong> in ISE.
      </>
    ),
    cmd: `show logging application sxp_appserver/sxp.log tail`,
    grep: [<>The peer IP address</>, <>The IP prefix whose binding is missing</>],
  },

  {
    id: 'restid',
    label: 'rest-id-store',
    file: 'rest-id-store.log',
    plane: 'Runtime',
    gist:
      'The REST identity store — in practice, Microsoft Entra ID. ROPC and Graph API traffic is logged here rather than in prrt-server.log.',
    holds: [
      <>Token requests and refusals against the identity provider</>,
      <>Graph API group and attribute retrieval</>,
    ],
    when: (
      <>
        Entra ID authentications failing while the same user works elsewhere, or
        group memberships not arriving.
      </>
    ),
    cmd: `show logging application rest-id-store.log tail`,
    grep: [<>The username or UPN</>, <>The application (client) ID</>, <>Provider HTTP status codes</>],
  },
]

export default function LogsSheet() {
  const [lid, setLid] = useState(LOGS[0].id)
  const lg = LOGS.find(l => l.id === lid) ?? LOGS[0]

  return (
    <Sheet>
      {/* ---------------- live logs ---------------- */}
      <Panel title="Where to look first" kicker="Operations > RADIUS" span={5}>
        <Stack gap={6}>
          <Prose>
            <M>Operations &gt; RADIUS &gt; Live Logs</M> is the real-time
            authentication feed, <M>Live Sessions</M> is what is currently
            connected, and <M>Operations &gt; TACACS &gt; Live Logs</M> is the
            device-admin equivalent. Everything below starts at one of those three.
          </Prose>

          <Split
            parts={[
              {
                title: 'Live Logs — columns worth filtering on',
                children: (
                  <Bullets
                    items={[
                      'Status, Identity, Endpoint ID, Endpoint Profile',
                      'Authentication and Authorization Policy, Authorization Profiles',
                      'Failure Reason, Auth Method, Authentication Protocol',
                      'Network Device, Device Port, Posture Status, Security Group',
                      'Repeat Count — a large number is half the diagnosis',
                    ]}
                  />
                ),
              },
              {
                title: 'Live Sessions — the CoA actions',
                children: (
                  <Bullets
                    items={[
                      'Session Reauthentication',
                      'Reauthentication with Last / Rerun / Restart',
                      'Session Termination',
                      'Termination with Port Bounce',
                      'Termination with Port Shutdown',
                    ]}
                  />
                ),
              },
            ]}
          />

          <Table
            head={['Detailed report', 'What it gives you']}
            widths={['24%', '76%']}
            rows={[
              ['Overview', 'Event, Username, Endpoint Id, Authentication Policy, Authorization Policy, Authorization Result'],
              [
                'Authentication Details',
                'Timestamps, Policy Server, Failure Reason, Resolution, Root cause, User Type, Endpoint Profile, Authentication Identity Store, Identity Group, Audit Session Id, Method and Protocol, Network Device, NAS IP / Port / Port Type',
              ],
              [
                'Steps',
                'The ordered numeric trace of the exchange. Read this before touching a policy',
              ],
              ['Result', 'The RADIUS attributes actually returned'],
            ]}
          />

          <Note label="Resolution and Root cause">
            Both fields are populated on a failure and both are routinely ignored.
            Read them before enabling a single debug — they frequently name the fix.
          </Note>
        </Stack>
      </Panel>

      {/* ---------------- method ---------------- */}
      <Panel title="Prove it in this order" kicker="NAD · PSN · store · policy" span={3} tone="signal">
        <Stack gap={6}>
          <Flow
            steps={[
              { label: 'NAD', tone: 'signal' },
              { label: 'PSN' },
              { label: 'Store' },
              { label: 'Policy' },
            ]}
          />
          <Steps
            items={[
              <>
                <strong>The NAD.</strong> <M>show access-session</M>,{' '}
                <M>show aaa servers</M>, <M>show radius statistics</M>. Is the
                request leaving at all?
              </>,
              <>
                <strong>The PSN saw it.</strong> Nothing in Live Logs means
                reachability, a missing Network Device or a shared secret — not
                policy.
              </>,
              <>
                <strong>The identity store.</strong> <M>22056</M>, <M>22040</M> and{' '}
                <M>24408</M> are store answers, not policy answers.
              </>,
              <>
                <strong>Then policy.</strong> The Steps pane names the selected
                profile. Authentication passing and authorization denying is a
                different bug from either failing.
              </>,
              <>
                <strong>Escalate deliberately.</strong> Endpoint Debug, then{' '}
                <M>prrt-server.log</M>, then a support bundle. In that order.
              </>,
            ]}
          />
          <Note label="Half of all cases" tone="warn">
            A NAD whose RADIUS source interface is not pinned. ISE sees a packet
            from an address it has no Network Device for and answers <M>11007</M> —
            which reads like an ISE fault and is not one.
          </Note>
        </Stack>
      </Panel>

      {/* ---------------- CLI ---------------- */}
      <Panel title="From the CLI" kicker="show logging · support bundle" span={4}>
        <Stack gap={6}>
          <Code
            title="Reading logs on a node"
            code={`show logging                    ! logging state + standard buffer
show logging | save <file_name>
show logging internal
show logging application         ! lists the application logs
show logging system              ! lists the system logs
show logging application <application-logfile-name>
show logging system <system-logfile-name>

show logging application prrt-server.log tail
show logging system ade/ADE.log tail

! Pipes: include exclude begin count last head
! Ctrl+C stops a tail.`}
          />
          <Code
            title="Support bundle and tech-support"
            code={`Operations > Troubleshoot > Download Logs > <node> > Support Bundle
  [x] full configuration database  [x] debug logs
  [x] local logs                   [x] core files
  [x] monitoring and reporting     [x] system logs
  [x] policy configuration         From date / To date
  Encryption: Public Key (TAC only) | Shared Key (you hold it)

! The Debug Logs tab downloads one file without a whole bundle.

backup-logs <name> repository <repo> public-key
backup-logs <name> repository <repo> encryption-key plain <key>
show tech-support
show tech-support file <filename>`}
          />
        </Stack>
      </Panel>

      {/* ---------------- LOG FILE EXPLORER ---------------- */}
      <Panel
        title="Log file explorer"
        span={12}
        tone="ink"
        right={
          <span className="normal-case tracking-normal">
            What it holds, when to open it, the exact command
          </span>
        }
      >
        <Stack gap={8}>
          <div className="flex items-center justify-between gap-4">
            <Selector
              options={LOGS.map(l => ({ id: l.id, label: l.label, hint: l.gist }))}
              value={lid}
              onChange={setLid}
            />
            <Pill
              tone={lg.plane === 'Runtime' ? 'bad' : lg.plane === 'Admin' ? 'warn' : 'neutral'}
            >
              {lg.plane}
            </Pill>
          </div>

          <div className="border-t border-ink-200 pt-2">
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-4">
                <h4
                  className="text-[12px] font-bold tracking-tight text-ink-950"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  {lg.file}
                </h4>
                <div className="mt-1">
                  <Prose>{lg.gist}</Prose>
                </div>
                <div className="mt-2">
                  <div
                    className="mb-1 border-b border-ink-300 pb-[2px] text-[9px] font-bold uppercase tracking-[0.11em] text-ink-950"
                    style={{ fontFamily: 'var(--font-heading)' }}
                  >
                    What it contains
                  </div>
                  <Bullets items={lg.holds} />
                </div>
              </div>

              <div className="col-span-3">
                <div
                  className="mb-1 border-b border-ink-300 pb-[2px] text-[9px] font-bold uppercase tracking-[0.11em] text-ink-950"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  When to open it
                </div>
                <Prose>{lg.when}</Prose>
              </div>

              <div className="col-span-5">
                <Code title="Read it from the CLI" code={lg.cmd} />
                <div className="mt-2">
                  <div
                    className="mb-1 border-b border-ink-300 pb-[2px] text-[9px] font-bold uppercase tracking-[0.11em] text-ink-950"
                    style={{ fontFamily: 'var(--font-heading)' }}
                  >
                    What to grep for
                  </div>
                  <Bullets items={lg.grep} cols={3} />
                </div>
              </div>
            </div>
          </div>
        </Stack>
      </Panel>

      {/* ---------------- message codes ---------------- */}
      <Panel title="RADIUS failure codes worth knowing" kicker="Read the Steps pane" span={5} tone="quiet">
        <Stack gap={5}>
          <Prose>
            A passing session reads <M>11001</M> → <M>11006</M>, repeatedly →{' '}
            <M>22037</M> → <M>11002</M> → <M>5200</M>. A failure substitutes{' '}
            <M>11003</M> and <M>5400</M>, and the code that matters is whichever
            one sits immediately before them.
          </Prose>
          <Table
            head={['Code', 'Message', 'What it actually is']}
            widths={['9%', '34%', '57%']}
            rows={[
              [
                '11007',
                'Could not locate Network Device or AAA Client',
                'The NAD is undefined in ISE, or ISE sees a different source IP. Pin the RADIUS source interface.',
              ],
              [
                '11036',
                'The Message-Authenticator RADIUS attribute is invalid',
                'Shared secret mismatch, usually noticed during the EAP phase. Also a NAT or load balancer rewriting packets.',
              ],
              [
                '11038',
                'Accounting-Request contains invalid Authenticator field',
                'The same mismatch, seen on accounting instead.',
              ],
              [
                '22056',
                'Subject not found in the applicable identity store(s)',
                'MAB for an unknown MAC, or a username missing from every store in the sequence. Fix the sequence, or set If user not found = CONTINUE.',
              ],
              [
                '22040',
                'Wrong password or invalid shared secret',
                'An internal-user password, or the secret. The Steps pane says which store was queried.',
              ],
              [
                '24408',
                'AD authentication failed — wrong password',
                'A real bad password, a cached credential after a change, or replication lag. Read ad_agent.log.',
              ],
              [
                '15039',
                'Rejected per authorization profile',
                'Authentication succeeded, authorization denied — the matched rule returns DenyAccess. Read the Steps for which rule.',
              ],
              [
                '11514',
                'Unexpectedly received empty TLS message; treating as a rejection by the client',
                'The supplicant walked away mid-TLS. Almost always it does not trust the ISE EAP certificate chain.',
              ],
              [
                '12153',
                'EAP-FAST failed SSL/TLS handshake because the client rejected the ISE local-certificate',
                'The same problem named explicitly. Push the issuing CA out, and check the SAN.',
              ],
              [
                '11018',
                'RADIUS is re-using an existing session',
                'Normal on a re-authentication. Suspicious only when it never stops.',
              ],
            ]}
          />
          <Note label="Codes this sheet deliberately leaves unconfirmed" tone="warn">
            <M>5411</M>, <M>5440</M>, <M>12321</M>, <M>12508</M>, <M>12514</M>,{' '}
            <M>12516</M>, <M>12520</M>, the 244xx family beyond 24408 and the 13xxx
            TACACS+ family circulate widely, but the sources behind this sheet trace
            them to a third-party mirror of the message catalogue — and 5440 only to
            a Cisco bug title. Verify any of them in{' '}
            <M>Administration &gt; System &gt; Logging &gt; Message Catalog</M> on
            your own node before quoting them.
          </Note>
        </Stack>
      </Panel>

      {/* ---------------- debug tools ---------------- */}
      <Panel title="Debug, Endpoint Debug, TCP Dump" span={4}>
        <Stack gap={5}>
          <KV
            items={[
              [
                'Debug levels',
                <>
                  <M>Operations &gt; Troubleshoot &gt; Debug Wizard &gt; Debug Log Configuration</M>{' '}
                  — per node, per component: OFF, FATAL, ERROR, WARN, INFO, DEBUG,
                  TRACE. <strong>Reset to Default</strong> undoes it. On ISE 2.x:{' '}
                  <M>Administration &gt; System &gt; Logging</M>.
                </>,
              ],
              [
                'Debug profiles',
                <><M>Debug Wizard &gt; Debug Profile Configuration</M> applies a coherent bundle at once — the safer way in</>,
              ],
              [
                'Endpoint Debug',
                <>
                  <M>Diagnostic Tools &gt; General Tools &gt; Endpoint Debug</M> —
                  a MAC or IP, and ISE raises debug to maximum{' '}
                  <strong>for that endpoint only</strong>, then hands you the log.
                  The right tool for &ldquo;one user is failing&rdquo;.
                </>,
              ],
              [
                'TCP Dump',
                <>
                  <M>Diagnostic Tools &gt; General Tools &gt; TCP Dump</M> — host,
                  interface, promiscuous mode, a filter such as{' '}
                  <M>ip host 10.1.1.50 and port 1812</M>, human-readable or raw,
                  file size and count, time limit, repository.
                </>,
              ],
            ]}
            labelWidth={76}
          />
          <Split
            cols={1}
            parts={[
              {
                title: 'The rest of the toolbox',
                children: (
                  <Bullets
                    cols={2}
                    items={[
                      'RADIUS Authentication Troubleshooting',
                      'Evaluate Configuration Validator',
                      'Execute Network Device Command',
                      'Session Trace Tests and Test Cases',
                      'Posture and Agentless Posture Troubleshooting',
                      'TrustSec: egress policy, SXP-IP, IP-SGT, device SGT',
                    ]}
                  />
                ),
              },
            ]}
          />
          <Note label="Logging configuration lives elsewhere">
            <M>Administration &gt; System &gt; Logging</M> holds Local Log Settings,
            Remote Logging Targets, Logging Categories, the Message Catalog and
            Collection Filters. Remote syslog: <M>UDP 20514</M>, <M>TCP 1468</M>,
            secure <M>TCP 6514</M>.
          </Note>
        </Stack>
      </Panel>

      {/* ---------------- node health ---------------- */}
      <Panel title="Is the node itself well?" kicker="show application status ise" span={3}>
        <Stack gap={5}>
          <Code
            title="Health and control"
            code={`show application status ise
show application version ise
!
application start ise
application start ise safe   ! locked out of the GUI
application stop ise
application configure ise    ! M&T DB ops, profiler
                             ! stats, CA export/import
!
show ntp
show disks
show memory
show cpu usage
show ports | save <file>
show repository <repo>
!
reload`}
          />
          <Bullets
            items={[
              <><strong>Health Checks</strong> at <M>Administration &gt; System &gt; Health Checks</M> validate disk, NTP, DNS, certificate expiry, trust store, replication state, load and licence, and produce <M>HealthChecksReport.json</M></>,
            ]}
          />
          <Note label="Restart order">
            PSNs one at a time so the NADs fail over, then the secondary PAN/MnT,
            then the primary PAN last. Ten to fifteen minutes on a PAN.
          </Note>
        </Stack>
      </Panel>
    </Sheet>
  )
}
