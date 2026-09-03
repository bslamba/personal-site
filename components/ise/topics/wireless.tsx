'use client'

// ============================================================
// Topic — Wireless Access & the Catalyst 9800
//
// The interactive panel is the wireless authentication type
// explorer: 802.1X, MAC filtering, CWA and LWA, each with the
// 9800 configuration that enables it and what ISE has to send
// back for it to work.
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
} from '../sheet-kit'

interface AuthType {
  id: string
  label: string
  name: string
  layer: string
  gist: string
  iseReturns: React.ReactNode[]
  isePath: React.ReactNode
  code: { title: string; body: string }
  note: { label: string; tone?: 'signal' | 'warn' | 'good'; body: React.ReactNode }
}

const TYPES: AuthType[] = [
  {
    id: 'dot1x',
    label: '802.1X',
    name: '802.1X — WPA2 / WPA3 Enterprise',
    layer: 'Layer 2 · EAP over 802.11',
    gist:
      'The supplicant proves an identity to ISE before the 4-way handshake ever runs. The WLC is the authenticator: it relays EAP over RADIUS and never sees the credential. WPA3-Enterprise changes the AKM and the cipher suite, not the RADIUS exchange.',
    iseReturns: [
      <>Access-Accept plus <M>EAP-Success</M>, with the MSK in <M>MS-MPPE-Recv-Key</M> / <M>MS-MPPE-Send-Key</M></>,
      <>VLAN — <M>Tunnel-Type=VLAN</M>, <M>Tunnel-Medium-Type=802</M>, <M>Tunnel-Private-Group-ID</M></>,
      <>An ACL <strong>by name</strong> — the ACL must already exist on the controller. The <M>DACL Name</M> field of an authorization profile is wired-only, and <M>Airespace ACL Name</M> is AireOS-only</>,
      <>Optionally an SGT, <M>Session-Timeout</M> and <M>Termination-Action</M></>,
    ],
    isePath: (
      <>
        <M>Policy &gt; Policy Sets</M> — Allowed Protocols must permit the EAP
        method the supplicant offers. Match with the built-in{' '}
        <M>Wireless_802.1X</M> condition.
      </>
    ),
    code: {
      title: '9800 — WPA2-Enterprise WLAN',
      body: `wlan Corp-Secure 11 Corp-Secure
 security dot1x authentication-list CORP-DOT1X
 security wpa
 security wpa wpa2
 security wpa wpa2 ciphers aes
 security wpa akm dot1x
 no shutdown
!
wireless profile policy POL-CORP
 vlan VLAN_CORP
 aaa-override
 nac
 accounting-list CORP-ACCT
 ipv4 dhcp required
 no shutdown`,
    },
    note: {
      label: 'Still set nac',
      body: (
        <>
          <M>aaa-override</M> is obviously needed for VLAN and ACL assignment.{' '}
          <M>nac</M> is needed even on a plain dot1x WLAN if you ever want a CoA
          — posture, profiler reprofiling or ANC — to land.
        </>
      ),
    },
  },

  {
    id: 'mab',
    label: 'MAB / MAC filtering',
    name: 'MAC filtering — the wireless form of MAB',
    layer: 'Layer 2 · no EAP at all',
    gist:
      'The WLAN carries no Layer 2 security, so the controller has nothing to authenticate with except the client MAC. It sends that MAC as both the username and the password in a RADIUS Access-Request against a named network authorization list. This is the substrate every CWA and dual-SSID BYOD flow is built on.',
    iseReturns: [
      <>Access-Accept with a permit result, or</>,
      <>Access-Accept carrying <M>url-redirect-acl</M> and <M>url-redirect</M> — that is CWA</>,
      <>Access-Reject if the MAC is unknown <em>and</em> the authentication rule was left at the default</>,
    ],
    isePath: (
      <>
        Authentication rule on <M>Wireless_MAB</M> → <strong>Internal Endpoints</strong>,
        and set <strong>Options → If user not found: CONTINUE</strong>. Without
        that, an unknown guest MAC is rejected before authorization is ever
        evaluated.
      </>
    ),
    code: {
      title: '9800 — open WLAN with MAC filtering',
      body: `aaa authorization network CWAauthz group ISE-GROUP
!
wlan CWA-GUEST 4 CWA-GUEST
 mac-filtering CWAauthz
 no security ft adaptive
 no security wpa
 no security wpa wpa2
 no security wpa wpa2 ciphers aes
 no security wpa akm dot1x
 no shutdown
!
wireless profile policy CWA-POLICY-PROFILE
 vlan VLAN_GUEST
 aaa-override
 nac
 accounting-list CWAacct
 ipv4 dhcp required
 no shutdown`,
    },
    note: {
      label: 'The list name is the link',
      body: (
        <>
          <M>mac-filtering CWAauthz</M> names an{' '}
          <M>aaa authorization network</M> list. If that list does not exist, the
          WLAN accepts clients locally and never asks ISE anything.
        </>
      ),
    },
  },

  {
    id: 'cwa',
    label: 'Central Web Auth',
    name: 'Central Web Authentication (CWA)',
    layer: 'Layer 2 first, portal second',
    gist:
      'CWA is initiated at Layer 2 — MAC filtering (or 802.1X) runs first, and ISE answers with a redirect instead of a verdict. The portal lives on ISE, credential processing happens on ISE, and a CoA is what finally moves the session to full access.',
    iseReturns: [
      <><M>cisco-av-pair = url-redirect-acl=REDIRECT</M> — the name of an ACL that must already exist on the controller, character for character</>,
      <><M>cisco-av-pair = url-redirect=https://&lt;PSN-FQDN&gt;:8443/portal/gateway?sessionId=…&amp;portal=&lt;id&gt;&amp;action=cwa</M></>,
      <>After the portal succeeds: <strong>CoA-Reauth</strong>, then a second Access-Accept with the permit profile and no redirect</>,
    ],
    isePath: (
      <>
        <M>Policy &gt; Policy Elements &gt; Results &gt; Authorization &gt; Authorization Profiles</M>{' '}
        → <strong>Common Tasks → Web Redirection → Centralized Web Auth</strong>,
        ACL name, portal.
      </>
    ),
    code: {
      title: '9800 — redirect ACL, CoA listener and the policy profile',
      body: `ip access-list extended REDIRECT
 deny   ip any host 10.1.100.10
 deny   ip host 10.1.100.10 any
 deny   udp any any eq domain
 deny   udp any eq domain any
 permit tcp any any eq www
 permit tcp any any eq 443
!
aaa server radius dynamic-author
 client 10.1.100.10 server-key SuperSecret123
 auth-type any
!
aaa accounting identity CWAacct start-stop group ISE-GROUP
!
wireless profile policy CWA-POLICY-PROFILE
 aaa-override
 nac
 accounting-list CWAacct
!
ip http server
ip http secure-server`,
    },
    note: {
      label: 'Both switches, or nothing happens',
      body: (
        <>
          Cisco is explicit: <strong>NAC and AAA override must both be
          configured in the policy profile</strong> for CWA. <M>nac</M> is what
          lets the controller act on the CoA; <M>aaa-override</M> is what lets it
          apply the redirect at all. And the reap timer — 3 × the init-state
          timeout + 5 s — deauthenticates a client that never types anything.
        </>
      ),
    },
  },

  {
    id: 'lwa',
    label: 'Local Web Auth',
    name: 'Local Web Authentication (LWA)',
    layer: 'Layer 3 · portal on the controller',
    gist:
      'The portal is hosted on the 9800 itself, at Layer 3, and the redirect URL is statically configured rather than pushed by RADIUS. With external authentication the controller collects the credentials and forwards them to ISE as an ordinary PAP Access-Request. There is no CoA in a plain LWA flow — the controller decides.',
    iseReturns: [
      <>A plain <strong>Access-Accept</strong> or <strong>Access-Reject</strong> for a PAP request carrying the typed username and password</>,
      <>VLAN or ACL attributes if you want them, but no redirect and no CoA</>,
      <><strong>None of the ISE guest lifecycle</strong> — no guest types, no sponsor flow, no BYOD chaining, no device registration</>,
    ],
    isePath: (
      <>
        No portal configuration in ISE at all. The controller needs a{' '}
        <M>parameter-map type webauth</M>; ISE is only a credential oracle.{' '}
        <M>type consent</M> is AUP-only, <M>type webconsent</M> is credentials
        and AUP.
      </>
    ),
    code: {
      title: '9800 — LWA with external authentication',
      body: `parameter-map type webauth global
 virtual-ip ipv4 192.0.2.1
 trustpoint LWA-TRUSTPOINT
 webauth-http-enable
!
parameter-map type webauth LWA-PMAP
 type webauth
 banner text ^Welcome to Guest Wi-Fi^
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
    note: {
      label: 'Two certificates, not one',
      tone: 'warn',
      body: (
        <>
          CWA needs one certificate — on the portal. LWA needs one on the
          controller <em>and</em> one on whatever hosts the login page. That is
          the usual reason people abandon LWA once they have ISE.
        </>
      ),
    },
  },
]

export default function WirelessSheet() {
  const [typeId, setTypeId] = useState(TYPES[0].id)
  const t = TYPES.find(x => x.id === typeId) ?? TYPES[0]

  return (
    <Sheet>
      {/* ---------------- wireless vs wired ---------------- */}
      <Panel
        title="Wireless 802.1X is not wired 802.1X"
        kicker="The WLC is the authenticator"
        span={5}
      >
        <Stack gap={6}>
          <Prose>
            The AP is a radio, not an authenticator. It tunnels the
            client&rsquo;s EAPOL frames to the controller over CAPWAP, and the{' '}
            <strong>9800 WLC</strong> speaks RADIUS to ISE. On success ISE hands
            the controller the MSK, and only then does the 802.11i 4-way
            handshake run.
          </Prose>
          <Ladder
            actors={['Client', '9800 WLC', 'ISE']}
            steps={[
              { from: 0, to: 1, label: 'Association request', sub: 'RSN IE advertises the 802.1X AKM; the AP relays over CAPWAP' },
              { from: 1, to: 0, label: 'EAPOL · EAP-Request/Identity' },
              { from: 1, to: 2, label: 'RADIUS Access-Request · EAP-Message', sub: 'NAS-Port-Type 19 · SSID in Called-Station-ID' },
              { from: 2, to: 1, label: 'Access-Challenge × n — the EAP method runs', tone: 'muted' },
              { from: 2, to: 1, label: 'Access-Accept · EAP-Success · MS-MPPE keys', tone: 'signal', sub: 'the MSK rides in MS-MPPE-Recv-Key / Send-Key' },
              { from: 1, to: 0, label: 'EAPOL EAP-Success', sub: 'PMK = first 256 bits of the MSK' },
              { from: 1, to: 0, label: '4-way handshake M1–M4 → PTK, GTK, RUN', tone: 'signal' },
            ]}
          />
          <Note label="There is no port to shut">
            The association <em>is</em> the port, so{' '}
            <M>bounce-host-port</M> and <M>disable-host-port</M> are meaningless
            here — CoA-Reauth and Disconnect-Request are the only two that
            matter.
          </Note>
        </Stack>
      </Panel>

      {/* ---------------- what ISE sees ---------------- */}
      <Panel title="What ISE sees differently" kicker="RADIUS attributes" span={4} tone="signal">
        <Stack gap={6}>
          <Table
            head={['Attribute', 'Wired switch', 'Catalyst 9800']}
            widths={['32%', '32%', '36%']}
            rows={[
              [
                <M key="a">NAS-Port-Type</M>,
                <>15 — Ethernet</>,
                <><strong>19</strong> — Wireless-IEEE-802.11</>,
              ],
              [
                <M key="b">Called-Station-ID</M>,
                'Switch or port MAC',
                'AP radio MAC + :SSID',
              ],
              [
                <M key="c">Calling-Station-ID</M>,
                'Endpoint MAC',
                'Endpoint MAC — often randomised per SSID',
              ],
              [
                <M key="d">NAS-Port-Id</M>,
                'The interface name',
                'Not meaningful',
              ],
              [
                'Access ACL',
                'Downloadable ACL, pushed by ISE',
                'A named ACL that must already exist on the WLC',
              ],
              [
                'CoA verbs used',
                'Reauth · bounce · disable · disconnect',
                'Reauth and disconnect only',
              ],
              [
                'Built-in condition',
                <M key="e">Wired_802.1X</M>,
                <M key="f">Wireless_802.1X</M>,
              ],
            ]}
          />
          <Note label="The SSID is not free">
            <M>Radius:Called-Station-ID CONTAINS &lt;SSID&gt;</M> is how every
            per-SSID authorization rule is written, and the SSID only appears in
            that attribute if you configure{' '}
            <M>radius-server attribute wireless authentication call-station-id ap-macaddress-ssid</M>.
            Set the accounting form too.
          </Note>
        </Stack>
      </Panel>

      {/* ---------------- the 9800 model ---------------- */}
      <Panel title="The 9800 configuration model" kicker="Profiles and tags" span={3} tone="quiet">
        <Stack gap={6}>
          <Table
            head={['Object', 'What it carries']}
            widths={['40%', '60%']}
            rows={[
              ['WLAN profile', 'SSID, L2 security, AKM, the MAC-filtering and dot1x list names'],
              ['Policy profile', <>VLAN, <M>aaa-override</M>, <M>nac</M>, <M>accounting-list</M>, switching mode</>],
              ['Policy tag', 'Binds WLAN profile ↔ policy profile'],
              ['Site tag', 'AP join profile, flex profile, local-site flag'],
              ['RF tag', 'RF profiles — nothing to do with ISE'],
              ['AP', 'Carries exactly one of each tag'],
            ]}
          />
          <KV
            items={[
              ['AAA', <M key="g">Configuration &gt; Security &gt; AAA</M>],
              ['CoA', <>…<M>&gt; AAA Advanced &gt; CoA</M></>],
              ['Override + NAC', <>Policy profile → <strong>Advanced</strong></>],
              ['Redirect ACL', <M key="i">Configuration &gt; Security &gt; ACL</M>],
            ]}
            labelWidth={72}
          />
        </Stack>
      </Panel>

      {/* ---------------- THE SELECTOR ---------------- */}
      <Panel
        title="Wireless authentication types"
        span={12}
        right={
          <span className="normal-case tracking-normal">
            Pick a type — 9800 configuration and what ISE must return
          </span>
        }
      >
        <Stack gap={8}>
          <div className="flex items-center justify-between gap-4">
            <Selector
              options={TYPES.map(x => ({ id: x.id, label: x.label, hint: x.gist }))}
              value={typeId}
              onChange={setTypeId}
            />
            <Pill tone="neutral">{t.layer}</Pill>
          </div>

          <div className="grid grid-cols-12 gap-3 border-t border-ink-200 pt-2">
            <div className="col-span-4">
              <h4
                className="text-[12px] font-bold tracking-tight text-ink-950"
                style={{ fontFamily: 'var(--font-heading)' }}
              >
                {t.name}
              </h4>
              <div className="mt-1">
                <Prose>{t.gist}</Prose>
              </div>
              <div className="mt-2">
                <Note label={t.note.label} tone={t.note.tone}>
                  {t.note.body}
                </Note>
              </div>
            </div>

            <div className="col-span-4">
              <Split
                cols={1}
                parts={[
                  {
                    title: 'What ISE must return',
                    children: <Bullets items={t.iseReturns} />,
                  },
                  {
                    title: 'Where it is configured in ISE',
                    children: <Prose>{t.isePath}</Prose>,
                  },
                ]}
              />
            </div>

            <div className="col-span-4">
              <Code title={t.code.title} code={t.code.body} />
            </div>
          </div>
        </Stack>
      </Panel>

      {/* ---------------- full config ---------------- */}
      <Panel
        title="Catalyst 9800 — a complete dot1x WLAN with AAA and CoA"
        kicker="Copy-pasteable"
        span={7}
      >
        <div className="grid grid-cols-2 gap-2">
          <Code
            title="AAA, RADIUS and dynamic authorization"
            code={`aaa new-model
aaa session-id common
!
radius server ISE-PSN-1
 address ipv4 10.1.100.10 auth-port 1812 acct-port 1813
 timeout 5
 retransmit 3
 key SuperSecret123
!
aaa group server radius ISE-GROUP
 server name ISE-PSN-1
 ip radius source-interface Vlan10
 deadtime 5
!
aaa authentication dot1x CORP-DOT1X group ISE-GROUP
aaa authorization network CORP-AUTHZ group ISE-GROUP
aaa accounting identity CORP-ACCT start-stop group ISE-GROUP
!
aaa server radius dynamic-author
 client 10.1.100.10 server-key SuperSecret123
 auth-type any
!
radius-server attribute wireless authentication call-station-id ap-macaddress-ssid
radius-server attribute wireless accounting call-station-id ap-macaddress-ssid
!
ip http server
ip http secure-server`}
          />
          <Code
            title="WLAN, policy profile and tags"
            code={`wlan Corp-Secure 11 Corp-Secure
 security dot1x authentication-list CORP-DOT1X
 security wpa
 security wpa wpa2
 security wpa wpa2 ciphers aes
 security wpa akm dot1x
 no shutdown
!
wireless profile policy POL-CORP
 description "802.1X corporate policy profile"
 vlan VLAN_CORP
 aaa-override
 nac
 accounting-list CORP-ACCT
 ipv4 dhcp required
 no shutdown
!
wireless tag policy TAG-CORP
 description "Corporate policy tag"
 wlan Corp-Secure policy POL-CORP
!
! --- verification ---
! show wireless client mac-address <MAC> detail
! show access-session mac <MAC> details
! show run | section wireless profile policy
! show aaa servers
! debug wireless mac <MAC> monitor-time 600`}
          />
        </div>
      </Panel>

      {/* ---------------- switching mode + AireOS ---------------- */}
      <Panel title="Switching mode, AireOS, and the ACL trap" span={5} tone="quiet">
        <Stack gap={7}>
          <Split
            cols={2}
            parts={[
              {
                title: 'Central vs FlexConnect',
                children: (
                  <Stack gap={5}>
                    <Table
                      head={['', 'Central', 'FlexConnect local']}
                      widths={['34%', '33%', '33%']}
                      rows={[
                        ['Data path', 'CAPWAP to the WLC', 'Dropped locally at the AP'],
                        ['Authenticator', 'WLC', 'WLC (central auth)'],
                        ['ACL enforced by', 'WLC', 'The AP'],
                        ['Redirect ACL', 'On the WLC', 'Pushed via the flex profile'],
                      ]}
                    />
                    <Code
                      title="Push the redirect ACL to the APs"
                      code={`wireless profile flex FLEX-PROFILE
 acl-policy REDIRECT
  central-webauth`}
                    />
                  </Stack>
                ),
              },
              {
                title: 'AireOS → 9800',
                children: (
                  <Bullets
                    items={[
                      <>Profiles and tags, not a flat WLAN list — a WLAN does nothing until a policy tag on an AP binds it to a policy profile</>,
                      <><strong>NAC State</strong> is the old <em>RADIUS NAC</em>; <strong>Allow AAA Override</strong> is the old <em>AAA Override</em></>,
                      <>The <strong>Airespace ACL Name</strong> field in an ISE authorization profile is AireOS-only</>,
                      <>The CLI is IOS-XE — the same commands as a Catalyst switch</>,
                      <>An accounting list is not optional: without it ISE never learns the client IP</>,
                    ]}
                  />
                ),
              },
            ]}
          />
          <Note label="Redirect ACL polarity — the one that catches everyone">
            On an <strong>IOS-XE switch and on the 9800 the redirect ACL is a
            classifier, not a filter</strong>: traffic matching a{' '}
            <M>permit</M> is punted to the control plane and{' '}
            <strong>redirected</strong>; traffic matching a <M>deny</M> is
            allowed to pass through the data plane untouched. That is why every
            working redirect ACL <em>denies</em> traffic to ISE and DNS and{' '}
            <em>permits</em> TCP 80. On <strong>AireOS</strong> the same-named
            ACL was an ordinary pre-auth permit/deny filter — the opposite
            reading. FlexConnect adds one more twist: the controller inverts the
            semantics again when it deploys the ACL to the APs.
          </Note>
        </Stack>
      </Panel>
    </Sheet>
  )
}
