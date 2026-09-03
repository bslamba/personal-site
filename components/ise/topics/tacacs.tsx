'use client'

// ============================================================
// Topic — Device Administration with TACACS+
//
// The selector walks the six pieces of a working device-admin
// deployment, in the order you would build them. The ladder
// draws the thing that separates TACACS+ from RADIUS: three
// independent exchanges, not one.
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
  Ladder,
  Selector,
} from '../sheet-kit'

interface Piece {
  id: string
  label: string
  name: string
  where: string
  gist: string
  points: React.ReactNode[]
  facts: [React.ReactNode, React.ReactNode][]
  code: { title: string; code: string }
  note?: { label: string; tone?: 'signal' | 'warn' | 'good'; body: React.ReactNode }
}

const PIECES: Piece[] = [
  {
    id: 'nad',
    label: '1 · Network Device',
    name: 'The network device',
    where: 'Work Centers > Device Administration > Network Resources',
    gist:
      'ISE answers nothing it does not recognise. The device object carries the shared secret, the TACACS+ tick box, and the Network Device Groups your policy conditions will match on.',
    points: [
      <>Tick <strong>TACACS+ Authentication Settings</strong> and set the <strong>Shared Secret</strong></>,
      <><strong>Single Connect Mode</strong> — <em>Legacy Cisco Devices</em> or <em>TACACS+ Draft Compliance Single Connect Support</em>. Multiplexes sessions onto one TCP connection</>,
      <><strong>Enable retirement period</strong>, 1&ndash;99 days — ISE accepts old and new secret concurrently, so a fleet-wide rotation costs no outage</>,
      <>An unknown device gets <M>13017 packet from unknown Network Device or AAA Client</M></>,
    ],
    facts: [
      ['Add at', <M>Device Administration &gt; Network Resources &gt; Network Devices &gt; Add</M>],
      ['Ports', <>Up to four TCP ports, 1&ndash;65535, default <M>49</M></>],
      ['Ports set at', <M>Device Administration &gt; Overview &gt; Deployment</M>],
      [
        'Session key',
        <>Which fields tie requests into one session: NAS-Address, Port, Remote-Address, User</>,
      ],
    ],
    code: {
      title: 'Build order on the ISE side',
      code: `1. Licence   L-ISE-TACACS-ND=   perpetual,
     one per PSN running TACACS+ (2.4 and later)

2. Administration > System > Deployment > <node>
     [x] Enable Device Admin Service

3. Work Centers > Device Administration
     > Overview > Deployment
       - which PSNs run device admin
       - TACACS ports (up to 4, default 49)
       - Session Key Assignment

4. Work Centers > Device Administration
     > Network Resources > Network Devices > Add
       [x] TACACS+ Authentication Settings
           Shared Secret ......... <secret>
           Single Connect Mode ... optional
           Retirement period ..... 1-99 days
       Network Device Groups: Location, Device Type

5. Verify at Operations > TACACS > Live Logs`,
    },
  },

  {
    id: 'policy',
    label: '2 · Policy Set',
    name: 'Device Admin policy sets',
    where: 'Work Centers > Device Administration > Device Admin Policy Sets',
    gist:
      'A separate policy tree from network access, with its own allowed protocols and its own results. The shape is familiar; what a rule returns is not — a shell profile and command sets, never a dACL or a VLAN.',
    points: [
      <><strong>Regular</strong> — authentication and authorization tables with local and global exceptions, same structure as network access</>,
      <><strong>Proxy Sequence</strong> — forwards to a remote TACACS+ proxy server sequence instead of deciding locally</>,
      <>Allowed protocols is <strong>Default Device Admin</strong>: PAP/ASCII, optionally CHAP and MS-CHAPv1. No EAP — there is no supplicant</>,
      <>Default authorization rule is <M>DenyAllCommands</M> plus <strong>Deny All Shell Profile</strong>. Closed until you open it</>,
    ],
    facts: [
      [
        'Differs by',
        <>Protocol, allowed-protocols service, result types, its own Live Logs page, and a separate licence</>,
      ],
      ['Returns', <>A set of command sets, and/or a shell profile</>],
      ['Conditions', <><M>DEVICE:Device Type</M>, <M>DEVICE:Location</M>, an AD group</>],
      ['Live Logs', <M>Operations &gt; TACACS &gt; Live Logs</M>],
    ],
    code: {
      title: 'A device-admin policy set that works',
      code: `Policy Set  "Network Device Administration"
  Condition  DEVICE:Device Type EQUALS
             All Device Types#Switch
  Protocols  Default Device Admin

  Authentication Policy
    "AD"   Any  ->  AD_JoinPoint

  Authorization Policy
    1 "Net-Admins"     AD:ExternalGroups = ..\\Net-Admins
                       Shell Profile: Priv15
                       Command Sets : PermitAllCommands
    2 "Net-Operators"  AD:ExternalGroups = ..\\Net-Ops
                       Shell Profile: Priv15
                       Command Sets : NOC-ReadOnly
    3 "Helpdesk"       AD:ExternalGroups = ..\\Helpdesk
                       Shell Profile: Priv1
                       Command Sets : Helpdesk-Basic
    Default            Deny All Shell Profile
                       DenyAllCommands`,
    },
    note: {
      label: 'Profile and set are independent',
      body: (
        <>
          The shell profile decides the privilege level; the command set decides
          which commands are authorized. A user can hold <M>priv-lvl=15</M> and
          still be refused <M>configure terminal</M> — which is exactly what a
          read-only NOC account should be.
        </>
      ),
    },
  },

  {
    id: 'shell',
    label: '3 · Shell Profile',
    name: 'TACACS profiles and shell profiles',
    where: 'Device Administration > Policy Elements > Results > TACACS Profiles',
    gist:
      'What the session gets when it opens: privilege level, an optional ACL, an auto-command and the timeouts. Two views of one object — Task Attribute View for common tasks, Raw View for the AV pairs actually sent.',
    points: [
      <>Common Task Type <strong>Shell</strong>; WLC, Nexus and Generic exist for other attribute vocabularies</>,
      <><strong>Default Privilege</strong> is where the session lands; <strong>Maximum Privilege</strong> is the ceiling <M>enable</M> can reach</>,
      <>Either value can come from an <strong>identity store attribute</strong> instead of being fixed</>,
      <>Custom attributes are Mandatory or Optional — in Raw View the delimiter is <M>=</M> for mandatory and <M>*</M> for optional</>,
    ],
    facts: [
      ['Default / Max', <>0&ndash;15, or from an identity store attribute</>],
      ['Access Control List', <>ASCII, 1&ndash;251 characters</>],
      ['Auto Command', <>ASCII, 1&ndash;248 characters</>],
      ['Timeout / Idle', <>0&ndash;9999 seconds each</>],
      ['No Escape', <>True / False, or from an identity store attribute</>],
    ],
    code: {
      title: 'Task Attribute View, and the Raw View it produces',
      code: `Common Tasks   (Common Task Type = Shell)
  Default Privilege ...... 15
  Maximum Privilege ...... 15
  Access Control List .... <1-251 chars>
  Auto Command ........... show version
  No Escape .............. False
  Timeout ................ 60     (0-9999 s)
  Idle Time .............. 15     (0-9999 s)

Raw View        "=" mandatory    "*" optional
  priv-lvl=15
  timeout=60
  idletime=15
  autocmd=show version

Other platforms
  shell:roles="network-admin vdc-admin"   # Nexus
  role=Network-Admin                      # WLC / ACI`,
    },
  },

  {
    id: 'cmdset',
    label: '4 · Command Set',
    name: 'TACACS command sets',
    where: 'Device Administration > Policy Elements > Results > TACACS Command Sets',
    gist:
      'Per-command authorization: a Grant, a command and an argument pattern. Arguments are standard Unix regular expressions. This is the capability RADIUS simply does not have.',
    points: [
      <><strong>PERMIT</strong> allows, <strong>DENY</strong> prohibits, <strong>DENY ALWAYS</strong> overrides permits from every other set on the session</>,
      <><strong>Permit any command that is not listed below</strong> flips the set to allow-all — that checkbox is the whole of <M>PermitAllCommands</M></>,
      <>Several sets on one rule are merged; a command must match a PERMIT somewhere and hit no DENY ALWAYS anywhere</>,
      <>No match at all gives <M>13025</M> and <M>% Authorization failed</M> on the device</>,
    ],
    facts: [
      ['Columns', 'Grant · Command · Arguments'],
      ['Built-ins', <><M>DenyAllCommands</M>, <M>PermitAllCommands</M></>],
      ['Arguments', <>Standard Unix regular expressions — <M>.*</M>, not <M>*</M></>],
      ['Config mode', <>Needs <M>aaa authorization config-commands</M> on the device</>],
    ],
    code: {
      title: 'Three command sets, as ISE renders them',
      code: `PermitAllCommands
  [x] Permit any command not listed below

NOC-ReadOnly
  [ ] Permit any command not listed below
  GRANT         COMMAND    ARGUMENTS
  PERMIT        show       .*
  PERMIT        exit
  PERMIT        enable
  PERMIT        terminal   length .*
  DENY ALWAYS   show       running-config

Helpdesk-Basic
  [ ] Permit any command not listed below
  GRANT         COMMAND    ARGUMENTS
  PERMIT        show       interface.*
  PERMIT        show       version
  PERMIT        ping       .*
  PERMIT        traceroute .*
  PERMIT        exit
  DENY ALWAYS   configure  .*`,
    },
    note: {
      label: 'Deny-lists fail silently',
      tone: 'warn',
      body: (
        <>
          Ticking <strong>Permit any command that is not listed below</strong>{' '}
          and denying a handful looks tidy, but every abbreviation, alias and new
          IOS-XE release adds a command your deny list has never heard of. Build
          allow-lists.
        </>
      ),
    },
  },

  {
    id: 'ios',
    label: '5 · IOS-XE',
    name: 'The device-side configuration',
    where: 'IOS-XE / IOS 15.x',
    gist:
      'Authentication, authorization and accounting are configured separately because TACACS+ carries them separately. Every method list ends in local, and the local account exists before AAA is turned on.',
    points: [
      <>Create the local privilege-15 account <strong>before</strong> <M>aaa new-model</M> — an empty local database plus AAA locks you out</>,
      <><M>local</M> last in every list is the fallback when every PSN is unreachable</>,
      <><M>single-connection</M> must match Single Connect Mode on the ISE device object</>,
      <><M>aaa authorization config-commands</M> is what extends command authorization into configuration mode</>,
    ],
    facts: [
      ['Transport', <><M>TCP 49</M> to each PSN running device admin</>],
      ['Source', <><M>ip tacacs source-interface</M> must match the device IP in ISE</>],
      [
        'Over TLS',
        <>
          Cisco documents TACACS over TLS from ISE 3.4, and TACACS+ over TLS 1.3
          with SAN validation from ISE 3.5, for IOS-XE and Nexus
        </>,
      ],
    ],
    code: {
      title: 'IOS-XE — TACACS+ to ISE with fallback to local',
      code: `! Local fallback BEFORE aaa new-model
username localadmin privilege 15 secret <PASSWORD>
aaa new-model
!
tacacs server ISE-PSN-1
 address ipv4 10.1.1.11
 key 0 <SHARED-SECRET>
 timeout 5
 single-connection
!
aaa group server tacacs+ ISE_GROUP
 server name ISE-PSN-1
 server name ISE-PSN-2
 ip tacacs source-interface Loopback0
!
aaa authentication login AAA group ISE_GROUP local
aaa authentication enable default group ISE_GROUP enable
!
aaa authorization exec AAA group ISE_GROUP local
aaa authorization commands 0  AAA group ISE_GROUP local
aaa authorization commands 1  AAA group ISE_GROUP local
aaa authorization commands 15 AAA group ISE_GROUP local
aaa authorization config-commands
!
aaa accounting exec default start-stop group ISE_GROUP
aaa accounting commands 15 default start-stop group ISE_GROUP
aaa accounting system default start-stop group ISE_GROUP
!
line vty 0 15
 login authentication AAA
 authorization exec AAA
 authorization commands 0  AAA
 authorization commands 1  AAA
 authorization commands 15 AAA
 exec-timeout 15 0
 transport input ssh
line con 0
 login authentication default`,
    },
  },

  {
    id: 'verify',
    label: '6 · Verify',
    name: 'Proving it before you log out',
    where: 'Device CLI and Operations > TACACS > Live Logs',
    gist:
      'Every step here is a lockout risk. Test from a second SSH session while the first is still open, and never close the working session until the new one has authenticated, authorized and run a command.',
    points: [
      <><M>test aaa group</M> proves reachability and credentials without touching your session</>,
      <>Live Logs shows Type — Authentication, Authorization, Accounting — as separate rows for one login</>,
      <>The columns to read are <strong>Shell Profile</strong>, <strong>Command Set</strong> and <strong>Failure Reason</strong></>,
      <>Reports: TACACS Authentication, TACACS Accounting, TACACS Command Accounting</>,
    ],
    facts: [
      ['Live Logs', <M>Operations &gt; TACACS &gt; Live Logs</M>],
      ['Reports', <M>Operations &gt; Reports</M>],
      ['Unknown device', <M>13017</M>],
      ['Command refused', <M>13025</M>],
    ],
    code: {
      title: 'On the device',
      code: `show tacacs
show aaa servers
test aaa group ISE_GROUP <user> <password> new-code

debug tacacs
debug aaa authentication
debug aaa authorization

! Expect this sequence in ISE, per login:
!   13013  Authentication START
!   13014  Authentication CONTINUE
!   13015  Authentication Reply
!   13005  Authorization Request
!   13034  Authorization Reply
!   13006  Accounting Request`,
    },
    note: {
      label: 'Lockout drill',
      tone: 'warn',
      body: (
        <>
          Keep <M>local</M> last in every method list, keep a local
          privilege-15 account, leave the console on a local method list, and
          open a second SSH session before you commit.
        </>
      ),
    },
  },
]

export default function TacacsSheet() {
  const [pieceId, setPieceId] = useState(PIECES[0].id)
  const piece = PIECES.find(p => p.id === pieceId) ?? PIECES[0]

  return (
    <Sheet>
      {/* ---------------- comparison ---------------- */}
      <Panel title="TACACS+ against RADIUS" kicker="Two different jobs" span={7} tone="signal">
        <Table
          head={['', 'RADIUS', 'TACACS+']}
          widths={['15%', '42%', '43%']}
          rows={[
            [
              'Transport',
              'UDP',
              'TCP — connection-oriented, acknowledged, immediate detection of a dead server',
            ],
            [
              'Port',
              <>
                <M>UDP 1812</M> auth, <M>1813</M> accounting; legacy <M>1645</M>/
                <M>1646</M>; DTLS <M>UDP 2083</M>; CoA <M>1700</M>/<M>3799</M>
              </>,
              <>
                <M>TCP 49</M>. ISE lets you define up to four TCP ports, range
                1&ndash;65535
              </>,
            ],
            [
              'Encrypted',
              'Only the password in the Access-Request. The rest of the packet is in clear',
              'The entire body of the packet. Only the standard TACACS+ header is in clear',
            ],
            [
              'AAA model',
              'Combines authentication and authorization — the Access-Accept carries the authorization',
              'Separates all three, allowing a separate authentication solution while authorization and accounting stay independent',
            ],
            [
              'Command control',
              'Cannot control which commands a user may execute',
              'Two methods — by privilege level, or by explicitly specifying commands',
            ],
            ['Per-command accounting', 'No', 'Yes'],
            [
              'Multiprotocol',
              'Lacks ARA, NetBIOS Frame Protocol Control, NASI, X.25 PAD',
              'Offers multiprotocol support',
            ],
            [
              'Used for',
              'Network access — 802.1X, MAB, VPN, wireless',
              'Device administration — switch, router, firewall and WLC CLI',
            ],
            [
              'ISE licence',
              'Essentials tier and above',
              <>
                <strong>Device Administration</strong> licence,{' '}
                <M>L-ISE-TACACS-ND=</M> — perpetual, one per PSN
              </>,
            ],
          ]}
        />
      </Panel>

      {/* ---------------- the ladder ---------------- */}
      <Panel title="One login, three exchanges" kicker="Separated AAA, drawn" span={5}>
        <Ladder
          actors={['Admin (SSH)', 'NAD (IOS-XE)', 'ISE Device Admin']}
          steps={[
            { from: 0, to: 1, label: 'SSH to the VTY line', tone: 'muted' },
            { from: 1, to: 2, label: 'Authentication START · service=login', sub: '13013' },
            { from: 2, to: 1, label: 'REPLY GETUSER / GETPASS', sub: '13015' },
            { from: 1, to: 2, label: 'Authentication CONTINUE · credentials', sub: '13014' },
            { from: 2, to: 1, label: 'REPLY PASS', tone: 'signal' },
            { from: 1, to: 2, label: 'Authorization REQUEST · service=shell', sub: '13005' },
            {
              from: 2,
              to: 1,
              label: 'Authorization REPLY · priv-lvl, autocmd, ACL',
              sub: '13034 — the shell profile',
              tone: 'signal',
            },
            { from: 1, to: 0, label: 'EXEC prompt at the granted privilege' },
            { from: 0, to: 1, label: 'Admin types a command', tone: 'muted' },
            { from: 1, to: 2, label: 'Authorization REQUEST · cmd= cmd-arg=', sub: 'once per command' },
            { from: 2, to: 1, label: 'PASS_ADD, or FAIL → % Authorization failed', sub: '13025 on no match' },
            { from: 1, to: 2, label: 'Accounting REQUEST · start / stop / command', sub: '13006', dashed: true },
          ]}
        />
      </Panel>

      {/* ---------------- THE BUILD EXPLORER ---------------- */}
      <Panel
        title="Building a device-admin deployment"
        span={12}
        tone="ink"
        right={
          <span className="normal-case tracking-normal">
            Six pieces, in the order you build them
          </span>
        }
      >
        <Stack gap={7}>
          <div className="flex items-center justify-between gap-4">
            <Selector
              options={PIECES.map(p => ({ id: p.id, label: p.label, hint: p.gist }))}
              value={pieceId}
              onChange={setPieceId}
            />
            <Pill tone="neutral">{piece.where}</Pill>
          </div>

          <div className="border-t border-ink-200 pt-2">
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-4">
                <h4
                  className="text-[12px] font-bold tracking-tight text-ink-950"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  {piece.name}
                </h4>
                <div className="mt-1">
                  <Prose>{piece.gist}</Prose>
                </div>
                <div className="mt-2">
                  <div
                    className="mb-1 border-b border-ink-300 pb-[2px] text-[9px] font-bold uppercase tracking-[0.11em] text-ink-950"
                    style={{ fontFamily: 'var(--font-heading)' }}
                  >
                    What matters here
                  </div>
                  <Bullets items={piece.points} />
                </div>
              </div>

              <div className="col-span-3">
                <div
                  className="mb-1 border-b border-ink-300 pb-[2px] text-[9px] font-bold uppercase tracking-[0.11em] text-ink-950"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  Paths, ranges and codes
                </div>
                <KV items={piece.facts} labelWidth={72} />
                {piece.note && (
                  <div className="mt-2">
                    <Note label={piece.note.label} tone={piece.note.tone}>
                      {piece.note.body}
                    </Note>
                  </div>
                )}
              </div>

              <div className="col-span-5">
                <div
                  className="mb-1 border-b border-ink-300 pb-[2px] text-[9px] font-bold uppercase tracking-[0.11em] text-ink-950"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  Configuration
                </div>
                <Code title={piece.code.title} code={piece.code.code} />
              </div>
            </div>
          </div>
        </Stack>
      </Panel>

      {/* ---------------- enabling ---------------- */}
      <Panel title="Turning device admin on" kicker="Licence · service · ports" span={3}>
        <Stack gap={6}>
          <Prose>
            Device Administration is a <em>service</em> on a Policy Service node,
            not a persona — and it is licensed separately from every
            network-access tier.
          </Prose>
          <Steps
            items={[
              <><M>Administration &gt; System &gt; Deployment &gt; node &gt; Edit</M> — tick <strong>Enable Device Admin Service</strong>.</>,
              <><M>Work Centers &gt; Device Administration &gt; Overview &gt; Deployment</M> — pick the PSNs, set the TACACS ports and the Session Key Assignment.</>,
              <>Add the devices with a TACACS+ shared secret.</>,
            ]}
          />
          <KV
            items={[
              [
                'Licence',
                <>
                  <M>L-ISE-TACACS-ND=</M> — perpetual, one per PSN running
                  TACACS+ (2.4 and later)
                </>,
              ],
              ['Port', <><M>TCP 49</M>, up to four ports, 1&ndash;65535</>],
              [
                'Protocols',
                <>
                  <strong>Default Device Admin</strong> — PAP/ASCII, optionally
                  CHAP and MS-CHAPv1
                </>,
              ],
            ]}
            labelWidth={60}
          />
        </Stack>
      </Panel>

      {/* ---------------- privilege + command sets ---------------- */}
      <Panel title="Privilege levels and grant semantics" span={4} tone="quiet">
        <Stack gap={6}>
          <Table
            head={['Level', 'What it is']}
            widths={['18%', '82%']}
            rows={[
              ['0', <>Only <M>disable</M>, <M>enable</M>, <M>exit</M>, <M>help</M>, <M>logout</M></>],
              ['1', <>User EXEC — the <M>Router&gt;</M> prompt</>],
              ['2–14', <>Assignable on the device with <M>privilege exec level &lt;n&gt; &lt;cmd&gt;</M></>],
              ['15', <>Privileged EXEC — the <M>Router#</M> prompt</>],
            ]}
          />
          <Table
            head={['Grant', 'Behaviour']}
            widths={['26%', '74%']}
            rows={[
              ['PERMIT', 'Allow the specified command'],
              ['DENY', 'Prohibit the specified command'],
              [
                'DENY ALWAYS',
                'Overrides permits from every other command set applied to the session',
              ],
            ]}
          />
          <Note label="Levels drift, command sets do not">
            Privilege levels are configured per device and drift the moment
            someone rebuilds a switch. Use levels to decide where a session
            lands; use command sets to decide what it can do.
          </Note>
        </Stack>
      </Panel>

      {/* ---------------- codes and failures ---------------- */}
      <Panel title="Message codes and the usual failures" span={5}>
        <div className="grid grid-cols-2 gap-3">
          <Table
            head={['Code', 'Message']}
            widths={['26%', '74%']}
            rows={[
              ['13004', 'Reached TACACS+ maximum client limit'],
              ['13005', 'Received TACACS+ Authorization Request'],
              ['13006', 'Received TACACS+ Accounting Request'],
              ['13013', 'Received TACACS+ Authentication START Request'],
              ['13014', 'Received TACACS+ Authentication CONTINUE Request'],
              ['13015', 'Returned TACACS+ Authentication Reply'],
              ['13017', 'Packet from unknown Network Device or AAA Client'],
              ['13025', 'Command failed to match a Permit rule'],
              ['13034', 'Returned TACACS+ Authorization Reply'],
            ]}
          />
          <Stack gap={6}>
            <Bullets
              items={[
                <><M>13017</M> — the device is not in ISE, or its source IP is not the one you configured. Check <M>ip tacacs source-interface</M></>,
                <>Authentication passes but no prompt appears — no authorization rule matched, so the default <strong>Deny All Shell Profile</strong> applied</>,
                <>Login works and every command is refused — a shell profile with no command set, or a set with no PERMIT rows</>,
                <>Works on one switch and not another — the device sits in a different Network Device Group than the condition expects</>,
                <>Nothing in Live Logs at all — shared secret, or TCP 49 blocked between device and PSN</>,
              ]}
            />
            <Note label="Verify the catalogue">
              Spot-check codes against{' '}
              <M>Administration &gt; System &gt; Logging &gt; Message Catalog</M>{' '}
              on your own deployment — that is the authoritative source.
            </Note>
          </Stack>
        </div>
      </Panel>
    </Sheet>
  )
}
