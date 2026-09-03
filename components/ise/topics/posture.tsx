'use client'

// ============================================================
// Topic — Posture & Compliance
//
// The agent explorer is the interactive heart: pick one of the
// four ways ISE can assess an endpoint and you get what it can
// check, what it cannot, its per-OS capability matrix from the
// workbook, and how it is provisioned.
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
  Flow,
  Ladder,
  Selector,
} from '../sheet-kit'

interface Agent {
  id: string
  label: string
  name: string
  kicker: string
  gist: string
  facts: [React.ReactNode, React.ReactNode][]
  can: React.ReactNode[]
  cannot: React.ReactNode[]
  osHead: string[]
  osRows: React.ReactNode[][]
  provisioning: React.ReactNode
  note: { label: string; tone?: 'signal' | 'warn' | 'good'; body: React.ReactNode }
}

const CAPS = [
  'Anti-malware',
  'Firewall install',
  'App inventory',
  'Hardware inventory',
  'Process',
  'Dictionary',
  'Application',
  'File',
  'Service',
  'Disk encryption',
  'Patch management',
  'Registry',
  'USB',
  'WSUS remediation',
  'Remediation',
  'Reassessment',
] as const

function matrix(cols: string[][]): React.ReactNode[][] {
  return CAPS.map((c, i) => [c, ...cols.map(col => col[i])])
}

const AGENTS: Agent[] = [
  {
    id: 'secureclient',
    label: 'Secure Client',
    name: 'Cisco Secure Client (AnyConnect) ISE Posture module',
    kicker: 'Persistent · full function',
    gist:
      'The full agent, and the only one that can do everything. It takes the requirement policy from the PSN, runs the checks through the compliance module, and reports back. One client for the whole ISE flow rather than a separate NAC agent.',
    facts: [
      ['Persistent', 'Yes — stays installed'],
      ['Interface', 'System Scan window, rescan button, notifications'],
      ['Remediation', 'Automatic and manual, including user-interactive'],
      ['Extras', 'Grace period, PRA and AUP all supported'],
      ['Flows', 'Redirect and redirectless'],
    ],
    can: [
      'Every condition type — file, registry, application, service, dictionary, USB, patch management, disk encryption, firewall, anti-malware, compound',
      'Every remediation — AV/AS/AM update, file, script, launch program, link, patch management, WSUS, Windows Update, message text',
      'Periodic Reassessment, grace period and the AUP screen',
    ],
    cannot: [
      'Nothing structural — but Linux drops firewall, both inventories, application, service, disk encryption and registry outright',
    ],
    osHead: ['Capability', 'Win', 'macOS', 'Linux'],
    osRows: matrix([
      ['Yes', 'Yes', 'Yes', 'Yes', 'Yes', 'Yes', 'Yes', 'Yes', 'Yes', 'Yes', 'Yes', 'Yes', 'Yes', 'Yes', 'Auto', 'Yes'],
      ['Yes', 'Yes', 'Yes', 'Yes', 'Yes', 'Yes', 'Yes', 'Yes', 'Yes', 'Yes', 'Yes', 'n/a', 'No', 'n/a', 'Part', 'Yes'],
      ['Yes', 'No', 'No', 'No', 'Yes', 'Yes', 'No', 'Ltd', 'No', 'No', 'Ltd', 'n/a', 'No', 'n/a', 'Part', 'Yes'],
    ]),
    provisioning: (
      <>
        Client Provisioning. Upload the Secure Client headend package and the
        compliance module webdeploy package at{' '}
        <M>Work Centers &gt; Posture &gt; Client Provisioning &gt; Resources</M>,
        add an <strong>Agent Posture Profile</strong>, bind both into an{' '}
        <strong>Agent Configuration</strong> and return it from a rule in{' '}
        <M>Policy &gt; Client Provisioning</M>. Pre-deployed profiles go to{' '}
        <M>%ProgramData%\Cisco\Cisco Secure Client\ISE Posture</M> on Windows and{' '}
        <M>/opt/cisco/secureclient/iseposture/</M> on macOS.
      </>
    ),
    note: {
      label: 'The profile fields that decide the flow',
      body: (
        <>
          <strong>Enable posture non-redirection flow</strong>,{' '}
          <strong>Call Home List</strong>, <strong>Server name rules</strong> and{' '}
          <strong>Discovery host</strong>. The profile also overrides the global
          remediation timer, network transition delay and login-success timeout.
        </>
      ),
    },
  },

  {
    id: 'stealth',
    label: 'Stealth Mode',
    name: 'Secure Client ISE Posture module in Stealth Mode',
    kicker: 'AnyConnect 4.4+',
    gist:
      'The same agent running as a service with no user interface — Cisco: “runs posture as a service, with no user interface. The agent stays on the client.” For managed corporate assets where the user should never see a compliance dialogue.',
    facts: [
      ['Persistent', 'Yes'],
      ['Interface', 'None. Stealth With Notification is headless but still notifies'],
      ['Remediation', 'Partial automatic — manual remediation is greyed out'],
      ['Extras', 'PRA supported; no AUP, because there is no screen'],
      ['Minimum', 'AnyConnect 4.4 and later'],
    ],
    can: [
      'The full Windows condition set, including patch management, disk encryption, registry and USB',
      'Automatic remediations needing no user input — file, link, WSUS, patch-management activate, message text, AUP policy',
      'Periodic Reassessment',
    ],
    cannot: [
      <>
        <strong>Manual remediation</strong> — disabled in the GUI, because the
        action requires client-side interaction
      </>,
      'Anything that depends on showing the user a screen',
      'On macOS: manual, launch program, file condition, patch management and USB remediation, and PRA',
    ],
    osHead: ['Capability', 'Win', 'macOS'],
    osRows: matrix([
      ['Yes', 'Yes', 'Yes', 'Yes', 'Yes', 'Yes', 'Yes', 'Yes', 'Yes', 'Yes', 'Yes', 'Yes', 'Yes', 'Yes', 'Part auto', 'Yes'],
      ['Yes', 'Yes', 'Yes', 'Yes', 'Yes', 'Yes', 'Yes', 'Yes', 'Yes', 'Yes', 'Yes', 'n/a', 'No', 'n/a', 'Partial', 'Yes'],
    ]),
    provisioning: (
      <>
        Identical to the full agent — it <em>is</em> the full agent. Stealth is a
        field on the Agent Posture Profile at{' '}
        <M>Policy &gt; Policy Elements &gt; Results &gt; Client Provisioning &gt; Resources &gt; Add &gt; Agent Posture Profile</M>.
      </>
    ),
    note: {
      label: 'Write policy for it explicitly',
      body: (
        <>
          The agent reports its mode in its first request, so a requirement
          carries a distinct <strong>Posture Type</strong> of <M>Agent Stealth</M>.
          A requirement built for <M>Agent</M> is simply not evaluated by a
          stealth client.
        </>
      ),
    },
  },

  {
    id: 'temporal',
    label: 'Temporal Agent',
    name: 'Temporal Agent',
    kicker: 'One-shot · self-removing',
    gist:
      'A throwaway executable offered by the Client Provisioning Portal. It checks compliance, reports the status, then removes itself from the client. For contractors, guests and machines you will never be allowed to install software on.',
    facts: [
      ['Persistent', 'No — removes itself after compliance processing'],
      ['Interface', 'Portal-driven: the user downloads and runs it'],
      ['Remediation', 'Message text only. No custom remediation'],
      ['Extras', 'No grace period, no PRA'],
      ['Compliance module', <>Set the requirement to <M>4.x or later</M> — never <M>Any Version</M></>],
    ],
    can: [
      'Anti-malware, firewall, both inventories, process, dictionary, application, file, registry and USB checks on Windows',
      'A single one-shot assessment reported back to ISE',
    ],
    cannot: [
      'Service Condition MAC — System Daemon, and Daemon or User Agent checks',
      <>Patch management <M>Up To Date</M> and <M>Enabled</M> checks</>,
      <>Disk encryption <M>DE — Encryption</M> check</>,
      'Grace period, PRA, and any custom remediation',
      'VLAN-controlled posture on macOS — macOS cannot detect the VLAN change',
    ],
    osHead: ['Capability', 'Win', 'macOS'],
    osRows: matrix([
      ['Yes', 'Yes', 'Yes', 'Yes', 'Yes', 'Yes', 'Yes', 'Yes', 'Yes', 'Ltd', 'Ltd', 'Yes', 'Yes', 'No', 'Text', 'No'],
      ['Yes', 'Yes', 'Yes', 'Yes', 'Yes', 'Yes', 'Yes', 'Yes', 'Ltd', 'Ltd', 'Ltd', 'n/a', 'No', 'No', 'Text', 'No'],
    ]),
    provisioning: (
      <>
        ISE opens the <strong>Client Provisioning Portal</strong>, which instructs
        the user to download and run the agent. Needs a reachable portal — so a
        redirect, or a dACL that permits the portal — and a Client Provisioning
        rule whose result is the temporal agent resource.
      </>
    ),
    note: {
      label: 'It is a snapshot, not a control',
      tone: 'warn',
      body: (
        <>
          No PRA, no grace period, no reassessment. The compliant verdict holds
          for the instant the executable ran and nothing after it. Pair it with a
          short posture lease if you care about drift.
        </>
      ),
    },
  },

  {
    id: 'agentless',
    label: 'Agentless',
    name: 'Agentless posture (ISE 3.0+)',
    kicker: 'ISE reaches in',
    gist:
      'The direction is reversed: ISE connects to the endpoint as an administrative user, runs a script and removes itself. Nothing to deploy and nothing for the user to do — at the price of admin credentials held in ISE and an inbound port open on every client.',
    facts: [
      ['Transport', <>PowerShell <M>TCP 5985</M> (Windows) · SSH <M>TCP 22</M> (macOS)</>],
      ['Client needs', 'Reachable by IPv4/IPv6 · PowerShell 7.1+ · cURL 7.34+'],
      ['Credentials', 'Built-in Administrator or a local Administrators member; an admin account on macOS'],
      ['Supported OS', 'Windows 10, 11 · macOS 10.13, 10.14, 10.15, 13.x, 14'],
      ['Client logs', 'Kept 24 hours, pulled with Download Client Logs'],
    ],
    can: [
      'Anti-malware, firewall, inventory, process, dictionary and application checks with nothing installed',
      'Assessing endpoints that will never accept an agent, provided you own the admin credentials',
    ],
    cannot: [
      <><strong>Remediation</strong> of any kind</>,
      <><strong>Grace period</strong> and <strong>Periodic Reassessment</strong></>,
      <><strong>Acceptable Use Policy</strong></>,
      <>
        Local accounts are blocked by Windows UAC until{' '}
        <M>LocalAccountTokenFilterPolicy</M> is set to 1 under{' '}
        <M>HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System</M>
      </>,
    ],
    osHead: ['Capability', 'Win', 'macOS'],
    osRows: matrix([
      ['Yes', 'Yes', 'Yes', 'Yes', 'Yes', 'Yes', 'Yes', 'Ltd', 'Yes', 'Ltd', 'Ltd', 'Ltd', 'Yes', 'No', 'No', 'No'],
      ['Yes', 'Yes', 'Yes', 'Yes', 'Yes', 'Yes', 'Yes', 'Yes', 'Ltd', 'Ltd', 'Ltd', 'n/a', 'No', 'No', 'No', 'No'],
    ]),
    provisioning: (
      <>
        Nothing is provisioned. Tick <strong>Agentless Posture</strong> on the
        authorization profile, store the login at{' '}
        <M>Administration &gt; Settings &gt; Endpoint Scripts &gt; Endpoint Login Configuration</M>{' '}
        and set retries under <M>… &gt; Endpoint Scripts &gt; Settings</M>. The{' '}
        <strong>Remove Agentless Plugin</strong> toggle in Posture General
        Settings decides whether the plugin persists after the run.
      </>
    ),
    note: {
      label: 'Read this before choosing it',
      tone: 'warn',
      body: (
        <>
          Agentless cannot remediate. It tells you an endpoint is non-compliant
          and leaves the user no route back except a help desk call. It is an
          assessment tool, not an enforcement path.
        </>
      ),
    },
  },
]

export default function PostureSheet() {
  const [agentId, setAgentId] = useState(AGENTS[0].id)
  const agent = AGENTS.find(a => a.id === agentId) ?? AGENTS[0]

  return (
    <Sheet>
      {/* ---------------- what posture is ---------------- */}
      <Panel title="What posture actually is" kicker="Premier licence" span={3}>
        <Stack gap={7}>
          <Prose>
            Posture checks the <em>compliance state</em> of an endpoint and feeds
            the answer into authorization as <M>Session:PostureStatus</M>. ISE
            never performs a check itself — an agent does, against a policy ISE
            hands it.
          </Prose>

          <Table
            head={['State', 'What it means, and what authorization owes it']}
            widths={['30%', '70%']}
            rows={[
              ['Unknown', 'No result yet, or the lease expired. Must be granted enough access to discover, provision and remediate.'],
              ['Compliant', 'Every mandatory requirement passed. Grant the real access — dACL or SGT, no redirect.'],
              ['NonCompliant', 'A mandatory requirement failed and was not remediated. Quarantine, plus reach to the remediation servers.'],
            ]}
          />

          <KV
            items={[
              ['Policy', <M>Work Centers &gt; Posture &gt; Posture Policy</M>],
              ['Settings', <M>Administration &gt; System &gt; Settings &gt; Posture</M>],
              [
                'First step',
                <>
                  <strong>Posture Updates</strong>, web or offline{' '}
                  <M>posture-offline.zip</M> — about 20 minutes, and only the
                  first run creates the default policies
                </>,
              ],
            ]}
            labelWidth={54}
          />

          <Note label="Set this deliberately" tone="warn">
            <strong>Default Posture Status</strong> in General Settings applies to
            non-agent devices such as Android and iOS. Left at{' '}
            <strong>Compliant</strong>, every phone is treated as compliant
            without ever being checked.
          </Note>
        </Stack>
      </Panel>

      {/* ---------------- the flow ---------------- */}
      <Panel title="The posture life cycle" kicker="Steps 0 – 6" span={5} tone="signal">
        <Stack gap={7}>
          <Flow
            steps={[
              { label: '0 Install' },
              { label: '1 Auth' },
              { label: '2 Provision' },
              { label: '3 Assess' },
              { label: '4 Remediate', tone: 'signal' },
              { label: '5 CoA', tone: 'signal' },
              { label: '6 Final' },
            ]}
          />

          <Ladder
            actors={['Endpoint + agent', 'Switch / WLC', 'PSN', 'MnT']}
            steps={[
              { from: 0, to: 1, label: '802.1X or MAB', tone: 'muted' },
              { from: 1, to: 2, label: 'Access-Request · UDP 1812' },
              {
                from: 2,
                to: 1,
                label: 'Accept · limited dACL + url-redirect',
                sub: 'PostureStatus = Unknown',
                tone: 'signal',
              },
              {
                from: 0,
                to: 1,
                label: 'HTTP GET /auth/discovery',
                sub: '302 back to the owning PSN',
              },
              {
                from: 0,
                to: 2,
                label: 'Client Provisioning Portal — TCP 8443',
                sub: 'agent, compliance module, signed profile',
              },
              {
                from: 2,
                to: 3,
                label: 'Session owner lookup',
                sub: 'redirectless only',
                tone: 'muted',
                dashed: true,
              },
              { from: 2, to: 0, label: 'Requirements for this OS and group — TCP 8905' },
              { from: 0, to: 2, label: 'Scan + remediation report' },
              { from: 2, to: 1, label: 'CoA-Reauth · UDP 1700 / 3799', tone: 'signal' },
              { from: 1, to: 2, label: 'Accept — PostureStatus Compliant' },
            ]}
          />
        </Stack>
      </Panel>

      {/* ---------------- policy model ---------------- */}
      <Panel title="Conditions, remediations, requirements" kicker="The policy model" span={4}>
        <Stack gap={6}>
          <Split
            cols={2}
            parts={[
              {
                title: 'Condition types',
                children: (
                  <Bullets
                    items={[
                      <><strong>File</strong>, <strong>Registry</strong>, <strong>Service</strong>, <strong>Dictionary</strong></>,
                      <><strong>Application</strong> — reverse logic: <em>not</em> installed is compliant</>,
                      <><strong>USB</strong> — mass storage present. Windows only</>,
                      <><strong>Patch Management</strong>, <strong>Disk Encryption</strong>, <strong>Firewall</strong>, <strong>Anti-Malware</strong>, <strong>Hardware Attributes</strong></>,
                      <><strong>Compound</strong> — AND/OR, and it short-circuits: if A passes, B is skipped</>,
                    ]}
                  />
                ),
              },
              {
                title: 'Remediation actions',
                children: (
                  <Bullets
                    items={[
                      'AV / AS / anti-malware update',
                      'File · Script · Launch Program · Link',
                      'Patch Management · WSUS · Windows Update',
                      'Message Text Only — informational',
                      <><strong>Script</strong> is the only one reaching Windows, macOS <em>and</em> Linux; USB, Patch Management, Launch Program and WSUS are Windows-only</>,
                    ]}
                  />
                ),
              },
            ]}
          />

          <Table
            head={['Marked as', 'Behaviour in the posture policy rule']}
            widths={['26%', '74%']}
            rows={[
              ['Mandatory', 'Named to the user, remediation window offered. Failure ⇒ NonCompliant'],
              ['Optional', 'Reported and remediation offered, but skippable. Failure does not change status'],
              ['Audit', 'Checked silently. Nothing shown, no remediation, no effect on status'],
            ]}
          />

          <Note label="The compliance-module trap">
            The <strong>Compliance Module</strong> field on a requirement gates the
            condition picker. <M>4.x or Later</M> unlocks antimalware, disk
            encryption, patch management and USB; <M>3.x or Earlier</M> gives
            antivirus, antispyware, disk encryption and patch management;{' '}
            <M>Any Version</M> silently reduces you to file, service, registry,
            application and compound. Roll out as <strong>Audit</strong>, then
            Optional, then Mandatory.
          </Note>
        </Stack>
      </Panel>

      {/* ---------------- THE AGENT EXPLORER ---------------- */}
      <Panel
        title="Agent explorer"
        span={12}
        tone="ink"
        right={
          <span className="normal-case tracking-normal">
            Four ways to assess an endpoint — matrices from the workbook
          </span>
        }
      >
        <Stack gap={8}>
          <div className="flex items-center justify-between gap-4">
            <Selector
              options={AGENTS.map(a => ({ id: a.id, label: a.label, hint: a.gist }))}
              value={agentId}
              onChange={setAgentId}
            />
            <Pill tone={agent.id === 'agentless' ? 'warn' : 'neutral'}>
              {agent.kicker}
            </Pill>
          </div>

          <div className="border-t border-ink-200 pt-2">
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-3">
                <h4
                  className="text-[12px] font-bold leading-[1.2] tracking-tight text-ink-950"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  {agent.name}
                </h4>
                <div className="mt-1">
                  <Prose>{agent.gist}</Prose>
                </div>
                <div className="mt-2">
                  <KV items={agent.facts} labelWidth={78} />
                </div>
              </div>

              <div className="col-span-3">
                <div
                  className="mb-1 border-b border-ink-300 pb-[2px] text-[9px] font-bold uppercase tracking-[0.11em] text-ink-950"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  What it can run
                </div>
                <Bullets items={agent.can} />
                <div className="mt-2">
                  <div
                    className="mb-1 border-b border-ink-300 pb-[2px] text-[9px] font-bold uppercase tracking-[0.11em] text-ink-950"
                    style={{ fontFamily: 'var(--font-heading)' }}
                  >
                    What it cannot
                  </div>
                  <Bullets items={agent.cannot} />
                </div>
              </div>

              <div className="col-span-3">
                <div
                  className="mb-1 border-b border-ink-300 pb-[2px] text-[9px] font-bold uppercase tracking-[0.11em] text-ink-950"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  Per-OS support
                </div>
                <Table
                  head={agent.osHead}
                  rows={agent.osRows}
                  align={
                    agent.osHead.length === 4
                      ? ['left', 'center', 'center', 'center']
                      : ['left', 'center', 'center']
                  }
                  widths={
                    agent.osHead.length === 4
                      ? ['46%', '18%', '18%', '18%']
                      : ['54%', '23%', '23%']
                  }
                />
              </div>

              <div className="col-span-3">
                <div
                  className="mb-1 border-b border-ink-300 pb-[2px] text-[9px] font-bold uppercase tracking-[0.11em] text-ink-950"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  How it is provisioned
                </div>
                <Prose>{agent.provisioning}</Prose>
                <div className="mt-2">
                  <Note label={agent.note.label} tone={agent.note.tone}>
                    {agent.note.body}
                  </Note>
                </div>
              </div>
            </div>
          </div>
        </Stack>
      </Panel>

      {/* ---------------- discovery ---------------- */}
      <Panel title="Redirect vs redirectless discovery" kicker="ISE 2.2 added the second" span={4}>
        <Stack gap={6}>
          <Table
            head={['', 'Redirect', 'Redirectless']}
            widths={['54%', '23%', '23%']}
            align={['left', 'center', 'center']}
            rows={[
              ['Works where URL-Redirect is unsupported', 'No', 'Yes'],
              ['Avoids the URL-Redirect experience', 'No', 'Yes'],
              ['Agent download from ISE', 'Yes', 'No'],
              ['Agent and agent-profile update', 'Yes', 'Yes'],
              ['Stage 1 discovery', 'Yes', 'No'],
              ['Stage 2 discovery', 'No', 'Yes'],
            ]}
          />

          <Split
            cols={2}
            parts={[
              {
                title: 'Stage 1 — all four at once',
                children: (
                  <Steps
                    items={[
                      <><M>/auth/discovery</M> to the default gateway</>,
                      <><M>/auth/discovery</M> to <M>enroll.cisco.com</M></>,
                      <><M>/auth/discovery</M> to the discovery host</>,
                      <>First PSN in <M>ConnectionData.xml</M> over <M>8443</M></>,
                    ]}
                  />
                ),
              },
              {
                title: 'Stage 2 — sequential',
                children: (
                  <Steps
                    items={[
                      <><strong>Call Home List</strong> — <M>FQDN:8443</M></>,
                      <><M>ConnectionData.xml</M> PSN list — <M>FQDN:8443</M></>,
                      <>Each probe triggers a session lookup; if not local, the PSN asks <strong>MnT</strong> by MAC</>,
                    ]}
                  />
                ),
              },
            ]}
          />

          <KV
            items={[
              ['Discovery', <><M>TCP 8905</M> client side · <M>8443</M> and <M>8905</M> PSN side</>],
              ['Assessment', <><M>TCP 8905</M> · bidirectional <M>8000–8999</M>, default <M>8449</M></>],
            ]}
            labelWidth={66}
          />

          <Note label="Redirectless prerequisites">
            The NAD needs only RADIUS auth, authz and accounting — but the Call
            Home List must match its RADIUS server list, every Call Home FQDN and
            IP must be in the CN or SAN of the Client Provisioning Portal
            certificate, DNS must resolve the portal FQDN to those PSNs, and{' '}
            <strong>Enable RADIUS Session Directory</strong> must be ticked under{' '}
            <M>Administration &gt; System &gt; Settings &gt; Light Data Distribution</M>.
          </Note>
        </Stack>
      </Panel>

      {/* ---------------- network config ---------------- */}
      <Panel title="Network device configuration" kicker="IOS-XE · redirect flow" span={5}>
        <Stack gap={6}>
          <Code
            title="Redirect ACL — permit means REDIRECT, deny means EXEMPT"
            code={`ip http server
ip http secure-server
!
ip access-list extended ACL-POSTURE-REDIRECT
 deny   udp any any eq domain        ! never redirect DNS
 deny   ip  any host 10.1.1.10       ! never redirect ISE
 deny   ip  any host 10.1.1.11
 deny   tcp any any eq 8443          ! provisioning portal
 deny   tcp any any eq 8905          ! posture
 permit tcp any any eq www
 permit tcp any any eq 443
!
aaa server radius dynamic-author
 client 10.1.1.10 server-key <shared-secret>
 auth-type any
!
interface range GigabitEthernet1/0/1-48
 device-tracking attach-policy IPDT-POLICY
 authentication periodic
 authentication timer reauthenticate server
 access-session port-control auto
 mab
 dot1x pae authenticator`}
          />

          <Code
            title="dACL for the Unknown / NonCompliant state — built in ISE"
            code={`permit udp any any eq domain
permit udp any any eq bootps
permit icmp any any
permit tcp any host 10.1.1.10 eq 8443
permit tcp any host 10.1.1.10 eq 8905
permit udp any host 10.1.1.10 eq 8905
deny   ip any any`}
          />

          <Note label="Two mistakes, over and over" tone="warn">
            <strong>Inverted logic</strong> — <M>permit</M> traffic to the PSN in
            the redirect ACL and the agent&rsquo;s own attempt to reach the PSN is
            redirected, so discovery loops forever.{' '}
            <strong>Name mismatch</strong> — ISE sends only the ACL <em>name</em>;
            the ACL must already exist on the NAD, spelled identically. On a
            Catalyst 9800 the policy profile also needs both <M>aaa-override</M>{' '}
            and <M>nac</M>.
          </Note>
        </Stack>
      </Panel>

      {/* ---------------- timers and troubleshooting ---------------- */}
      <Panel title="Lease, PRA, grace — and how to debug" span={3} tone="quiet">
        <Stack gap={6}>
          <Table
            head={['Setting', 'Value or rule']}
            widths={['42%', '58%']}
            rows={[
              ['Posture lease', 'Every connection, or every n days — 1 to 365'],
              ['Cached status', '1–30 days / 1–720 h / 1–43200 min'],
              ['Remediation timer', 'Default 4 min, range 1–300'],
              ['Network transition', 'Default 3 s, range 2–30'],
              ['Continuous monitoring', 'Default 15 min (3.2+); no less than 1 min per 3,000 endpoints'],
              ['PRA', 'Compliant endpoints only · one config per identity group · not during PSN failover · not for Temporal or Agentless'],
              ['Grace period', 'Continued access after going non-compliant. Not for Temporal or Agentless'],
              ['AUP', 'Windows agent users only, unique identity group per config, not used in guest flows'],
            ]}
          />

          <Note label="The lease does not kick anyone" tone="warn">
            When a posture lease expires ISE does <strong>not</strong> trigger a
            re-authentication or a reassessment — which is why{' '}
            <M>authentication periodic</M> is in the interface block.
          </Note>

          <Code
            title="Order of attack"
            code={`! checklist: redirect ACL - dACL - upstream L3
!   HTTP service - host IPS/AV - browser test
!
! DART > Cisco AnyConnect ISE Posture Module
!   AnyConnect_ISEPosture.txt  discovery events
!   aciseposture.log           the posture checks
!   ConnectionData.xml         PSNs seen before
!   ISEPostureCFG.xml          the profile ISE sent
!   run DART as Administrator, Clear All Logs,
!   reproduce, then collect
!
! on ISE
show logging application guest.log tail
show application status ise
! debug: client-webapp, Light-Session-Directory,
!        epm-pip, nsf-session, runtime-aaa`}
          />
        </Stack>
      </Panel>
    </Sheet>
  )
}
