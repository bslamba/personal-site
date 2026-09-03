'use client'

// ============================================================
// Topic — Guest Access
//
// The selector covers the three portal types plus the two web
// authentication mechanisms; the ladder is the real CWA packet
// order on a Catalyst 9800, condensed from the full 26-step
// sequence.
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
  Steps,
} from '../sheet-kit'

interface Option {
  id: string
  label: string
  name: string
  badge: string
  gist: string
  flow: React.ReactNode[]
  isePath: [React.ReactNode, React.ReactNode][]
  profile: React.ReactNode[]
  nad: { title: string; code: string }
}

const OPTIONS: Option[] = [
  {
    id: 'hotspot',
    label: 'Hotspot',
    name: 'Hotspot Guest Portal',
    badge: 'No credentials',
    gist:
      'Network access with no username and password at all — usually just an Acceptance of Use Policy, optionally an access code. Underneath it is Device Registration WebAuth: what gets authorized is the MAC address, not a person. Lobby, retail and conference Wi-Fi, where you want zero account administration and only a record of which MACs connected.',
    flow: [
      'Endpoint associates to the open SSID; the NAD sends a MAB Access-Request.',
      <>ISE matches <M>Wireless_MAB</M> with no existing registration and returns the redirect profile.</>,
      'Endpoint DHCPs, runs its captive-portal probe, and the NAD returns an HTTP 302 to the Hotspot portal.',
      'Guest accepts the AUP, and the access code if one is set.',
      <>ISE writes the MAC into the portal&rsquo;s endpoint identity group — default <M>GuestEndpoints</M>.</>,
      'CoA; on reauth a rule keyed on that group returns full access.',
      'On reconnect the portal is skipped until the endpoint purge removes the MAC.',
    ],
    isePath: [
      ['Portal', <M key="a">Work Centers &gt; Guest Access &gt; Portals &amp; Components &gt; Guest Portals</M>],
      ['Group', <>Endpoint identity group, default <M>GuestEndpoints</M></>],
      ['Purge', <>Guest endpoints purged by an endpoint purge rule — default <strong>30 days</strong>, at <M>Administration &gt; Identity Management &gt; Settings &gt; Endpoint Purge</M></>],
    ],
    profile: [
      <>Access Type <M>ACCESS_ACCEPT</M></>,
      <>Web Redirection → <strong>Centralized Web Auth</strong>, ACL <M>REDIRECT</M>, Value = <strong>Hotspot Guest Portal (default)</strong></>,
      <>Second rule: <M>IdentityGroup:Name EQUALS Endpoint Identity Groups:GuestEndpoints</M> → permit</>,
    ],
    nad: {
      title: 'Nothing special — open WLAN + MAC filtering',
      code: `wlan HOTSPOT 5 HOTSPOT
 mac-filtering CWAauthz
 no security wpa
 no security wpa wpa2
 no security wpa akm dot1x
 no shutdown
!
wireless profile policy POL-HOTSPOT
 vlan VLAN_GUEST
 aaa-override
 nac
 accounting-list CWAacct
 no shutdown`,
    },
  },

  {
    id: 'selfreg',
    label: 'Self-Registered',
    name: 'Self-Registered Guest Portal',
    badge: 'Credentialed',
    gist:
      'The guest creates their own account and may need sponsor approval before access is granted. The right answer for high-volume guest environments where you cannot staff a sponsor for every visitor but still want a per-user credential and an audit record.',
    flow: [
      'Connect, MAB, CWA redirect, land on the Self-Registered portal.',
      'Guest fills the registration form — Registration Form Settings plus Custom Fields, optionally gated by a Registration Code.',
      'ISE generates the username and password per the Guest Username and Password policies.',
      'Credentials shown on screen and/or sent by email or SMS.',
      <><strong>Without approval:</strong> guest logs in, accepts the AUP, account goes <strong>Active</strong>.</>,
      <><strong>With approval:</strong> account is <strong>Pending Approval</strong>; ISE emails the approver, who approves in the mail or in the Sponsor portal.</>,
      'Guest Flow merge → CoA → final authorization.',
    ],
    isePath: [
      ['Portal', <M key="b">Work Centers &gt; Guest Access &gt; Portals &amp; Components &gt; Guest Portals</M>],
      ['Custom fields', <M key="c">Work Centers &gt; Guest Access &gt; Settings &gt; Custom Fields</M>],
      ['Social login', <M key="d">Administration &gt; Identity Management &gt; External Identity Sources &gt; Social Login</M>],
      ['Remember me', <>Portal Behavior and Flow Settings → <strong>Guest Device Registration Settings → Automatically register guest devices</strong></>],
    ],
    profile: [
      <>Web Redirection → <strong>Centralized Web Auth</strong>, Value = <strong>Self-Registered Guest Portal (default)</strong></>,
      <>Rule 1 <M>Guest_Redirect</M> — <M>Wireless_MAB</M> AND NOT member of <M>GuestEndpoints</M> → redirect profile</>,
      <>Rule 2 <M>Guest_Access</M> — <M>Network Access:UseCase EQUALS Guest Flow</M> → permit profile</>,
      <>ISE ships <M>Wifi_Redirect_to_Guest_Login</M> and <M>Wifi Guest Access</M> — enabling those two is the fastest path</>,
    ],
    nad: {
      title: 'Social login needs these permitted pre-auth',
      code: `! Facebook is the supported social provider.
! These HTTPS destinations must be reachable
! before the guest has authenticated:
!
!   facebook.co
!   akamaihd.net
!   akamai.co
!   fbcdn.net
!
! Note: not all NADs support redirection to
! an HTTPS URL.
!
! 802.1X  -> token-based auto-login on reconnect
!            while the account is unexpired
! MAB     -> redirected to the portal on every
!            reconnect, but the cached token is
!            reused if the account is active`,
    },
  },

  {
    id: 'sponsored',
    label: 'Sponsored',
    name: 'Sponsored-Guest Portal',
    badge: 'Credentialed',
    gist:
      'A sponsor — an employee, a receptionist — creates the account in the Sponsor portal and hands the guest the credentials by print, email or SMS. The right answer wherever every guest must be traceable to an internal sponsor, or where accounts are pre-created in bulk for a visit or a conference.',
    flow: [
      <>Sponsor logs into the Sponsor portal on <M>TCP 8445</M> and picks a <strong>guest type</strong> and a <strong>Guest Location</strong>, which sets the timezone.</>,
      'Sponsor creates a Known guest, Random guests in bulk, or imports from CSV.',
      <>Account created in the Guest User store, state <strong>Awaiting Initial Login</strong>.</>,
      'Sponsor notifies the guest — Print, Email or SMS.',
      'Guest connects, MAB, CWA redirect, types the credentials on the portal.',
      <>ISE authenticates against <strong>Guest Users</strong> via the portal&rsquo;s identity source sequence, typically <M>Guest_Portal_Sequence</M>.</>,
      <>AUP, optional first-login password change, account goes <strong>Active</strong> and the duration clock starts.</>,
      <>Guest Flow merge → CoA → permit, with <M>Session-Timeout</M> set to the account&rsquo;s remaining seconds.</>,
    ],
    isePath: [
      ['Sponsor portal', <M key="e">Work Centers &gt; Guest Access &gt; Portals &amp; Components &gt; Sponsor Portals</M> ],
      ['Guest types', <M key="f">Work Centers &gt; Guest Access &gt; Configure &gt; Guest Types</M>],
      ['Sponsor groups', <M key="g">Work Centers &gt; Guest Access &gt; Configure &gt; Sponsor Groups</M>],
      ['Locations', <M key="h">Work Centers &gt; Portals &amp; Components &gt; Settings &gt; Guest Locations and SSIDs</M>],
    ],
    profile: [
      <>Web Redirection → <strong>Centralized Web Auth</strong>, Value = <strong>Sponsored Guest Portal (default)</strong></>,
      <>Sponsor groups shipped: <M>ALL_ACCOUNTS</M>, <M>GROUP_ACCOUNTS</M>, <M>OWN_ACCOUNTS</M> — they differ in the scope of accounts a sponsor may manage</>,
      <>A sponsor group also fixes which guest types, locations and SMS providers that sponsor may use</>,
    ],
    nad: {
      title: 'Bulk import and notification gotchas',
      code: `! Sponsor portal            TCP 8445
! Guest / BYOD portals      TCP 8443  (8000-8999)
! Blocked List portal       TCP 8444
! SMTP from ISE             TCP 25    (default)
!
! CSV import:
!   phone numbers must be in E.164 format
!   set the phone column format to Text in Excel
!
! Email:
!   UTF-8 capable client required
!   HTML-capable client required for the
!   single-click sponsor approval links
!
! SMS providers shipped with no contract:
!   AT&T  Orange  Sprint  T-Mobile  Verizon
! Global provider needing a contract: Clickatell`,
    },
  },

  {
    id: 'cwa',
    label: 'CWA',
    name: 'Central Web Authentication',
    badge: 'Layer 2 first',
    gist:
      'The mechanism, not a portal. CWA is initiated at Layer 2 alongside MAC filtering or 802.1X: ISE answers the first Access-Request with a redirect rather than a verdict, hosts the login page itself, and then uses a CoA to change the session. Every ISE guest feature — guest types, sponsors, BYOD chaining, posture — only exists on this path.',
    flow: [
      'Client associates to an open WLAN with MAC filtering, or hits a wired port doing MAB.',
      'NAD sends a RADIUS Access-Request.',
      <>ISE returns Access-Accept with <M>url-redirect-acl</M> naming an ACL already on the NAD, plus <M>url-redirect</M>, plus a pre-auth dACL on wired.</>,
      'Client DHCPs, resolves DNS, issues an HTTP GET.',
      'NAD matches the redirect ACL, punts to CPU, returns an HTTP 302 to the ISE URL.',
      'Guest completes the portal; ISE performs the Guest Flow session merge.',
      <>ISE sends <strong>CoA-Reauth</strong> to the NAD&rsquo;s dynamic-author listener.</>,
      'NAD restarts Layer 2 authentication; ISE returns the final authorization and the redirect disappears.',
    ],
    isePath: [
      ['Profile', <M key="i">Policy &gt; Policy Elements &gt; Results &gt; Authorization &gt; Authorization Profiles</M>],
      ['dACL', <M key="j">Policy &gt; Policy Elements &gt; Results &gt; Authorization &gt; Downloadable ACLs</M>],
      ['Auth rule', <>On <M>Wired_MAB OR Wireless_MAB</M> → Internal Endpoints, <strong>If user not found: CONTINUE</strong></>],
      ['Timeout', <>9800 reap timer = 3 × init-state timeout + 5 s before the client is deauthenticated</>],
    ],
    profile: [
      <>ISE ships an authorization profile called <M>Cisco_WebAuth</M></>,
      <>The <strong>ACL name must match the NAD ACL character for character</strong> — this is the single most common CWA failure</>,
      <><strong>Static IP/Host name/FQDN</strong> forces the redirect to one well-known portal FQDN instead of the PSN&rsquo;s own name — use it when one certificate covers one name, or the PSN is behind NAT</>,
      <>Do not change VLAN post-CWA on an open network: there is no supplicant to notice, and the client keeps a stale address</>,
    ],
    nad: {
      title: 'Resulting attributes ISE sends',
      code: `Access Type = ACCESS_ACCEPT

cisco-av-pair = url-redirect-acl=REDIRECT

cisco-av-pair = url-redirect=
  https://<PSN-FQDN>:8443/portal/gateway
    ?sessionId=<SessionIdValue>
    &portal=<portalID>
    &action=cwa
    &token=<value>

! Wired only, in addition:
!   DACL Name = PRE_AUTH_DACL
!
! AireOS only:
!   Airespace ACL Name = <acl>`,
    },
  },

  {
    id: 'lwa',
    label: 'LWA',
    name: 'Local Web Authentication',
    badge: 'Layer 3',
    gist:
      'The portal is hosted on the network device itself, at Layer 3, and the redirect URL is configured statically rather than pushed by RADIUS. With external authentication the controller collects the credentials and forwards them to ISE as a PAP Access-Request. There is no CoA — the controller decides.',
    flow: [
      'Guest associates to an AP and completes DHCP.',
      'Client runs its connectivity check — DNS query, then an HTTP GET.',
      'The WLC intercepts it and replies HTTP 200 OK with a redirect URL.',
      'Guest enters credentials on the page, which redirects back to the WLC carrying them.',
      'WLC sends a PAP Access-Request with the typed username and password.',
      'ISE answers Access-Accept or Access-Reject; the WLC moves the client to RUN state. No CoA anywhere.',
    ],
    isePath: [
      ['In ISE', 'Nothing. No portal, no guest type, no sponsor, no device registration — ISE is only a credential oracle'],
      ['On the WLC', <M key="k">Configuration &gt; Security &gt; Web Auth</M>],
      ['Variants', <><M>type webauth</M> credentials · <M>type consent</M> AUP only · <M>type webconsent</M> both</>],
    ],
    profile: [
      <>No web-redirection authorization profile at all — a plain permit is enough</>,
      <>Two certificates are needed, one on the controller and one on whatever hosts the page; CWA needs only one</>,
      <>Use LWA where there is no ISE guest licence to spend, or where the NAD cannot do Layer 2 CWA</>,
    ],
    nad: {
      title: '9800 — LWA with external authentication',
      code: `parameter-map type webauth global
 virtual-ip ipv4 192.0.2.1
 trustpoint LWA-TRUSTPOINT
 webauth-http-enable
!
aaa authentication login LWA_AUTHENTICATION group ISE-GROUP
aaa authorization network LWA_AUTHORIZATION group ISE-GROUP
!
wlan LWA_EA 1 LWA_EA
 no security wpa
 security web-auth
 security web-auth authentication-list LWA_AUTHENTICATION
 security web-auth parameter-map global
 no shutdown`,
    },
  },
]

export default function GuestSheet() {
  const [optId, setOptId] = useState(OPTIONS[0].id)
  const o = OPTIONS.find(x => x.id === optId) ?? OPTIONS[0]

  return (
    <Sheet>
      {/* ---------------- portal types ---------------- */}
      <Panel title="The three types of guest access" span={4}>
        <Stack gap={6}>
          <Prose>
            Two families: the <strong>Hotspot</strong> portal, which needs no
            credentials, and the <strong>credentialed</strong> portals, which
            need a username and password. Two credentialed portals ship by
            default.
          </Prose>
          <Table
            head={['Type', 'What it is', 'Use it when']}
            widths={['22%', '40%', '38%']}
            rows={[
              [
                'Hotspot',
                'Un-credentialed access. AUP click-through, optionally an access code. Device Registration WebAuth underneath.',
                'Lobby and retail. No per-user accountability, no account administration.',
              ],
              [
                'Self-Registered',
                'Guests create their own account. Sponsor approval and social login both optional.',
                'High volume, no sponsor to spare, but you still want a credential and an audit record.',
              ],
              [
                'Sponsored',
                'A sponsor creates the account and shares the credentials by print, email or SMS.',
                'Every guest must trace back to an internal sponsor. Bulk pre-creation.',
              ],
            ]}
          />
          <Note label="Hotspot authorizes a MAC, not a person">
            Device Registration WebAuth registers the endpoint MAC into an
            endpoint identity group — default <M>GuestEndpoints</M> — and the
            authorization rule matches on that group. The same machinery gives
            the credentialed portals their &ldquo;remember me&rdquo; behaviour.
          </Note>
        </Stack>
      </Panel>

      {/* ---------------- CWA vs LWA vs DRW ---------------- */}
      <Panel title="CWA · LWA · Device Registration WebAuth" span={4} tone="signal">
        <Stack gap={6}>
          <Table
            head={['Aspect', 'CWA', 'LWA']}
            widths={['30%', '35%', '35%']}
            rows={[
              ['Layer', 'Layer 2 — MAB or dot1x', 'Layer 3'],
              ['Portal hosted on', 'ISE, centrally', 'Controller or switch'],
              ['Credential processing', 'ISE, over HTTPS to the portal', 'NAD, or forwarded to RADIUS/LDAP'],
              ['Redirect URL', <>Pushed by RADIUS — <M key="l">url-redirect</M></>, 'Statically configured on the NAD'],
              ['Redirect ACL', <>Pushed by RADIUS — <M key="m">url-redirect-acl</M></>, 'Locally configured pre-auth ACL'],
              ['Certificates', 'One, on the central portal', 'One on the WLC plus one on the portal'],
              ['CoA', 'Required — CoA-Reauth after portal success', 'Not used'],
              ['Guest lifecycle', 'Full — guest types, sponsors, BYOD, posture', 'None. Credential validation only'],
            ]}
          />
          <Note label="DRW is a CWA variant">
            Device Registration WebAuth uses the CWA plumbing exactly — MAB,
            redirect, portal, CoA — but the outcome is endpoint-group membership
            rather than a user session. That is why a Hotspot guest is never
            asked again until the purge runs.
          </Note>
        </Stack>
      </Panel>

      {/* ---------------- lifecycle ---------------- */}
      <Panel title="Guest types, lifecycle and purge" span={4} tone="quiet">
        <Split
          cols={2}
          parts={[
            {
              title: 'Guest types and what they set',
              children: (
                <Stack gap={5}>
                  <Table
                    head={['Shipped type', 'Intent']}
                    widths={['40%', '60%']}
                    rows={[
                      ['Contractor', 'Up to one year'],
                      ['Daily', '1–5 days'],
                      ['Weekly', 'Two weeks'],
                    ]}
                  />
                  <Bullets
                    items={[
                      <><strong>Duration</strong> starts from first login or a sponsor date; 1&ndash;999 days, hours or minutes</>,
                      <><strong>Day and time windows</strong>, in the timezone of the Guest Location</>,
                      <>Max simultaneous logins; max devices per account</>,
                      <><strong>Bypass the portal</strong> — use the account with a dot1x or VPN supplicant</>,
                      <>Expiry notice N days before, by email or SMS</>,
                    ]}
                  />
                </Stack>
              ),
            },
            {
              title: 'Account states and purge',
              children: (
                <Stack gap={5}>
                  <Table
                    head={['State', 'Meaning']}
                    widths={['42%', '58%']}
                    rows={[
                      ['Awaiting Initial Login', 'Created; the clock has not started'],
                      ['Active', 'Logged in and within duration'],
                      ['Pending Approval', 'Self-registered, waiting on a sponsor'],
                      ['Denied', 'Sponsor rejected it'],
                      ['Suspended', 'Disabled; reinstatable'],
                      ['Expired', 'Duration exceeded; eligible for purge'],
                    ]}
                  />
                  <Bullets
                    items={[
                      <>Expired guest <strong>accounts</strong> are purged every <strong>15 days</strong> by default — <M>Work Centers &gt; Guest Access &gt; Settings &gt; Guest Account Purge Policy</M></>,
                      <>Guest <strong>endpoints</strong> in <M>GuestEndpoints</M> are purged by a separate endpoint purge rule, default <strong>30 days</strong></>,
                      <>Username and password may not contain <M>&lt;</M> <M>&gt;</M> <M>/</M> <M>,</M> <M>%</M> or spaces</>,
                    ]}
                  />
                </Stack>
              ),
            },
          ]}
        />
      </Panel>

      {/* ---------------- THE SELECTOR ---------------- */}
      <Panel
        title="Portal types and web authentication mechanisms"
        span={12}
        right={
          <span className="normal-case tracking-normal">
            Flow · ISE path · authorization profile · NAD side
          </span>
        }
      >
        <Stack gap={8}>
          <div className="flex items-center justify-between gap-4">
            <Selector
              options={OPTIONS.map(x => ({ id: x.id, label: x.label, hint: x.gist }))}
              value={optId}
              onChange={setOptId}
            />
            <Pill tone={o.id === 'lwa' ? 'warn' : 'neutral'}>{o.badge}</Pill>
          </div>

          <div className="grid grid-cols-12 gap-3 border-t border-ink-200 pt-2">
            <div className="col-span-5">
              <h4
                className="text-[12px] font-bold tracking-tight text-ink-950"
                style={{ fontFamily: 'var(--font-heading)' }}
              >
                {o.name}
              </h4>
              <div className="mt-1">
                <Prose>{o.gist}</Prose>
              </div>
              <div className="mt-2">
                <div
                  className="mb-1 border-b border-ink-300 pb-[2px] text-[9px] font-bold uppercase tracking-[0.11em] text-ink-950"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  The flow
                </div>
                <Steps items={o.flow} />
              </div>
            </div>

            <div className="col-span-4">
              <Split
                cols={1}
                parts={[
                  {
                    title: 'Where it lives in ISE',
                    children: <KV items={o.isePath} labelWidth={76} />,
                  },
                  {
                    title: 'Authorization profile and policy',
                    children: <Bullets items={o.profile} />,
                  },
                ]}
              />
            </div>

            <div className="col-span-3">
              <Code title={o.nad.title} code={o.nad.code} />
            </div>
          </div>
        </Stack>
      </Panel>

      {/* ---------------- the ladder ---------------- */}
      <Panel
        title="CWA on a Catalyst 9800 — the real packet order"
        kicker="Condensed from the full 26-step sequence"
        span={6}
      >
        <Ladder
          actors={['Client', 'AP', '9800 WLC', 'DHCP', 'DNS', 'ISE']}
          steps={[
            { from: 0, to: 1, label: 'Association request', sub: 'open WLAN, MAC filtering' },
            { from: 2, to: 5, label: 'RADIUS Access-Request — MAB' },
            {
              from: 5,
              to: 2,
              label: 'Access-Accept + Redirect ACL + Redirect URL',
              tone: 'signal',
              sub: 'the WLC applies the ACL',
            },
            { from: 1, to: 0, label: 'Association response' },
            { from: 0, to: 3, label: 'DHCP Discover, Offer, Request, Ack' },
            {
              from: 0,
              to: 4,
              label: 'DNS query and response: captive.apple.com is at 17.253.53.207',
              sub: 'the connectivity-check URL varies by client OS',
            },
            {
              from: 0,
              to: 2,
              label: 'TCP SYN / SYN-ACK / ACK, then HTTP GET captive.apple.com',
              sub: 'the WLC intercepts the session, spoofing 17.253.53.207',
            },
            { from: 2, to: 0, label: 'HTTP 200 OK + Redirect URL to ISE', tone: 'signal' },
            {
              from: 0,
              to: 5,
              label: 'HTTPS GET the portal page using the Redirect URL',
              sub: 'the client must resolve the ISE FQDN and trust its certificate',
            },
            { from: 0, to: 5, label: 'Username + password, or “I accept the AUP”' },
            { from: 5, to: 2, label: 'CoA-Request → CoA-ACK', tone: 'signal', sub: 'please reauth' },
            { from: 2, to: 5, label: 'Access-Request → Access-Accept · RUN state', tone: 'signal' },
          ]}
        />
      </Panel>

      {/* ---------------- redirect ACLs ---------------- */}
      <Panel title="The redirect ACL, both platforms" span={3}>
        <Stack gap={6}>
          <Code
            title="IOS-XE switch"
            code={`ip access-list extended ACL_WEBAUTH_REDIRECT
 deny   ip any host <ISE-IP>
 deny   ip host <ISE-IP> any
 deny   udp any any eq domain
 deny   udp any eq domain any
 permit tcp any any eq 80`}
          />
          <Code
            title="Catalyst 9800"
            code={`ip access-list extended REDIRECT
 deny   ip any host 10.1.100.10
 deny   ip host 10.1.100.10 any
 deny   udp any any eq domain
 deny   udp any eq domain any
 permit tcp any any eq www
 permit tcp any any eq 443`}
          />
          <Note label="Never end it with permit ip any any">
            End the ACL with a permit focused on port 80 rather than{' '}
            <M>permit ip any any</M>. Otherwise the WLC also redirects HTTPS,
            which forces it to present its own certificate and always produces a
            certificate violation — the one exception to the rule that CWA needs
            no certificate on the WLC, and it is never considered valid anyway.
          </Note>
        </Stack>
      </Panel>

      {/* ---------------- cert, DNS, notification ---------------- */}
      <Panel title="Portal FQDN, certificate, DNS and notification" span={3} tone="quiet">
        <Stack gap={6}>
          <Bullets
            items={[
              <>A System Certificate with the <strong>Portal</strong> usage, bound to a <strong>Certificate Group Tag</strong></>,
              <>Issue it from a <strong>public CA</strong> — guests do not have your enterprise root</>,
              <>The portal FQDN and every serving PSN FQDN belong in the <strong>SAN</strong></>,
              <>Redirect to an IP and every guest gets a certificate warning</>,
              <>DNS must work pre-auth: <M>deny udp any any eq domain</M> in the redirect ACL, <M>permit udp any any eq domain</M> in the dACL</>,
              <>Portal <strong>8443</strong> (8000&ndash;8999), Sponsor <strong>8445</strong>, Blocked List <strong>8444</strong>. IPv6 is not supported on guest portals</>,
              <>Lose the PAN and Hotspot, self-registration and sponsor operations all fail; existing accounts still connect</>,
            ]}
          />
          <Note label="Notification" tone="good">
            Email at <M>… Guest Access &gt; Settings &gt; Guest Email Settings</M>,
            SMTP at <M>Administration &gt; System &gt; Settings &gt; SMTP Server</M>,
            SMS at <M>… Settings &gt; SMS Gateway</M> — an email-to-SMS relay or
            an HTTP GET/POST API using <M>$mobilenumber$</M> and{' '}
            <M>$message$</M>. Print is a sponsor-portal template.
          </Note>
        </Stack>
      </Panel>
    </Sheet>
  )
}
