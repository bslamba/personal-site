'use client'

// ============================================================
// Topic — Policy Sets, Conditions & Authorization
//
// The interactive panel is the authorization result explorer:
// pick a result type and you get the ISE-side configuration,
// the RADIUS attributes it actually sends, what the NAD must
// already have in place, and how it fails when it is wrong.
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
  Flow,
  Pill,
  M,
  Split,
  Selector,
} from '../sheet-kit'

interface Result {
  id: string
  label: string
  name: string
  scope: 'wired' | 'wireless' | 'both'
  gist: string
  sends: React.ReactNode[]
  configure: [React.ReactNode, React.ReactNode][]
  nad?: { title: string; code: string }
  fail: { label: string; tone?: 'signal' | 'warn' | 'good'; body: React.ReactNode }
}

const PROFILE_PATH = (
  <M>Policy &gt; Policy Elements &gt; Results &gt; Authorization &gt; Authorization Profiles</M>
)

const RESULTS: Result[] = [
  {
    id: 'vlan',
    label: 'VLAN',
    name: 'VLAN assignment',
    scope: 'both',
    gist:
      'Three RADIUS tunnel attributes, sent together. The switch moves the authenticated session into the named VLAN; the endpoint is not told, which is the root of every VLAN-assignment problem.',
    sends: [
      <><M>Tunnel-Type</M> = <M>VLAN (13)</M></>,
      <><M>Tunnel-Medium-Type</M> = <M>802 (6)</M></>,
      <><M>Tunnel-Private-Group-ID</M> = the VLAN name or ID</>,
      <>The <strong>Tag ID</strong> field on the profile defaults to <M>1</M></>,
    ],
    configure: [
      ['Path', <>{PROFILE_PATH} &gt; Common Tasks &gt; <strong>VLAN</strong></>],
      ['Field', <>Choose <strong>ID/Name</strong> and type the VLAN <em>name</em> or number. A name is safer across a mixed access layer</>],
      ['Verify', <>Read the <strong>Attributes Details</strong> pane at the foot of the profile before saving</>],
    ],
    nad: {
      title: 'IOS-XE — what makes a returned VLAN take effect',
      code: `aaa authorization network default group AAA-GROUP-ISE
!
vlan 20
 name CORP-DATA
!
interface GigabitEthernet1/0/1
 switchport mode access
 switchport access vlan 100
 authentication host-mode multi-auth
 authentication port-control auto
 mab
 dot1x pae authenticator
!
! prove it landed
! show authentication sessions interface Gi1/0/1 details`,
    },
    fail: {
      label: 'The two that bite',
      body: (
        <>
          Without <M>aaa authorization network</M> the switch ignores every
          returned attribute and the session sits in the configured access
          VLAN — ISE still shows a green Access-Accept. And the endpoint keeps
          its old IP: it never sees the VLAN change, so it needs a Port Bounce
          CoA or a DHCP renew. On a <M>multi-auth</M> port only{' '}
          <strong>one</strong> VLAN can apply to every data device on the port,
          so per-user VLANs and multi-auth do not mix — use a dACL or an SGT
          instead.
        </>
      ),
    },
  },

  {
    id: 'dacl',
    label: 'dACL',
    name: 'Downloadable ACL',
    scope: 'wired',
    gist:
      'ISE sends the name and a hash; the switch downloads the ACE list over RADIUS and applies it to that session only. The per-session enforcement primitive on wired, and the reason multi-auth works at all.',
    sends: [
      <><M>cisco-av-pair = ACS:CiscoSecure-Defined-ACL=&lt;name&gt;</M></>,
      <>The switch then issues a second Access-Request to fetch the ACEs by name and hash</>,
      <>Applied to the <strong>session</strong>, not the port — every MAC on a multi-auth port can hold a different dACL</>,
    ],
    configure: [
      ['Write it at', <M>Policy &gt; Policy Elements &gt; Results &gt; Authorization &gt; Downloadable ACLs</M>],
      ['Shipped', <><M>PERMIT_ALL_IPV4_TRAFFIC</M>, <M>DENY_ALL_IPV4_TRAFFIC</M>, and the IPv6 pair</>],
      ['Name rules', <>Alphanumeric, hyphen, dot and underscore only</>],
      ['ACE rule', <>The keyword <M>any</M> must be the source in every ACE — the switch substitutes the endpoint IP</>],
      ['IP version', <><strong>IPv4</strong> / <strong>IPv6</strong> validate syntax; <strong>Agnostic</strong> does not validate at all</>],
      ['Reference it', <>{PROFILE_PATH} &gt; Common Tasks &gt; <strong>DACL Name</strong></>],
    ],
    nad: {
      title: 'The dACL, and the IPDT the switch needs to apply it',
      code: `! --- the dACL, written in ISE ---
permit udp any any eq domain
permit udp any any eq bootps
permit tcp any host 10.1.1.10 eq 8443
permit udp any host 10.1.1.10 eq 8905
permit tcp any host 10.1.1.10 eq 8905
deny   ip any any

! --- on the switch: no device tracking, no dACL ---
device-tracking policy IPDT_POLICY
 no protocol udp
 tracking enable
!
ip device tracking probe auto-source
ip device tracking probe delay 10
ip device tracking probe interval 30
!
access-session acl default passthrough`,
    },
    fail: {
      label: 'Wired only, and the static ACL still wins',
      tone: 'warn',
      body: (
        <>
          AireOS WLCs do not support dACLs at all — use{' '}
          <strong>Airespace ACL Name</strong> there. On a switch running
          Low-Impact mode the static port ACL (<M>ip access-group PRE-AUTH in</M>)
          is still in force and the dACL is prepended to it, so anything the
          port ACL denies stays denied. That is also why a critical-VLAN
          authorisation during an ISE outage still gets nowhere: the PRE-AUTH
          ACL is untouched. Once a dACL is referenced by a policy you can
          neither change its IP type nor delete it.
        </>
      ),
    },
  },

  {
    id: 'airespace',
    label: 'Airespace ACL',
    name: 'Airespace ACL name (wireless)',
    scope: 'wireless',
    gist:
      'The wireless answer to a dACL, and a much weaker one: ISE sends only the name of an ACL that must already exist on the controller. Nothing is downloaded, so the ACL is maintained per WLC.',
    sends: [
      <><M>Airespace-ACL-Name</M> = the ACL name configured on the WLC</>,
      <><M>Airespace-IPv6-ACL-Name</M> for the IPv6 equivalent</>,
      <>Related AireOS VSAs live in the same dictionary — <M>Airespace-Interface-Name</M>, <M>Airespace-QOS-Level</M></>,
    ],
    configure: [
      ['Path', <>{PROFILE_PATH} &gt; Common Tasks &gt; <strong>Airespace ACL Name</strong></>],
      ['Prerequisite', <>An ACL of exactly that name already built on <strong>every</strong> controller that may serve the client</>],
      ['Redirect pairing', <>For CWA the redirect ACL is named separately in the Web Redirection task</>],
    ],
    fail: {
      label: 'Name drift',
      body: (
        <>
          The name is a string. Misspell it, or add a WLC that has not been
          built with that ACL, and the Access-Accept succeeds while the client
          gets whatever the WLAN&rsquo;s default policy allows — usually
          everything. There is no negative acknowledgement to ISE. Audit ACL
          names across controllers whenever you add one.
        </>
      ),
    },
  },

  {
    id: 'sgt',
    label: 'Security Group',
    name: 'Security Group Tag (TrustSec)',
    scope: 'both',
    gist:
      'Instead of an ACL, the Access-Accept carries a tag. Enforcement happens later and elsewhere — at the egress device, the firewall or the DC switch — which is what makes SGTs scale where dACLs do not.',
    sends: [
      <><M>cisco-av-pair = cts:security-group-tag=&lt;hex&gt;</M></>,
      <>The NAD binds the tag to the session, and to the endpoint IP once device tracking learns it</>,
      <>The tag is then propagated inline or over <strong>SXP</strong> to the enforcement point</>,
    ],
    configure: [
      ['Path', <>{PROFILE_PATH} &gt; <strong>Security Group</strong> field on the profile itself</>],
      ['Also settable', <>Directly in the authorization rule&rsquo;s <strong>Security Groups</strong> column, without an authorization profile</>],
      ['Matrix', <>The egress policy matrix is what actually permits or denies — the tag alone enforces nothing</>],
    ],
    nad: {
      title: 'IOS-XE — the NAD side of an SGT assignment',
      code: `aaa authorization network cts-mlist group ISE-TRUSTSEC
!
cts authorization list cts-mlist
cts role-based enforcement
cts role-based enforcement vlan-list 10-20,100
cts role-based counters enable
cts sgt 2
!
! privileged EXEC, not config mode - triggers PAC provisioning
! Switch# cts credentials id SW-ACCESS-01 password <password>
!
! roll out in monitor mode first
! cts role-based monitor all
! show cts role-based counters`,
    },
    fail: {
      label: 'A tag without enforcement is a label',
      body: (
        <>
          Assigning an SGT changes nothing on its own. Until the egress matrix
          has a cell for that source and destination pair, and{' '}
          <M>cts role-based enforcement</M> is on where the traffic is routed,
          the tag is documentation. Roll out with{' '}
          <M>cts role-based monitor all</M> and read the counters before you
          enable a single deny cell.
        </>
      ),
    },
  },

  {
    id: 'redirect',
    label: 'Web Redirection',
    name: 'Web redirection — CWA, posture, hotspot, MDM, NSP',
    scope: 'both',
    gist:
      'Two attributes working as a pair: one names an ACL on the NAD that selects which traffic gets punted, the other gives the URL to punt it to. Every guest, posture and BYOD flow is built on this.',
    sends: [
      <><M>cisco-av-pair = url-redirect-acl=&lt;ACL name on the NAD&gt;</M></>,
      <><M>cisco-av-pair = url-redirect=https://&lt;PSN-FQDN&gt;:8443/portal/gateway?...</M></>,
      <>Always paired with a dACL (or Airespace ACL) that actually permits DNS, DHCP and the portal</>,
    ],
    configure: [
      ['Path', <>{PROFILE_PATH} &gt; Common Tasks &gt; <strong>Web Redirection</strong></>],
      ['Sub-type', <>Centralized Web Auth · Client Provisioning (Posture) · Hot Spot · MDM Redirect · Native Supplicant Provisioning · Device Registration Web Auth</>],
      ['ACL', <>The name of the redirect ACL that exists on the NAD — not a dACL</>],
      ['Value', <>Which portal to send the browser to</>],
      ['Optional', <><strong>Static IP/Host name/FQDN</strong> overrides the redirect host; <strong>Display Certificates Renewal Message</strong></>],
    ],
    nad: {
      title: 'IOS switch — a redirect ACL is a classifier, not a filter',
      code: `! permit = this traffic IS redirected
! deny   = this traffic is NOT redirected (it is not dropped)
ip access-list extended REDIRECT
 deny   ip  any host 10.1.1.10      ! never redirect ISE itself
 deny   udp any any eq domain       ! never redirect DNS
 permit tcp any any eq www
 permit tcp any any eq 443
!
! the HTTP process is what issues the 302
ip http server
ip http secure-server`,
    },
    fail: {
      label: 'Polarity, and the certificate',
      tone: 'warn',
      body: (
        <>
          Reading the redirect ACL as a filter is the classic error — a{' '}
          <M>permit ip any any</M> redirects everything, including the
          endpoint&rsquo;s traffic to ISE, and the portal never loads. Redirect
          to an <strong>FQDN</strong>, never an IP: the portal certificate will
          not match an address, and captive-network assistants on iOS and
          Android handle the warning badly. The 9800 and AireOS treat redirect
          ACL polarity differently from IOS switches in some releases — verify
          per platform rather than assuming.
        </>
      ),
    },
  },

  {
    id: 'reauth',
    label: 'Reauth timer',
    name: 'Reauthentication timer',
    scope: 'both',
    gist:
      'Pushes the re-authentication interval from ISE per session, instead of setting it identically on every switchport. The Termination-Action value is what decides whether re-auth is graceful or brutal.',
    sends: [
      <><M>Session-Timeout (27)</M> = the timer value in seconds</>,
      <><M>Termination-Action (29)</M> = <M>RADIUS-Request</M> when Maintain Connectivity is set, otherwise <M>Default</M></>,
    ],
    configure: [
      ['Path', <>{PROFILE_PATH} &gt; Common Tasks &gt; <strong>Reauthentication</strong></>],
      ['Timer', <>Seconds. This is a per-authorization-result value, so a guest can carry a short timer and a corporate asset a long one</>],
      ['Maintain Connectivity During Reauthentication', <><M>RADIUS-Request</M> re-authenticates in place and keeps the session; <M>Default</M> ends the session at expiry</>],
    ],
    fail: {
      label: 'Cheap to set, expensive to get wrong',
      body: (
        <>
          A short timer multiplied by every endpoint is a permanent RADIUS load
          you did not plan for, and with <M>Termination-Action = Default</M>{' '}
          each expiry tears the session down and restarts authentication — on a
          voice or medical device that is a visible outage. Use it where the
          authorisation genuinely has a lifetime, such as a guest session, and
          leave everything else to CoA.
        </>
      ),
    },
  },

  {
    id: 'avpair',
    label: 'Advanced AV pair',
    name: 'Advanced Attributes Settings',
    scope: 'both',
    gist:
      'The escape hatch. A two-column builder: a dictionary attribute on the left, a static value or another dictionary attribute on the right. Anything with no Common Task checkbox goes here.',
    sends: [
      <>Whatever you type — it is placed verbatim into the Access-Accept</>,
      <>The right-hand side can be another dictionary attribute, so an AD attribute can be copied straight into a RADIUS attribute</>,
    ],
    configure: [
      ['Path', <>{PROFILE_PATH} &gt; <strong>Advanced Attributes Settings</strong></>],
      ['Validate at', <>The <strong>Attributes Details</strong> pane at the foot of the profile — it shows the exact resulting attribute list</>],
      ['Voice', <><M>cisco-av-pair = device-traffic-class=voice</M> is what the <strong>Voice Domain Permission</strong> checkbox sends, and what <M>Cisco_IP_Phones</M> carries</>],
    ],
    nad: {
      title: 'The AV pairs worth knowing by heart',
      code: `Cisco:cisco-av-pair = device-traffic-class=voice
Cisco:cisco-av-pair = device-traffic-class=switch     ! NEAT
Cisco:cisco-av-pair = ip:inacl#10=permit ip any any
Cisco:cisco-av-pair = shell:priv-lvl=15
Cisco:cisco-av-pair = interface-template-name=<name>
Cisco:cisco-av-pair = linksec-policy=must-secure
Cisco:cisco-av-pair = subscriber:command=reauthenticate
Cisco:cisco-av-pair = subscriber:reauthenticate-type=last
Airespace:Airespace-Interface-Name = <wlc-interface>
Airespace:Airespace-QOS-Level = <0-3>
Radius:Filter-Id = MY_ACL.in
Radius:Idle-Timeout = <seconds>
Radius:Termination-Action = RADIUS-Request`,
    },
    fail: {
      label: 'Nothing checks your spelling',
      tone: 'warn',
      body: (
        <>
          A malformed AV pair is sent exactly as typed. Most NADs silently
          discard what they do not understand, so the authorisation looks
          successful and the intended behaviour simply never happens. Read the
          Attributes Details pane, then confirm on the NAD with{' '}
          <M>show authentication sessions interface &lt;if&gt; details</M>.
        </>
      ),
    },
  },
]

export default function PolicySheet() {
  const [resultId, setResultId] = useState(RESULTS[0].id)
  const result = RESULTS.find(r => r.id === resultId) ?? RESULTS[0]

  return (
    <Sheet>
      {/* ---------------- anatomy + evaluation order ---------------- */}
      <Panel
        title="A policy set, and the order it is evaluated in"
        kicker="Policy > Policy Sets"
        span={7}
        tone="signal"
      >
        <Stack gap={7}>
          <Prose>
            Cisco&rsquo;s definition: a policy set is{' '}
            <em>
              a hierarchical container consisting of a single user-defined rule
              that indicates the allowed protocol or server sequence for network
              access, and authentication and authorization policies and policy
              exceptions
            </em>
            . ISE evaluates policy set conditions top-down and processes{' '}
            <strong>only the first one that matches</strong>. Everything below
            happens inside that set.
          </Prose>

          <Flow
            steps={[
              { label: 'Policy set', detail: 'first condition to match wins', tone: 'signal' },
              { label: 'Allowed protocols', detail: 'or a proxy server sequence' },
              { label: 'Authentication', detail: 'picks the identity store' },
              { label: 'Local exceptions', detail: 'this set only' },
              { label: 'Global exceptions', detail: 'every set' },
              { label: 'Authorization', detail: 'then the Default rule' },
            ]}
          />

          <Code
            title="The container, top to bottom"
            code={`Policy Set   condition | Allowed Protocols / Server Sequence | Hits
  |
  +- Authentication Policy
  |    rule: conditions -> Use: identity source or sequence
  |    options: If Auth fail       REJECT | DROP | CONTINUE
  |             If User not found  REJECT | DROP | CONTINUE
  |             If Process fail    REJECT | DROP | CONTINUE
  |
  +- Authorization Policy - Local Exceptions    (this set only)
  +- Authorization Policy - Global Exceptions   (all sets)
  +- Authorization Policy
       rule: conditions -> Profiles + Security Groups
  |
  +- Default rule                              (DenyAccess)`}
          />

          <Note label="The GUI order is not the evaluation order">
            The page draws <strong>Local Exceptions above Global Exceptions</strong>,
            and that is also the documented evaluation paradigm — local first,
            then global, then the standard rules. Exceptions exist for
            short-lived work: emergency quarantine, temporary elevation,
            incident response. If an exception has been in place for a month it
            belongs in the standard rules.
          </Note>
        </Stack>
      </Panel>

      {/* ---------------- what ships by default ---------------- */}
      <Panel title="What ISE ships with" kicker="Before you change anything" span={5}>
        <Stack gap={6}>
          <KV
            items={[
              [
                'Policy sets',
                <>
                  Exactly one: <strong>Default</strong>. Its allowed protocols
                  and identity source are editable; the set itself cannot be
                  deleted
                </>,
              ],
              [
                'Default authN',
                <>
                  One rule, no condition, using the{' '}
                  <M>All_User_ID_Stores</M> sequence — every predefined ID store
                  in the system
                </>,
              ],
              [
                'Its options',
                <>
                  Auth fail &rarr; <strong>reject</strong> · user not found
                  &rarr; <strong>reject</strong> · process fail &rarr;{' '}
                  <strong>drop, no response</strong>
                </>,
              ],
              [
                'Default authZ',
                <>
                  Network access: <M>DenyAccess</M>. Device admin:{' '}
                  <M>DenyAllCommands</M> + <strong>Deny All Shell Profile</strong>
                </>,
              ],
              [
                'Allowed protocols',
                <>
                  <strong>Default Network Access</strong> — process host lookup,
                  PAP/ASCII, EAP-MD5, EAP-TLS, PEAP, EAP-FAST, EAP-TTLS
                </>,
              ],
              [
                'AuthZ profiles',
                <>
                  <M>PermitAccess</M>, <M>DenyAccess</M>,{' '}
                  <M>Cisco_IP_Phones</M>, <M>Cisco_WebAuth</M>,{' '}
                  <M>NSP_Onboard</M>, <M>Non_Cisco_IP_Phones</M>,{' '}
                  <M>Blackhole_Wireless_Access</M>, <M>UDN</M>
                </>,
              ],
              [
                'dACLs',
                <>
                  <M>PERMIT_ALL_IPV4_TRAFFIC</M>, <M>DENY_ALL_IPV4_TRAFFIC</M>,
                  and the IPv6 pair
                </>,
              ],
            ]}
            labelWidth={82}
          />
          <Note label="TEAP is not in the default set" tone="warn">
            The shipped <strong>Default Network Access</strong> service does not
            enable TEAP. Build your own allowed-protocols service at{' '}
            <M>Policy &gt; Policy Elements &gt; Results &gt; Authentication &gt; Allowed Protocols</M>{' '}
            and turn off everything you are not deliberately supporting —
            EAP-MD5 and LEAP first.
          </Note>
        </Stack>
      </Panel>

      {/* ---------------- THE RESULT EXPLORER ---------------- */}
      <Panel
        title="Authorization result explorer"
        span={12}
        tone="ink"
        right={
          <span className="normal-case tracking-normal">
            What ISE sends · what the NAD needs · how it fails
          </span>
        }
      >
        <Stack gap={8}>
          <div className="flex items-center justify-between gap-4">
            <Selector
              options={RESULTS.map(r => ({ id: r.id, label: r.label, hint: r.gist }))}
              value={resultId}
              onChange={setResultId}
            />
            <Pill
              tone={
                result.scope === 'wired'
                  ? 'warn'
                  : result.scope === 'wireless'
                    ? 'neutral'
                    : 'good'
              }
            >
              {result.scope === 'wired'
                ? 'Wired only'
                : result.scope === 'wireless'
                  ? 'Wireless only'
                  : 'Wired and wireless'}
            </Pill>
          </div>

          <div className="border-t border-ink-200 pt-2">
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-4">
                <h4
                  className="text-[12px] font-bold tracking-tight text-ink-950"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  {result.name}
                </h4>
                <div className="mt-1">
                  <Prose>{result.gist}</Prose>
                </div>
                <div className="mt-2">
                  <div
                    className="mb-1 border-b border-ink-300 pb-[2px] text-[9px] font-bold uppercase tracking-[0.11em] text-ink-950"
                    style={{ fontFamily: 'var(--font-heading)' }}
                  >
                    What lands in the Access-Accept
                  </div>
                  <Bullets items={result.sends} />
                </div>
              </div>

              <div className="col-span-3">
                <div
                  className="mb-1 border-b border-ink-300 pb-[2px] text-[9px] font-bold uppercase tracking-[0.11em] text-ink-950"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  How it is configured in ISE
                </div>
                <KV items={result.configure} labelWidth={72} />
              </div>

              <div className="col-span-5">
                <div
                  className="mb-1 border-b border-ink-300 pb-[2px] text-[9px] font-bold uppercase tracking-[0.11em] text-ink-950"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  What the network device needs
                </div>
                {result.nad ? (
                  <Code title={result.nad.title} code={result.nad.code} />
                ) : (
                  <Prose>
                    Nothing beyond a working AAA configuration — the attribute
                    is consumed by the NAD without extra feature configuration.
                  </Prose>
                )}
                <div className="mt-2">
                  <Note label={result.fail.label} tone={result.fail.tone}>
                    {result.fail.body}
                  </Note>
                </div>
              </div>
            </div>
          </div>
        </Stack>
      </Panel>

      {/* ---------------- dictionaries ---------------- */}
      <Panel title="Dictionaries and the attributes people actually use" span={5}>
        <Table
          head={['Dictionary', 'The attributes worth remembering']}
          widths={['22%', '78%']}
          rows={[
            [
              'RADIUS',
              <>
                <M>Service-Type</M>, <M>NAS-Port-Type</M>, <M>NAS-IP-Address</M>,{' '}
                <M>NAS-Port-Id</M>, <M>Calling-Station-ID</M> (endpoint MAC),{' '}
                <M>Called-Station-ID</M> (NAD MAC or SSID), <M>Framed-IP-Address</M>,{' '}
                <M>Airespace-Wlan-Id</M>
              </>,
            ],
            [
              'Network Access',
              <>
                The most useful dictionary in policy.{' '}
                <M>AuthenticationStatus</M>, <M>AuthenticationMethod</M>,{' '}
                <M>EapTunnel</M> (PEAP / TEAP / EAP-FAST / EAP-TTLS),{' '}
                <M>EapAuthentication</M> (the inner method), <M>UseCase</M>,{' '}
                <M>WasMachineAuthenticated</M>, <M>EapChainingResult</M>
              </>,
            ],
            [
              'Normalised Radius',
              <>
                <M>RadiusFlowType</M> (<M>Wired802_1x</M>, <M>WiredMAB</M>,{' '}
                <M>Wireless802_1x</M>, <M>WirelessMAB</M>, <M>WirelessWebAuth</M>),{' '}
                <M>SSID</M>, <M>NetworkDeviceName</M> — vendor-independent, so
                prefer it to raw RADIUS
              </>,
            ],
            [
              'EndPoints',
              <>
                <M>EndPointPolicy</M>, <M>LogicalProfile</M>,{' '}
                <M>BYODRegistration</M>, <M>StaticGroupAssignment</M>,{' '}
                <M>MDMServerName</M>, <M>PostureApplicable</M>
              </>,
            ],
            [
              'IdentityGroup',
              <>
                <M>Name</M>, matched with EQUALS against a user or endpoint
                group — e.g.{' '}
                <M>Endpoint Identity Groups:Profiled:Cisco-IP-Phone</M>
              </>,
            ],
            [
              'CERTIFICATE',
              <>
                <M>Subject - Common Name</M>, <M>Subject Alternative Name</M>{' '}
                and its DNS / Email / Other Name variants,{' '}
                <M>Issuer - Common Name</M>, <M>Serial Number</M>,{' '}
                <M>Template Name</M>, <M>Binary Comparison Result</M>
              </>,
            ],
            [
              'DEVICE',
              <>
                <M>Device Type</M>, <M>Location</M>, <M>Model Name</M>,{' '}
                <M>Software Version</M>, <M>IPSEC</M>, plus every Network Device
                Group you create
              </>,
            ],
            [
              'AD (per join point)',
              <>
                <M>ExternalGroups</M>, <M>IdentityAccessRestricted</M>,{' '}
                <M>userPrincipalName</M>, <M>sAMAccountName</M>, <M>memberOf</M>,{' '}
                <M>department</M> — plus anything added on the Attributes tab
              </>,
            ],
            [
              'Session',
              <>
                <M>PostureStatus</M> (Compliant / NonCompliant / Unknown /
                Pending), <M>EPSStatus</M> for ANC, <M>Session-Type</M>,{' '}
                <M>IPAddress</M>
              </>,
            ],
            [
              'MDM',
              <>
                <M>DeviceRegisterStatus</M>, <M>DeviceCompliantStatus</M>,{' '}
                <M>PinLockStatus</M>, <M>DiskEncryptionStatus</M>,{' '}
                <M>JailBrokenStatus</M>, <M>MDMServerReachable</M>
              </>,
            ],
          ]}
        />
      </Panel>

      {/* ---------------- conditions ---------------- */}
      <Panel title="Conditions Studio" kicker="Library · smart · operators" span={3} tone="quiet">
        <Stack gap={6}>
          <Split
            cols={1}
            parts={[
              {
                title: 'Two panes',
                children: (
                  <Bullets
                    items={[
                      <><strong>Library</strong> on the left — saved, reusable conditions referenced by name from many policy sets</>,
                      <><strong>Editor</strong> on the right — build inline, then <em>Save as new Library Condition</em> to promote it</>,
                      <>Compound conditions nest AND / OR blocks and can be dragged</>,
                      <>Also managed at <M>Policy &gt; Policy Elements &gt; Conditions</M></>,
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
                title: 'Smart conditions that ship with ISE',
                children: (
                  <Bullets
                    cols={2}
                    items={[
                      <M>Wired_802.1X</M>,
                      <M>Wireless_802.1X</M>,
                      <M>Wired_MAB</M>,
                      <M>Wireless_MAB</M>,
                      <M>WLC_Web_Authentication</M>,
                      <M>Switch_Web_Authentication</M>,
                      <M>EAP-TLS</M>,
                      <M>Guest_Flow</M>,
                      <M>Compliant_Devices</M>,
                      <M>Network_Access_Authentication_Passed</M>,
                    ]}
                  />
                ),
              },
            ]}
          />
          <Note label="The null-attribute trap" tone="warn">
            When the attribute named in a condition has no value in the request,
            a <strong>NOT EQUALS</strong> comparison evaluates{' '}
            <strong>true</strong> and every other operator evaluates false. A
            negative rule will therefore match endpoints you never considered.
            Use <M>Equals</M> for straight comparison, <M>Contains</M> for
            multi-value attributes, and <M>Matches</M> only for regular
            expressions — it is regex, not wildcards.
          </Note>
        </Stack>
      </Panel>

      {/* ---------------- identity source sequences ---------------- */}
      <Panel title="Identity Source Sequences and the three failure options" span={4}>
        <Stack gap={6}>
          <Prose>
            A sequence is an ordered search list of identity stores, optionally
            preceded by a Certificate Authentication Profile for certificate
            flows. Built at{' '}
            <M>Administration &gt; Identity Management &gt; Identity Source Sequences</M>.
          </Prose>
          <KV
            items={[
              [
                'Store unreachable',
                <>
                  Advanced Search List Settings, two choices:{' '}
                  <em>do not access other stores and set AuthenticationStatus
                  to ProcessError</em>, or{' '}
                  <em>treat as if the user was not found and proceed to the
                  next store</em>
                </>,
              ],
              [
                'Built-in',
                <>
                  <M>All_User_ID_Stores</M>, <M>Guest_Portal_Sequence</M>,{' '}
                  <M>Sponsor_Portal_Sequence</M>,{' '}
                  <M>MyDevices_Portal_Sequence</M>,{' '}
                  <M>Certificate_Request_Sequence</M>
                </>,
              ],
            ]}
            labelWidth={88}
          />
          <Table
            head={['Rule option', 'Fires when', 'REJECT / DROP / CONTINUE']}
            widths={['24%', '40%', '36%']}
            rows={[
              [
                'If Auth fail',
                <>
                  The subject was found and the credential was wrong —{' '}
                  <M>24408</M>, <M>22040</M>, <M>22063</M>
                </>,
                'REJECT sends an Access-Reject. DROP sends nothing at all',
              ],
              [
                'If User not found',
                <>
                  Every store in the list returned no such subject —{' '}
                  <M>22056</M>
                </>,
                <>
                  CONTINUE here is the mechanism behind &ldquo;unknown MAC
                  &rarr; CWA guest redirect&rdquo;
                </>,
              ],
              [
                'If Process fail',
                <>
                  A store was unreachable and the sequence is set to
                  ProcessError — <M>22059</M>
                </>,
                'DROP makes the NAD time out and fail over to the next AAA server — often what you want',
              ],
            ]}
          />
          <Note label="CONTINUE does not work everywhere">
            Cisco is explicit: for authentications using PEAP, LEAP, EAP-FAST,
            EAP-TLS or RADIUS MSCHAP it is not possible to continue processing
            when authentication fails. CONTINUE is usable with{' '}
            <strong>PAP/ASCII</strong> and <strong>MAB</strong> (host lookup),
            which is exactly where the guest designs put it — the authorization
            rule then matches{' '}
            <M>Network Access:AuthenticationStatus EQUALS UnknownUser</M>.
          </Note>
        </Stack>
      </Panel>
    </Sheet>
  )
}
