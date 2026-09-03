'use client'

// ============================================================
// Topic — BYOD & Device Onboarding
//
// The selector is the sheet: single SSID, dual SSID and the MDM
// flow, each drawn as a ladder with its own authorization policy
// table and its own configuration.
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
  Flow,
  type LadderStep,
} from '../sheet-kit'

interface Mode {
  id: string
  label: string
  name: string
  badge: string
  gist: string
  actors: string[]
  steps: LadderStep[]
  policyHead: React.ReactNode[]
  policyRows: React.ReactNode[][]
  policyCaption: React.ReactNode
  code: { title: string; body: string }
  note: { label: string; tone?: 'signal' | 'warn' | 'good'; body: React.ReactNode }
}

const MODES: Mode[] = [
  {
    id: 'dual',
    label: 'Dual SSID',
    name: 'Dual-SSID onboarding',
    badge: 'Open SSID → secure SSID',
    gist:
      'Two SSIDs: one open network for enrolment and provisioning, one WPA2/WPA3-Enterprise network for access. The onboarding SSID is typically the guest SSID. The user starts on MAC filtering, authenticates on a guest portal with corporate credentials, is onboarded, then joins the second SSID with EAP-TLS.',
    actors: ['Client', 'WLC / AP', 'ISE'],
    steps: [
      { from: 0, to: 1, label: 'Associate to Open WLAN' },
      { from: 1, to: 2, label: 'MAC Filtering' },
      {
        from: 2,
        to: 1,
        label: 'ACCESS-ACCEPT + Redirect ACL & redirect string',
        tone: 'signal',
        sub: 'rule ① — CWA to a guest portal with BYOD on',
      },
      { from: 0, to: 1, label: 'Open web browser' },
      {
        from: 1,
        to: 2,
        label: 'Redirect to Guest Portal',
        sub: 'AD credentials → device name → Register → NSP → certificate',
      },
      { from: 2, to: 1, label: 'CoA', tone: 'signal' },
      {
        from: 0,
        to: 1,
        label: 'ReAssociate',
        sub: 'to the secure SSID — iOS needs a manual switch',
      },
      { from: 1, to: 2, label: 'EAP-TLS' },
      {
        from: 2,
        to: 1,
        label: 'ACCESS-ACCEPT + Employee Access ACL',
        tone: 'signal',
        sub: 'rule ②',
      },
      { from: 1, to: 0, label: 'Employee Access' },
    ],
    policyHead: ['', 'Rule', 'Condition', 'Permission'],
    policyRows: [
      ['', 'Guest', 'Use case = Guest Flow', 'Internet Only'],
      ['①', 'Guest Portal', 'MAC-Filtering WLAN', 'CWA'],
      ['', 'PEAP', 'EAP-Tunnel == PEAP', 'NSP'],
      ['②', 'Employee', 'EAP-Type == EAP-TLS & Registered Devices', 'Employee Access'],
      ['', 'Default', 'MAC-Filtering WLAN', 'Deny'],
    ],
    policyCaption: (
      <>
        Written out in ISE conditions, rule ② is{' '}
        <M>Radius:Called-Station-ID CONTAINS Corp-Secure</M> AND{' '}
        <M>EapAuthentication EQUALS EAP-TLS</M> AND{' '}
        <M>EndPoints:BYODRegistration EQUALS Yes</M>.
      </>
    ),
    code: {
      title: '9800 — both WLANs',
      body: `! ---------- SSID 1: open onboarding ----------
wlan BYOD-Onboard 10 BYOD-Onboard
 mac-filtering BYOD-MACFILTER
 no security ft adaptive
 no security wpa
 no security wpa wpa2
 no security wpa wpa2 ciphers aes
 no security wpa akm dot1x
 no shutdown
!
wireless profile policy POL-BYOD-ONBOARD
 vlan VLAN_ONBOARD
 aaa-override
 nac
 accounting-list BYOD-ACCT
 ipv4 dhcp required
 no shutdown
!
! ---------- SSID 2: secure corporate ----------
wlan Corp-Secure 11 Corp-Secure
 security dot1x authentication-list BYOD-DOT1X
 security wpa
 security wpa wpa2
 security wpa wpa2 ciphers aes
 security wpa akm dot1x
 no shutdown
!
wireless profile policy POL-CORP-SECURE
 vlan VLAN_CORP
 aaa-override
 nac
 accounting-list BYOD-ACCT
 ipv4 dhcp required
 no shutdown
!
wireless tag policy TAG-BYOD
 wlan BYOD-Onboard policy POL-BYOD-ONBOARD
 wlan Corp-Secure  policy POL-CORP-SECURE`,
    },
    note: {
      label: 'The manual hop is the weak point',
      tone: 'warn',
      body: (
        <>
          The wizard prompts iOS users to connect to the new network themselves.
          Enable <strong>Fast SSID Change</strong> on the controller and put
          visible guidance in front of the user before they log in, or the flow
          dies at step 7. The upside is that the secure SSID can be EAP-TLS only.
        </>
      ),
    },
  },

  {
    id: 'single',
    label: 'Single SSID',
    name: 'Single-SSID onboarding',
    badge: 'One SSID, PEAP then EAP-TLS',
    gist:
      'One WPA2/WPA3-Enterprise SSID does enrolment, provisioning and access. The employee first authenticates with PEAP-MSCHAPv2 using AD credentials; ISE recognises the tunnel type, redirects to the BYOD portal with no second login, onboards, and the same SSID is reconfigured for EAP-TLS. This is the ISE-specific trick: the credential is taken from the initial EAP authentication, so there is no web portal login at all.',
    actors: ['Client', 'WLC / AP', 'ISE'],
    steps: [
      { from: 0, to: 1, label: 'Associate to Secured WLAN' },
      { from: 1, to: 2, label: 'PEAP-MSCHAPv2' },
      {
        from: 2,
        to: 1,
        label: 'ACCESS-ACCEPT + Redirect ACL & redirect string',
        tone: 'signal',
        sub: 'rule ① — Native Supplicant Provisioning, action=nsp',
      },
      { from: 0, to: 1, label: 'Open web browser' },
      {
        from: 1,
        to: 2,
        label: 'Redirect to BYOD Portal',
        sub: 'no second login — the identity came from 802.1X',
      },
      { from: 2, to: 1, label: 'CoA', tone: 'signal' },
      {
        from: 0,
        to: 1,
        label: 'ReAssociate',
        sub: 'same SSID; iOS reconnects automatically here',
      },
      { from: 1, to: 2, label: 'EAP-TLS' },
      {
        from: 2,
        to: 1,
        label: 'ACCESS-ACCEPT + Employee Access ACL',
        tone: 'signal',
        sub: 'rule ②',
      },
      { from: 1, to: 0, label: 'Employee Access' },
    ],
    policyHead: ['', 'Rule', 'Condition', 'Permission'],
    policyRows: [
      ['①', 'PEAP', 'EAP-Tunnel == PEAP', 'NSP — Native Supplicant Provisioning'],
      ['②', 'Employee', 'EAP-Type == EAP-TLS & Registered Devices', 'Employee Access'],
      ['', 'Default', '', 'Deny'],
    ],
    policyCaption: (
      <>
        In ISE conditions: rule ① is{' '}
        <M>EapAuthentication EQUALS EAP-MSCHAPv2</M> AND the employee AD group;
        rule ② is <M>EapAuthentication EQUALS EAP-TLS</M> AND{' '}
        <M>BYODRegistration EQUALS Yes</M> AND{' '}
        <M>CERTIFICATE:Subject Alternative Name EQUALS Radius:Calling-Station-ID</M>.
      </>
    ),
    code: {
      title: '9800 — one secure WLAN, plus the redirect ACL',
      body: `ip access-list extended REDIRECT-BYOD
 deny   ip any host 10.1.100.10
 deny   ip host 10.1.100.10 any
 deny   udp any any eq domain
 deny   udp any eq domain any
 permit tcp any any eq www
 permit tcp any any eq 443
!
aaa authentication dot1x BYOD-DOT1X group ISE-GROUP
aaa accounting identity BYOD-ACCT start-stop group ISE-GROUP
!
aaa server radius dynamic-author
 client 10.1.100.10 server-key SuperSecret123
 auth-type any
!
wlan Corp-Secure 11 Corp-Secure
 security dot1x authentication-list BYOD-DOT1X
 security wpa
 security wpa wpa2
 security wpa wpa2 ciphers aes
 security wpa akm dot1x
 no shutdown
!
wireless profile policy POL-CORP-SECURE
 vlan VLAN_CORP
 aaa-override
 nac
 accounting-list BYOD-ACCT
 ipv4 dhcp required
 no shutdown
!
ip http server
ip http secure-server`,
    },
    note: {
      label: 'What you trade away',
      body: (
        <>
          One SSID to manage and no manual network switch — but the SSID has to
          keep accepting PEAP for onboarding, which weakens it, and the redirect
          ACL has to be applied on an encrypted WLAN. Allowing both PEAP and
          EAP-TLS is an ISE <strong>Allowed Protocols</strong> decision, not a
          controller one.
        </>
      ),
    },
  },

  {
    id: 'mdm',
    label: 'MDM / UEM',
    name: 'MDM and UEM integration',
    badge: 'Compliance as a condition',
    gist:
      'Onboarding proves the device belongs to an employee. MDM proves it is managed and compliant. ISE queries the MDM or UEM server over its API for registration and compliance state, uses the answer as an authorization condition, and re-evaluates with a CoA when the state changes or a poll finds the device on the non-compliant list.',
    actors: ['Device', 'NAD', 'ISE', 'MDM / UEM'],
    steps: [
      { from: 0, to: 1, label: 'Managed endpoint connects' },
      { from: 1, to: 2, label: 'RADIUS Access-Request' },
      {
        from: 2,
        to: 2,
        label: 'CAP reads GUID / UDID / Management ID from the certificate',
        sub: 'Subject CN or SAN:URI',
      },
      { from: 2, to: 3, label: 'API query — registration and compliance state' },
      {
        from: 2,
        to: 1,
        label: 'Not registered → MDM Redirect to the MDM portal',
        tone: 'signal',
      },
      { from: 0, to: 3, label: 'User enrols and the device becomes compliant' },
      { from: 3, to: 2, label: 'State change, or ISE’s next poll', tone: 'muted', dashed: true },
      { from: 2, to: 1, label: 'CoA → reauth → full access', tone: 'signal' },
    ],
    policyHead: ['Condition', 'Result'],
    policyRows: [
      [
        <><M key="a">MDM:MDMServerReachable EQUALS Reachable</M> AND <M>MDM:DeviceRegistrationStatus EQUALS UnRegistered</M></>,
        'MDM_Redirect_Profile',
      ],
      [
        <><M key="b">MDM:DeviceRegistrationStatus EQUALS Registered</M> AND <M>MDM:DeviceComplianceStatus EQUALS NonCompliant</M></>,
        'Quarantine_Profile',
      ],
      [
        <><M key="c">MDM:DeviceComplianceStatus EQUALS Compliant</M> AND <M>MDM:PinLockStatus EQUALS On</M> AND <M>MDM:DiskEncryptionStatus EQUALS On</M></>,
        'Full_Access',
      ],
    ],
    policyCaption: (
      <>
        Other attributes worth conditioning on:{' '}
        <M>JailBroken</M>, <M>DaysSinceLastCheckin</M>, <M>Manufacturer</M>,{' '}
        <M>Model</M>, <M>OsVersion</M>, <M>IMEI</M>, <M>MEID</M>,{' '}
        <M>SerialNumber</M>, <M>UDID</M>, <M>PhoneNumber</M>,{' '}
        <M>MDMServerName</M>, <M>MDMFailureReason</M>. Confirm the exact spelling
        in your release at{' '}
        <M>Policy &gt; Policy Elements &gt; Dictionaries &gt; System &gt; MDM</M>{' '}
        — it has changed between releases.
      </>
    ),
    code: {
      title: 'Where it is configured, and the five steps the user sees',
      body: `Add the server
  Administration > Network Resources
    > Device Management Servers
Import its certificate
  Administration > System > Certificates
    > Trusted Certificates > Import
MDM portal
  Administration > Device Portal Management
    > Mobile Device Management
Reports
  Operations > Reports > Endpoints and Users
    > Mobile Device Management

Redirect URL format:
  https://[ip:port]/mdmportal/gateway
    ?sessionID=SessionIdValue
    &portal=[PortalID]&action=mdm

The user journey:
  1  Register with ISE
  2  Internet access granted
  3  Register with MDM
  4  Comply with MDM policy
  5  Corporate access allowed`,
    },
    note: {
      label: 'Fail open or fail closed, deliberately',
      tone: 'warn',
      body: (
        <>
          <M>MDMServerReachable</M> is the attribute that decides what happens
          when the MDM API is down — write a rule for it rather than discovering
          the default. The compliance cache is configurable from 1 minute to 7
          days; Cisco warns that a short polling interval hurts ISE performance
          because every poll is a bulk query. <strong>API v3</strong> (ISE 3.1+)
          adds GUID support for endpoints with random, changing MAC addresses.
        </>
      ),
    },
  },
]

export default function ByodSheet() {
  const [modeId, setModeId] = useState(MODES[0].id)
  const m = MODES.find(x => x.id === modeId) ?? MODES[0]

  return (
    <Sheet>
      {/* ---------------- what onboarding does ---------------- */}
      <Panel title="What onboarding actually does" span={4}>
        <Stack gap={7}>
          <Prose>
            Onboarding takes an unmanaged personal device from unknown on the
            network to holding a unique client certificate and a supplicant
            profile configured for EAP-TLS. Three things happen, then a CoA
            re-authorizes the session.
          </Prose>
          <Flow
            steps={[
              { label: 'Connect', detail: 'open or PEAP' },
              { label: 'Register', detail: 'name the device' },
              { label: 'Provision', detail: 'NSP wizard', tone: 'signal' },
              { label: 'Enrol', detail: 'SCEP / EST' },
              { label: 'Secure SSID', detail: 'EAP-TLS', tone: 'signal' },
            ]}
          />
          <KV
            items={[
              [
                'Registration',
                <>The MAC is recorded against the employee identity with a device name — <M>BYODRegistration = Yes</M>, endpoint joins <M>RegisteredDevices</M></>,
              ],
              [
                'Provisioning',
                'A supplicant profile — SSID, EAP method, server-certificate validation — is written into the OS native supplicant',
              ],
              [
                'Enrolment',
                'A client certificate is issued, embedded with the device MAC address and the employee username',
              ],
              [
                'Then',
                <>CoA, reauthenticate, and the authorization policy sees an EAP-TLS session from a registered device</>,
              ],
            ]}
            labelWidth={70}
          />
          <Note label="Registration is not instant">
            <M>DeviceRegistrationStatus</M> takes <strong>20 minutes</strong> to
            move from <em>pending</em> to <em>registered</em>. Do not build a
            rule that assumes it flips the moment the wizard finishes.
          </Note>
        </Stack>
      </Panel>

      {/* ---------------- the wizard ---------------- */}
      <Panel title="Native Supplicant Provisioning — where the wizard comes from" span={4} tone="signal">
        <Stack gap={6}>
          <Table
            head={['OS', 'Provisioning path', 'What bites']}
            widths={['16%', '38%', '46%']}
            rows={[
              [
                'iOS',
                'Apple Over-The-Air profile delivery, straight from ISE. No app download.',
                'Certificates are issued twice — a short-lived enrolment cert, then the EAP-TLS identity. The user must clear Safari history and website data first.',
              ],
              [
                'Windows',
                'Network Setup Assistant, downloaded from the PSN and run locally.',
                'NSA cannot be installed without administrative privileges. Not supported with Cisco Network Access Manager.',
              ],
              [
                'macOS',
                'Network Setup Assistant, downloaded from the PSN.',
                'From macOS 10.15 the user must explicitly allow the wizard download.',
              ],
              [
                'Android',
                'Redirected to Google Play for Cisco Network Setup Assistant, then run it.',
                <>Enrols over <strong>EST</strong>, not SCEP — permit <M>TCP 8084</M> to the PSN. Android 11+, or enable Broadcast SSID.</>,
              ],
            ]}
          />
          <Bullets
            items={[
              <>Native Supplicant Profile and wizard packages at <M>Work Centers &gt; BYOD &gt; Client Provisioning &gt; Resources</M>; the <strong>Client Provisioning Policy</strong> picks one per OS</>,
              <>Portal at <M>Administration &gt; Device Portal Management &gt; BYOD</M> — a new or edited portal must be <strong>authorized for use</strong> before it works</>,
            ]}
          />
        </Stack>
      </Panel>

      {/* ---------------- CA modes ---------------- */}
      <Panel title="Certificates — internal CA, external CA, SCEP and EST" span={4} tone="quiet">
        <Stack gap={6}>
          <Table
            head={['CA mode', 'Shape', 'Why you would']}
            widths={['26%', '38%', '36%']}
            rows={[
              [
                'ISE self-signed CA',
                'ISE is its own root and issues straight to endpoints',
                'Simplest. Endpoint certs are trusted by ISE and nothing else',
              ],
              [
                'Sub-CA of enterprise PKI',
                'Enterprise root → ISE as a subordinate CA, issuing to endpoints',
                'Certificates chain to a root the rest of the estate already trusts',
              ],
              [
                'SCEP to enterprise CA',
                'ISE is not a CA at all — it proxies SCEP to the enterprise CA as an RA',
                'The PKI team keeps issuance. Most work to deploy',
              ],
            ]}
          />
          <KV
            items={[
              ['Hierarchy', <>Root CA on the PAN → Node CA → Endpoint CA and OCSP responder per PSN</>],
              ['Templates', <M key="d">Administration &gt; System &gt; Certificates &gt; Certificate Authority &gt; Certificate Templates</M>],
              ['Fields', <>CN <M>$UserName$</M>, OU, O, L, ST, C; SAN normally <strong>MAC Address</strong>; key type and size; SCEP RA profile; validity; EKU</>],
              ['External CA', <>An <strong>SCEP RA Profile</strong> under <M>… &gt; External CA Settings</M>, referenced from the template</>],
              ['Limit', <><strong>No certificate chain longer than three certificates.</strong></>],
            ]}
            labelWidth={74}
          />
          <Note label="OU as a segmentation lever" tone="good">
            Put a distinct OU in the template and match on{' '}
            <M>CERTIFICATE:Organizational Unit</M> in authorization policy —
            device classes separated without separate SSIDs.
          </Note>
        </Stack>
      </Panel>

      {/* ---------------- THE SELECTOR ---------------- */}
      <Panel
        title="Onboarding modes"
        span={12}
        right={
          <span className="normal-case tracking-normal">
            Flow · authorization policy · configuration
          </span>
        }
      >
        <Stack gap={8}>
          <div className="flex items-center justify-between gap-4">
            <Selector
              options={MODES.map(x => ({ id: x.id, label: x.label, hint: x.gist }))}
              value={modeId}
              onChange={setModeId}
            />
            <Pill tone="neutral">{m.badge}</Pill>
          </div>

          <div className="grid grid-cols-12 gap-3 border-t border-ink-200 pt-2">
            <div className="col-span-4">
              <h4
                className="text-[12px] font-bold tracking-tight text-ink-950"
                style={{ fontFamily: 'var(--font-heading)' }}
              >
                {m.name}
              </h4>
              <div className="mt-1">
                <Prose>{m.gist}</Prose>
              </div>
              <div className="mt-2">
                <Note label={m.note.label} tone={m.note.tone}>
                  {m.note.body}
                </Note>
              </div>
            </div>

            <div className="col-span-4">
              <div
                className="mb-1 border-b border-ink-300 pb-[2px] text-[9px] font-bold uppercase tracking-[0.11em] text-ink-950"
                style={{ fontFamily: 'var(--font-heading)' }}
              >
                The flow
              </div>
              <Ladder actors={m.actors} steps={m.steps} />
            </div>

            <div className="col-span-4">
              <Split
                cols={1}
                parts={[
                  {
                    title: 'Authorization policy',
                    children: (
                      <Stack gap={4}>
                        <Table head={m.policyHead} rows={m.policyRows} />
                        <Prose>{m.policyCaption}</Prose>
                      </Stack>
                    ),
                  },
                ]}
              />
              <div className="mt-2">
                <Code title={m.code.title} code={m.code.body} maxHeight={224} />
              </div>
            </div>
          </div>
        </Stack>
      </Panel>

      {/* ---------------- pre-auth allow list ---------------- */}
      <Panel
        title="Android pre-auth allow-list"
        kicker="Play Store must be reachable before onboarding"
        span={4}
      >
        <Stack gap={6}>
          <div className="grid grid-cols-2 gap-2">
            <Code
              title="9800 URL filter — BYOD-Filter, PRE-AUTH, PERMIT"
              code={`gvt1.com
ggpht.com
.google.com
gstatic.com
.appspot.com
.googleapis.com
market.android.com
accounts.youtube.com
android.pool.ntp.org
.google-analytics.com
.googleusercontent.com`}
            />
            <Code
              title="ACL_WEBAUTH_REDIRECT > URL List"
              code={`google.com
gvt1.com
ggpht.com
gstatic.com
appspot.com
googleapis.com
market.android.com
accounts.youtube.com
android.pool.ntp.org
google-analytics.com
googleusercontent.com`}
            />
          </div>
          <Note label="Also open 8443 and 8084">
            The pre-auth dACL must permit DNS, DHCP, and{' '}
            <M>tcp any host &lt;PSN&gt; eq 8443</M> for the portal. Add{' '}
            <M>eq 8084</M> for Android EST enrolment, and{' '}
            <M>permit tcp any any eq 443</M> so Google Play works at all —
            without it the Android user never gets the Network Setup Assistant
            and the flow simply stops.
          </Note>
        </Stack>
      </Panel>

      {/* ---------------- MAC randomisation ---------------- */}
      <Panel title="MAC randomisation and how ISE copes" span={4}>
        <Stack gap={6}>
          <Prose>
            Windows 10, Android 10 and iOS all offer a random hardware address
            per network. The onboarding certificate&rsquo;s{' '}
            <strong>Subject Alternative Name</strong> holds the MAC learned
            during onboarding, so a device that randomises on the secure SSID
            presents a certificate whose SAN no longer matches its
            Calling-Station-ID.
          </Prose>
          <KV
            items={[
              [
                'The check',
                <><M>MAC_in_SAN</M> —{' '}
                <M>CERTIFICATE:Subject Alternative Name EQUALS Radius:Calling-Station-ID</M></>,
              ],
              [
                'Cisco&rsquo;s fix',
                <>For Android 10, <strong>remove <M>BYOD_is_Registered</M> and{' '}
                <M>MAC_in_SAN</M> from the rule</strong> — Android makes a new
                random MAC per connection profile</>,
              ],
              [
                'Spotting one',
                <>Bit <M>b1</M> of the first octet is the locally-administered
                bit, so a randomised MAC&rsquo;s second hex digit is{' '}
                <M>2</M>, <M>6</M>, <M>A</M> or <M>E</M> — <M>32-28-6D-…</M>,{' '}
                <M>0A-13-A8-…</M>, <M>AE-83-37-…</M></>,
              ],
              [
                'Long term',
                <>MDM API v3 replaces the MAC with a <strong>GUID</strong> in the
                certificate SAN or CN</>,
              ],
            ]}
            labelWidth={72}
          />
          <Note label="Do not just delete the check" tone="warn">
            <M>MAC_in_SAN</M> is what stops a certificate being copied to another
            device. Removing it for an OS that randomises is a documented
            workaround, not a free change — narrow the rule to that OS rather
            than dropping the condition everywhere.
          </Note>
        </Stack>
      </Panel>

      {/* ---------------- portals and state ---------------- */}
      <Panel title="Portals, registration state and blocking" span={4} tone="quiet">
        <Stack gap={6}>
          <Table
            head={['Portal', 'Port', 'What it is for']}
            widths={['26%', '12%', '62%']}
            rows={[
              ['BYOD', '8443', 'The onboarding wizard — welcome, device information, installation, success'],
              ['My Devices', '8443', 'Employees add devices that cannot browse, and mark their own Lost or Stolen'],
              ['Cert Provisioning', '8443', 'Single or bulk CSV certificate requests for devices that cannot onboard'],
              ['Blocked List', '8444', 'Where a Lost or Stolen device lands when it connects'],
            ]}
          />
          <Split
            cols={2}
            parts={[
              {
                title: 'BYODRegistration',
                children: (
                  <Bullets
                    items={[
                      <><M>Unknown</M> — never been through a BYOD flow</>,
                      <><M>Yes</M> — been through it and registered</>,
                      <><M>No</M> — been through it but deleted since</>,
                    ]}
                  />
                ),
              },
              {
                title: 'DeviceRegistrationStatus',
                children: (
                  <Bullets
                    items={[
                      <><M>Registered</M> / <M>Pending</M> / <M>NotRegistered</M></>,
                      <><M>Lost</M> — blocked, certificate <strong>not</strong> revoked, reinstatable</>,
                      <><M>Stolen</M> — blocked and the <strong>certificate revoked</strong></>,
                    ]}
                  />
                ),
              },
            ]}
          />
          <Note label="The cap people forget">
            <M>Administration &gt; Device Portal Management &gt; Settings</M> —
            employees are restricted to <strong>5 registered devices</strong> by
            default. When the cap is hit the portal shows the device list and
            makes the user delete one before continuing.
          </Note>
        </Stack>
      </Panel>
    </Sheet>
  )
}
