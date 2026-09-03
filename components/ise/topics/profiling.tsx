'use client'

// ============================================================
// Topic — Profiling
//
// The probe explorer is the interactive heart of this sheet:
// pick any probe and you get what it collects, the attributes
// it populates, its ports, the ISE path that enables it and the
// network-side configuration that feeds it.
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
} from '../sheet-kit'

type Mode = 'passive' | 'active'

interface Probe {
  id: string
  label: string
  name: string
  mode: Mode
  gist: string
  collects: React.ReactNode[]
  attrs: React.ReactNode
  ports: [React.ReactNode, React.ReactNode][]
  gui: React.ReactNode
  config?: { title: string; code: string }
  note?: { label: string; tone?: 'signal' | 'warn' | 'good'; body: React.ReactNode }
}

const ENABLE = (
  <>
    <M>Administration &gt; System &gt; Deployment &gt; node &gt; Profiling Configuration</M>
  </>
)

const PROBES: Probe[] = [
  {
    id: 'radius',
    label: 'RADIUS',
    name: 'RADIUS probe',
    mode: 'passive',
    gist:
      'The one to turn on first. ISE already receives these packets, so the probe costs nothing extra — and it supplies the IP-to-MAC binding every other IP-based probe depends on.',
    collects: [
      <><M>Framed-IP-Address</M> — the IP↔MAC binding that DNS, NMAP and ARP correlation all need</>,
      <><M>Calling-Station-ID</M> (endpoint MAC), <M>Called-Station-ID</M> (NAD MAC or SSID)</>,
      <><M>NAS-IP-Address</M>, <M>NAS-Port</M>, <M>NAS-Port-Id</M>, <M>NAS-Port-Type</M></>,
      <><M>User-Name</M>, <M>Acct-Session-Id</M>, <M>Acct-Status-Type</M></>,
      <><strong>Every Device Sensor TLV</strong> — CDP, LLDP and DHCP data arrives as Cisco AV-pairs inside RADIUS Accounting</>,
    ],
    attrs: <>RADIUS dictionary · plus all Device Sensor AV-pairs</>,
    ports: [
      ['Authentication', <><M>UDP 1812</M> (legacy <M>1645</M>)</>],
      ['Accounting', <><M>UDP 1813</M> (legacy <M>1646</M>)</>],
      ['CoA out to NAD', <><M>UDP 1700</M> Cisco · <M>UDP 3799</M> RFC 5176</>],
    ],
    gui: <>Check <strong>RADIUS</strong> under {ENABLE}</>,
    config: {
      title: 'IOS-XE — AAA that feeds the RADIUS probe',
      code: `aaa new-model
!
aaa group server radius ISE-GROUP
 server name ISE-PSN-1
 server name ISE-PSN-2
!
aaa authentication dot1x default group ISE-GROUP
aaa authorization network default group ISE-GROUP
aaa accounting dot1x default start-stop group ISE-GROUP
aaa accounting update newinfo periodic 2880
aaa session-id common
!
radius server ISE-PSN-1
 address ipv4 10.1.1.10 auth-port 1812 acct-port 1813
 key <shared-secret>
!
radius server ISE-PSN-2
 address ipv4 10.1.1.11 auth-port 1812 acct-port 1813
 key <shared-secret>
!
aaa server radius dynamic-author
 client 10.1.1.10 server-key <shared-secret>
 client 10.1.1.11 server-key <shared-secret>
 auth-type any
!
radius-server vsa send authentication
radius-server vsa send accounting
!
dot1x system-auth-control`,
    },
    note: {
      label: 'The two lines people forget',
      body: (
        <>
          <M>aaa accounting update newinfo</M> and{' '}
          <M>radius-server vsa send accounting</M>. Without both, Device Sensor
          collects TLVs on the switch that never reach ISE.
        </>
      ),
    },
  },

  {
    id: 'sensor',
    label: 'Device Sensor',
    name: 'Device Sensor (switch-side, feeds the RADIUS probe)',
    mode: 'passive',
    gist:
      'Not an ISE probe at all. The switch collects CDP, LLDP, DHCP, DHCPv6 and mDNS TLVs locally, packages them as Cisco AV-pairs and ships them inside RADIUS Accounting. This is the recommended default for wired campus profiling.',
    collects: [
      <>CDP: <M>device-name</M>, <M>platform-type</M>, <M>version-type</M>, <M>capabilities-type</M></>,
      <>LLDP: <M>system-name</M>, <M>system-description</M>, <M>system-capabilities</M>, <M>port-description</M>, <M>port-id</M></>,
      <>DHCP: <M>host-name</M>, <M>class-identifier</M>, <M>client-identifier</M>, <M>parameter-request-list</M>, <M>client-fqdn</M>, <M>user-class-id</M></>,
      <>Attributes arrive already bound to the session MAC and the switchport</>,
    ],
    attrs: <>Delivered as Cisco AV-pairs; ingested by the RADIUS probe</>,
    ports: [
      ['Transport', <>RADIUS Accounting — <M>UDP 1813</M></>],
      ['Extra ports', <>None. It reuses a channel you already have</>],
      ['Topology', <>Survives L3 boundaries, remote sites and the WAN</>],
    ],
    gui: (
      <>
        Nothing to enable in ISE beyond the <strong>RADIUS</strong> probe. All
        configuration is on the switch.
      </>
    ),
    config: {
      title: 'IOS-XE — Device Sensor, complete',
      code: `! 1. What to collect
device-sensor filter-list dhcp list DHCP-LIST
 option name host-name
 option name class-identifier
 option name client-identifier
 option name parameter-request-list
 option name client-fqdn
 option name user-class-id
!
device-sensor filter-list lldp list LLDP-LIST
 tlv name system-name
 tlv name system-description
 tlv name system-capabilities
 tlv name port-description
 tlv name port-id
!
device-sensor filter-list cdp list CDP-LIST
 tlv name device-name
 tlv name platform-type
 tlv name version-type
 tlv name capabilities-type
!
! 2. Apply the lists to the export
device-sensor filter-spec dhcp include list DHCP-LIST
device-sensor filter-spec lldp include list LLDP-LIST
device-sensor filter-spec cdp  include list CDP-LIST
!
! 3. Export mechanism  -- both lines are mandatory
device-sensor accounting
device-sensor notify all-changes
!
cdp run
lldp run
!
! 4. Verify on the switch BEFORE blaming ISE
! show device-sensor cache all
! show device-sensor cache mac <mac>
! show device-sensor cache interface Gi1/0/1
! show device-sensor details`,
    },
    note: {
      label: 'Two commands decide whether it works',
      body: (
        <>
          <M>device-sensor accounting</M> — without it the switch collects but
          never exports. <M>device-sensor notify all-changes</M> — use this, not{' '}
          <M>new-tlvs</M>, or ISE misses reprofiling events when an attribute
          changes.
        </>
      ),
    },
  },

  {
    id: 'snmpquery',
    label: 'SNMP Query',
    name: 'SNMP Query probe',
    mode: 'active',
    gist:
      'ISE polls the network device for what it already knows about the endpoint — CDP and LLDP neighbour caches, the ARP table and the bridge MIB. The classic way to identify phones, printers and APs.',
    collects: [
      <>CDP cache: <M>cdpCacheDeviceId</M>, <M>cdpCachePlatform</M>, <M>cdpCacheCapabilities</M>, <M>cdpCacheAddress</M>, <M>cdpCacheVersion</M>, <M>cdpCacheDevicePort</M></>,
      <>LLDP cache: <M>lldpSystemName</M>, <M>lldpSystemDescription</M>, <M>lldpCacheCapabilities</M>, <M>lldpPortDescription</M>, <M>lldpPortId</M></>,
      <>ARP table — the IP↔MAC binding</>,
      <>Interface, bridge MIB, VLAN data, <M>sysDescr</M>, <M>sysObjectID</M></>,
    ],
    attrs: <>SNMP dictionary · capability codes render as single letters (R, B, T, S…)</>,
    ports: [['Poll', <><M>UDP 161</M> outbound, PSN → NAD</>], ['Credentials', <>Per network device: v2c community or v3 user</>], ['Triggers', <>Periodic interval, an SNMP trap, or RADIUS Accounting Start</>]],
    gui: (
      <>
        <strong>Two places, both required.</strong> Check <strong>SNMPQUERY</strong>{' '}
        under {ENABLE}, then set SNMP under{' '}
        <M>Administration &gt; Network Resources &gt; Network Devices &gt; device &gt; SNMP Settings</M>{' '}
        — version, community, polling interval, link/MAC trap query, and{' '}
        <strong>Originating Policy Service Node</strong>.
      </>
    ),
    config: {
      title: 'IOS-XE — SNMPv2c, and the v3 variant',
      code: `snmp-server community <RO-community> RO
snmp-server trap-source Vlan10
snmp-server source-interface informs Vlan10
!
cdp run
lldp run
!
interface range GigabitEthernet1/0/1-48
 cdp enable
 lldp transmit
 lldp receive
!
! --- SNMPv3 ---
snmp-server user <user> <group> v3 auth md5 <auth> priv des <priv>
snmp-server group <group> v3 priv
snmp-server group <group> v3 priv context vlan-1`,
    },
    note: {
      label: 'Set the originating node',
      body: (
        <>
          Left unset, a random PSN is chosen and a remote node may end up
          polling a NAD across the WAN. Also note the v3{' '}
          <M>context vlan-1</M> line: the bridge MIB is VLAN-contexted, and
          without a group per context ISE cannot read the CAM table. A polling
          interval of <M>0</M> disables polling while leaving other SNMP
          services usable.
        </>
      ),
    },
  },

  {
    id: 'snmptrap',
    label: 'SNMP Trap',
    name: 'SNMP Trap probe',
    mode: 'passive',
    gist:
      'A doorbell, not a data source. The trap carries almost nothing; its job is to tell ISE that a port changed so an SNMP Query fires against that port immediately rather than at the next poll.',
    collects: [
      <>MAC notification (address added / removed)</>,
      <>linkup and linkdown</>,
      <>informs</>,
      <>On its own it creates no endpoints — the <strong>SNMP Query probe must also be enabled</strong></>,
    ],
    attrs: <>Triggers collection rather than populating attributes itself</>,
    ports: [['Listen', <><M>UDP 162</M> inbound to the PSN, configurable</>]],
    gui: (
      <>
        Check <strong>SNMPTRAP</strong> under {ENABLE} — Link Trap Query, MAC
        Trap Query, Interface, Port.
      </>
    ),
    config: {
      title: 'IOS-XE — MAC notification traps to ISE',
      code: `snmp-server community <RO-community> RO
snmp-server enable traps snmp linkdown linkup
snmp-server enable traps mac-notification change move threshold
snmp-server host 10.1.1.10 version 2c <RO-community> mac-notification snmp
!
mac address-table notification change interval 0
mac address-table notification change history-size 100
mac address-table notification change
!
interface range GigabitEthernet1/0/1-48
 snmp trap mac-notification change added
 snmp trap mac-notification change removed`,
    },
    note: {
      label: 'Documented limitation',
      tone: 'warn',
      body: (
        <>
          Cisco ISE does <strong>not</strong> support SNMP traps received from
          Wireless LAN Controllers or access points. Where you can, trigger
          SNMP Query from RADIUS Accounting Start instead — fewer packets, same
          result.
        </>
      ),
    },
  },

  {
    id: 'dhcp',
    label: 'DHCP',
    name: 'DHCP probe',
    mode: 'passive',
    gist:
      'The richest fingerprint most endpoints ever volunteer. Option 55 in particular — the parameter request list — is close to a device signature, because operating systems ask for options in a characteristic order.',
    collects: [
      <><M>dhcp-parameter-request-list</M> (Opt 55) — the DHCP fingerprint, highest value</>,
      <><M>dhcp-class-identifier</M> (Opt 60) — e.g. <M>MSFT 5.0</M>, <M>android-dhcp-13</M></>,
      <><M>dhcp-client-identifier</M> (Opt 61), <M>host-name</M> (Opt 12)</>,
      <><M>dhcp-user-class-id</M> (Opt 77), <M>client-fqdn</M> (Opt 81), <M>dhcp-message-type</M> (Opt 53)</>,
      <><M>dhcp-requested-address</M> (Opt 50), <M>ciaddr</M>, <M>giaddr</M>, <M>server-ip</M>, <M>vendor-class</M>, <M>boot-file</M></>,
    ],
    attrs: <>DHCP dictionary · reprofiles only on INIT-REBOOT and SELECTING messages</>,
    ports: [['Listen', <><M>UDP 67</M> inbound to the PSN, configurable</>], ['Mechanism', <>The PSN becomes an extra relay target — the real server still answers</>]],
    gui: (
      <>
        Check <strong>DHCP</strong> under {ENABLE} — Interface, Port 67.
      </>
    ),
    config: {
      title: 'L3 gateway — one helper per PSN',
      code: `interface Vlan10
 description USER-VLAN
 ip address 10.10.10.1 255.255.255.0
 ip helper-address 10.20.20.5     ! the real DHCP server
 ip helper-address 10.1.1.10      ! ISE PSN-1  (profiling copy)
 ip helper-address 10.1.1.11      ! ISE PSN-2  (profiling copy)`,
    },
    note: {
      label: 'One probe per flow',
      body: (
        <>
          Cisco is explicit: for any given flow of DHCP traffic, choose{' '}
          <strong>one</strong> probe. Prefer the DHCP probe over DHCP SPAN. If
          you would rather not add helpers to every SVI, use Device Sensor DHCP
          TLVs instead — same attributes, no extra relay.
        </>
      ),
    },
  },

  {
    id: 'dhcpspan',
    label: 'DHCP SPAN',
    name: 'DHCP SPAN probe',
    mode: 'passive',
    gist:
      'The same DHCP options, harvested from mirrored traffic instead of relayed traffic. Its one real advantage is seeing the whole conversation — the client DISCOVER before relay, and the server OFFER and ACK.',
    collects: [
      <>Every attribute the DHCP probe collects</>,
      <>Plus the server-side OFFER and ACK, which the relay copy never shows</>,
      <>Plus the client DISCOVER as sent, before the relay rewrites it</>,
    ],
    attrs: <>DHCP dictionary, from a promiscuous listener</>,
    ports: [['Listen', <><M>UDP 68</M> on a chosen ISE interface</>], ['Interface', <>Use Gig 1/2/3 — never the management interface</>], ['Virtual', <>vSwitch port group needs <strong>Promiscuous Mode = Accept</strong></>]],
    gui: (
      <>
        Check <strong>DHCPSPAN</strong> under {ENABLE} and choose the interface.
      </>
    ),
    config: {
      title: 'IOS-XE — SPAN session',
      code: `monitor session 1 source interface GigabitEthernet1/0/4
monitor session 1 destination interface GigabitEthernet1/0/2
!
! more useful in production - mirror the user VLAN
monitor session 1 source vlan 10 rx
monitor session 1 destination interface GigabitEthernet1/0/2`,
    },
    note: {
      label: 'When it is actually justified',
      tone: 'warn',
      body: (
        <>
          SPAN is L2-local, costs a physical port, and most switches allow only
          two sessions. It earns its place when the L3 gateway is also the DHCP
          server for local clients, so there is no relay for ISE to receive.
        </>
      ),
    },
  },

  {
    id: 'http',
    label: 'HTTP',
    name: 'HTTP probe',
    mode: 'passive',
    gist:
      'Reads the User-Agent string, which a large share of built-in profiles key off. The cleanest source is not the listener at all — it is any endpoint redirected to an ISE portal, because then the browser talks straight to ISE.',
    collects: [
      <><M>User-Agent</M> — the primary attribute</>,
      <><M>Host</M>, <M>Referer</M>, <M>Accept-Language</M>, <M>Content-Type</M>, <M>Cookie</M>, <M>Authorization</M></>,
      <><M>Server</M>, from responses seen via SPAN</>,
    ],
    attrs: <>IP / EndPoints dictionaries</>,
    ports: [['Listen', <><M>TCP 80</M> and <M>TCP 8080</M></>], ['Best source', <>Guest, CWA, Client Provisioning, BYOD, Hotspot or MDM portal redirects</>]],
    gui: (
      <>
        Check <strong>HTTP</strong> under {ENABLE} — Interface, Port.
      </>
    ),
    config: {
      title: 'Switch — what makes redirect-fed HTTP work',
      code: `ip http server
ip http secure-server
!
ip access-list extended REDIRECT
 deny   udp any any eq domain
 deny   ip  any host 10.1.1.10        ! do not redirect ISE itself
 permit tcp any any eq www
 permit tcp any any eq 443
!
! then reference REDIRECT from a URL-Redirect
! authorization profile in ISE`,
    },
    note: {
      label: 'Free profiling',
      tone: 'good',
      body: (
        <>
          Any guest or BYOD flow you already run is handing ISE a User-Agent for
          every endpoint that touches it. Portal-fed HTTP needs no probe
          plumbing and no SPAN.
        </>
      ),
    },
  },

  {
    id: 'httpspan',
    label: 'HTTP SPAN',
    name: 'HTTP SPAN probe',
    mode: 'passive',
    gist:
      'Captures HTTP from mirrored traffic and binds User-Agent directly to a MAC, which makes it unusually good at identifying devices that never authenticate. Its value has fallen sharply as the web moved to TLS.',
    collects: [
      <>HTTP attributes plus L3 headers</>,
      <>Associates data to endpoints by L2 MAC address</>,
      <>Useful for portable IP devices that never present credentials</>,
    ],
    attrs: <>IP / EndPoints dictionaries, MAC-bound</>,
    ports: [['Listen', <><M>TCP 80</M> on a SPAN-fed interface</>], ['Virtual', <><strong>Promiscuous Mode = Accept</strong> on the vSwitch or port group</>]],
    gui: (
      <>
        Check <strong>HTTPSPAN</strong> under {ENABLE} and choose the interface.
      </>
    ),
    config: {
      title: 'IOS-XE — mirror the uplink',
      code: `monitor session 2 source interface TenGigabitEthernet1/1/1 both
monitor session 2 destination interface GigabitEthernet1/0/3`,
    },
    note: {
      label: 'Diminishing returns',
      tone: 'warn',
      body: (
        <>
          HTTP SPAN cannot read a User-Agent inside TLS, and almost all web
          traffic is now HTTPS. Prefer portal-fed HTTP, Device Sensor, and AD or
          pxGrid attributes.
        </>
      ),
    },
  },

  {
    id: 'dns',
    label: 'DNS',
    name: 'DNS probe',
    mode: 'active',
    gist:
      'A single reverse lookup that turns an IP into an FQDN. It cannot run alone — it has no way to learn an IP of its own, so it borrows one from another probe.',
    collects: [<><M>FQDN</M>, via a reverse PTR lookup</>],
    attrs: <>One attribute, but a high-value one for naming conventions</>,
    ports: [['Lookup', <><M>UDP 53</M> outbound, route-table dependent</>], ['Resolver', <>The name servers configured on the ISE node</>]],
    gui: (
      <>
        Check <strong>DNS</strong> under {ENABLE} — Timeout.
      </>
    ),
    config: {
      title: 'Where the IP comes from — one of these must be running',
      code: `DHCP / DHCP SPAN  ->  dhcp-requested-address
HTTP              ->  SourceIP
RADIUS            ->  Framed-IP-Address
SNMP Query        ->  cdpCacheAddress

! And the DNS zone must actually contain PTR records:
! Windows DHCP -> "Always dynamically update DNS records"
!              -> "Discard A and PTR records when lease is deleted"`,
    },
    note: {
      label: 'Silent failure',
      body: (
        <>
          Without reverse zones populated from DHCP, the probe returns nothing
          and looks broken. Check for PTR records before debugging ISE.
        </>
      ),
    },
  },

  {
    id: 'netflow',
    label: 'NetFlow',
    name: 'NetFlow probe',
    mode: 'passive',
    gist:
      'Classifies a device by how it communicates rather than what it says about itself. Powerful for OT and IoT segments where nothing else can see the endpoint — and the highest-volume, highest-risk probe in a general campus.',
    collects: [
      <><M>PROTOCOL</M>, <M>L4_SRC_PORT</M>, <M>L4_DST_PORT</M></>,
      <><M>IPV4_SRC_ADDR</M>, <M>IPV4_DST_ADDR</M></>,
      <><M>IN_SRC_MAC</M>, <M>OUT_DST_MAC</M>, <M>OUT_SRC_MAC</M></>,
      <>NetFlow <strong>v9</strong>. v5 is supported but has no MAC fields, so a flow cannot be bound to an endpoint</>,
    ],
    attrs: <>NetFlow dictionary — behavioural, not declarative</>,
    ports: [['Collector', <><M>UDP 9996</M> inbound to the PSN, configurable</>]],
    gui: (
      <>
        Check <strong>NETFLOW</strong> under {ENABLE} — Interface, Port 9996.
      </>
    ),
    config: {
      title: 'IOS-XE — Flexible NetFlow v9 with MAC fields',
      code: `flow record ISE-PROFILE-RECORD
 match datalink mac source address input
 match datalink mac destination address input
 match ipv4 protocol
 match ipv4 source address
 match ipv4 destination address
 match transport source-port
 match transport destination-port
 collect counter bytes
 collect counter packets
!
flow exporter ISE-EXPORTER
 destination 10.1.1.10
 source Vlan10
 transport udp 9996
 export-protocol netflow-v9
 template data timeout 60
!
flow monitor ISE-MONITOR
 exporter ISE-EXPORTER
 record ISE-PROFILE-RECORD
 cache timeout active 60
!
interface Vlan10
 ip flow monitor ISE-MONITOR input`,
    },
    note: {
      label: 'Scope it narrowly',
      tone: 'warn',
      body: (
        <>
          Never enable NetFlow profiling network-wide. Point it at the one
          segment where no other probe can see the device, and nowhere else.
        </>
      ),
    },
  },

  {
    id: 'nmap',
    label: 'NMAP',
    name: 'Network Scan (NMAP) probe',
    mode: 'active',
    gist:
      'The last resort. ISE actively scans the endpoint for open ports, an OS fingerprint and service banners. Finding UDP 161 open is the real prize — it lets ISE follow up with SNMP and classify the printer properly.',
    collects: [
      <>OS fingerprint and version</>,
      <>Open TCP and UDP ports as <M>&lt;port&gt;-tcp</M> / <M>&lt;port&gt;-udp</M> attributes</>,
      <>Service banners and versions</>,
      <>SMB host details — OS and computer name</>,
      <>An open <M>UDP 161</M> triggers an automatic SNMP query with the configured RO communities</>,
    ],
    attrs: <>NMAP dictionary</>,
    ports: [['Direction', <>Outbound from the PSN to the endpoint</>], ['Blocked by', <>The dACL or redirect ACL in force during the Unknown phase</>]],
    gui: (
      <>
        Check <strong>NMAP</strong> under {ENABLE}. Build scan actions at{' '}
        <M>Policy &gt; Policy Elements &gt; Results &gt; Profiling &gt; Network Scan (NMAP) Actions</M>,
        then reference one from a profiling policy rule. Manual scans live at{' '}
        <M>Work Centers &gt; Profiler &gt; Manual Scans</M>.
      </>
    ),
    config: {
      title: 'Scan options and the commands behind them',
      code: `OS Scan            nmap -sS -O -F        SYN scan + OS detection (range 1-65389)
SNMP Port Scan     nmap -sU -p U:161,162 highest value option
Common Ports Scan  nmap -sTU
   TCP  21 22 23 25 53 80 110 135 139 143 443 445 3306 3389 8080
   UDP  53 67 68 123 135 137 138 139 161 445 500 520 631 1434 1900
Custom Ports       user-specified TCP and/or UDP list
Service Version    adds -sV service/version detection
SMB Discovery      SMB NSE script on TCP 445 and 139
Skip Host Discovery  on by default for automatic scans

! Default manual subnet scan
nmap -O -sU -p U:161,162 -oN /opt/CSCOcpm/logs/nmapSubnet.log \\
     --append-output -oX - <subnet>`,
    },
    note: {
      label: 'Two rules',
      tone: 'warn',
      body: (
        <>
          Once an endpoint is properly profiled it is never scanned again — NMAP
          is a classifier, not a monitor. And IP↔MAC bindings are{' '}
          <strong>not</strong> replicated between PSNs, so a manual scan must be
          triggered from the PSN that holds the binding. Never point a subnet
          scan at legacy OT or medical devices without change control.
        </>
      ),
    },
  },

  {
    id: 'ad',
    label: 'Active Directory',
    name: 'Active Directory probe',
    mode: 'active',
    gist:
      'Answers the question no fingerprint can: is this a corporate-managed, domain-joined machine? Far more trustworthy than a DHCP signature for telling a company laptop from a personal one, and the backbone of corporate-asset rules.',
    collects: [
      <><M>AD-Host-Exists</M></>,
      <><M>AD-Join-Point</M></>,
      <><M>AD-Operating-System</M></>,
      <><M>AD-OS-Version</M></>,
      <><M>AD-Service-Pack</M></>,
    ],
    attrs: <>AD dictionary, via the existing ISE AD connector</>,
    ports: [['Transport', <>Kerberos and LDAP to the DCs — <M>88</M>, <M>389</M>, <M>464</M>, <M>3268</M></>], ['Dedicated port', <>None. It reuses the AD join point</>]],
    gui: (
      <>
        Check <strong>Active Directory</strong> under {ENABLE} and set{' '}
        <strong>Days Before Rescan</strong>. The node must already be joined to
        an AD join point.
      </>
    ),
    note: {
      label: 'Prerequisite',
      body: (
        <>
          ISE needs a hostname or FQDN to look up, so this probe depends on the
          DNS probe, or on <M>host-name</M> from DHCP or Device Sensor. No
          hostname, no AD lookup.
        </>
      ),
    },
  },

  {
    id: 'pxgrid',
    label: 'pxGrid',
    name: 'pxGrid probe',
    mode: 'passive',
    gist:
      'Lets another system do the identifying. Cyber Vision, Industrial Network Director and third-party IoT and medical-device platforms publish rich asset data that ISE could never derive itself.',
    collects: [
      <>Asset name, vendor, product ID and serial number</>,
      <>Asset device type, software and hardware revision</>,
      <>Asset protocol, connected links and IP address</>,
      <>Written into the asset / custom attribute space on the endpoint</>,
    ],
    attrs: <>Endpoint Asset topic, published by pxGrid participants</>,
    ports: [['pxGrid 2.0', <><M>TCP 8910</M></>], ['pxGrid 1.0', <><M>TCP 5222</M> XMPP, deprecated</>]],
    gui: (
      <>
        Check <strong>pxGrid</strong> under {ENABLE}. The pxGrid persona must be
        enabled on the deployment and the publisher approved under{' '}
        <M>Administration &gt; pxGrid Services</M>.
      </>
    ),
    note: {
      label: 'Where it earns its keep',
      tone: 'good',
      body: (
        <>
          OT and clinical networks. A PLC or an infusion pump gives up almost
          nothing to a probe, but a purpose-built visibility platform already
          knows its make, model and firmware.
        </>
      ),
    },
  },
]

export default function ProfilingSheet() {
  const [probeId, setProbeId] = useState(PROBES[0].id)
  const probe = PROBES.find(p => p.id === probeId) ?? PROBES[0]

  return (
    <Sheet>
      {/* ---------------- what it is ---------------- */}
      <Panel title="What profiling actually does" span={3}>
        <Stack gap={7}>
          <Prose>
            The profiling service collects attributes about an endpoint, matches
            them against <strong>Endpoint Profiling Policies</strong>, and
            classifies the endpoint into an <strong>Endpoint Policy</strong> —{' '}
            <M>Apple-iPhone</M>, <M>Cisco-IP-Phone-7965</M>. Authorization then
            consumes that result.
          </Prose>
          <KV
            items={[
              ['Probe', "Cisco's term: a method of collecting an attribute or set of attributes from an endpoint"],
              ['Scope', 'Probes are per-PSN. Only nodes with Policy Service and Session Services run them'],
              [
                'Consumed as',
                <>
                  <M>EndPoints:EndPointPolicy</M> in an authorization rule, or via
                  an Endpoint Identity Group
                </>,
              ],
              ['Enable at', ENABLE],
            ]}
            labelWidth={62}
          />
          <Note label="Do not enable everything">
            Cisco is direct about this: configuring all probes in production
            collects far more data than required and costs PSN CPU and
            replication. Pick the probes that answer a question you actually
            have.
          </Note>
        </Stack>
      </Panel>

      {/* ---------------- active vs passive ---------------- */}
      <Panel title="Active and passive profiling" kicker="Who generates the traffic" span={4} tone="signal">
        <Split
          parts={[
            {
              title: 'Passive — ISE listens',
              children: (
                <Stack gap={5}>
                  <Prose>
                    Data arrives without ISE generating anything toward the
                    endpoint or the NAD. No load on the endpoint, nothing that
                    can look hostile — but data only turns up when the endpoint
                    happens to produce it.
                  </Prose>
                  <Bullets
                    items={[
                      <><strong>RADIUS</strong> — and therefore Device Sensor</>,
                      <><strong>SNMP Trap</strong></>,
                      <><strong>DHCP</strong> and <strong>DHCP SPAN</strong></>,
                      <><strong>HTTP</strong> and <strong>HTTP SPAN</strong></>,
                      <><strong>NetFlow</strong> — ISE is the collector</>,
                      <><strong>pxGrid</strong></>,
                    ]}
                  />
                </Stack>
              ),
            },
            {
              title: 'Active — ISE asks',
              children: (
                <Stack gap={5}>
                  <Prose>
                    ISE initiates traffic to obtain attributes. Faster and more
                    decisive, but it puts ISE on the wire as a source — which
                    matters on fragile segments.
                  </Prose>
                  <Bullets
                    items={[
                      <><strong>SNMP Query</strong> — polls the NAD for CDP, LLDP, ARP</>,
                      <><strong>NMAP</strong> — port scans and OS-fingerprints the endpoint</>,
                      <><strong>DNS</strong> — issues a reverse PTR lookup</>,
                      <><strong>Active Directory</strong> — queries AD about the host object</>,
                    ]}
                  />
                  <Note label="Edge case">
                    DNS is often filed as passive because another probe triggers
                    it — but ISE does generate the query, so by mechanism it is
                    active.
                  </Note>
                </Stack>
              ),
            },
          ]}
        />
      </Panel>

      {/* ---------------- certainty factor ---------------- */}
      <Panel title="Certainty Factor and the policy tree" kicker="How a profile is chosen" span={5}>
        <div className="grid grid-cols-2 gap-3">
          <Stack gap={6}>
            <Prose>
              Every <strong>condition</strong> in a profiling policy carries a{' '}
              <strong>Certainty Factor</strong> — a weight for how strongly it
              implies the profile. Matched rules accumulate into a{' '}
              <strong>Total Certainty Factor</strong>. The profile with the
              highest TCF wins, provided the TCF meets that policy&rsquo;s{' '}
              <strong>Minimum Certainty Factor</strong>.
            </Prose>
            <KV
              items={[
                ['Valid range', <>1 to 65535</>],
                ['Default minimum', <>10 for new rules</>],
                [
                  'Set at',
                  <M>Policy &gt; Profiling &gt; Profiling Policies &gt; policy &gt; Minimum Certainty Factor</M>,
                ],
                ['Winner', 'Deepest matched node in the tree'],
              ]}
              labelWidth={72}
            />
          </Stack>
          <Stack gap={6}>
            <div>
              <div
                className="mb-1 border-b border-ink-300 pb-[2px] text-[9px] font-bold uppercase tracking-[0.11em] text-ink-950"
                style={{ fontFamily: 'var(--font-heading)' }}
              >
                Parent gates child
              </div>
              <Bullets
                items={[
                  <>A child policy is evaluated <strong>only if its parent has already matched</strong> — which is why <M>Apple-iPad</M> never matches without <M>Apple-Device</M></>,
                  <>CF is <strong>not</strong> inherited numerically. What the parent confers is eligibility to be evaluated</>,
                  <>So children conventionally carry a <em>higher</em> minimum CF: a parent is a coarse gate, a child is a specific claim</>,
                ]}
              />
            </div>
            <Note label="Security" tone="warn">
              Never set a minimum CF so low that one weak condition can promote
              an endpoint into a privileged profile — that is exactly the
              mechanism MAC-spoofing abuses. When two policies compete, add a{' '}
              <em>distinguishing</em> condition rather than raising a weight.
            </Note>
          </Stack>
        </div>
      </Panel>

      {/* ---------------- THE PROBE EXPLORER ---------------- */}
      <Panel
        title="Probe explorer"
        span={12}
        tone="ink"
        right={
          <span className="normal-case tracking-normal">
            Pick a probe — every one is here
          </span>
        }
      >
        <Stack gap={8}>
          <div className="flex items-center justify-between gap-4">
            <Selector
              options={PROBES.map(p => ({ id: p.id, label: p.label, hint: p.gist }))}
              value={probeId}
              onChange={setProbeId}
            />
            <Pill tone={probe.mode === 'active' ? 'bad' : 'good'}>
              {probe.mode === 'active' ? 'Active — ISE asks' : 'Passive — ISE listens'}
            </Pill>
          </div>

          <div className="border-t border-ink-200 pt-2">
            <div className="grid grid-cols-12 gap-3">
              {/* left: what and why */}
              <div className="col-span-4">
                <h4
                  className="text-[12px] font-bold tracking-tight text-ink-950"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  {probe.name}
                </h4>
                <div className="mt-1">
                  <Prose>{probe.gist}</Prose>
                </div>
                <div className="mt-2">
                  <div
                    className="mb-1 border-b border-ink-300 pb-[2px] text-[9px] font-bold uppercase tracking-[0.11em] text-ink-950"
                    style={{ fontFamily: 'var(--font-heading)' }}
                  >
                    What it collects
                  </div>
                  <Bullets items={probe.collects} />
                </div>
              </div>

              {/* middle: ports, enable, notes */}
              <div className="col-span-3">
                <div
                  className="mb-1 border-b border-ink-300 pb-[2px] text-[9px] font-bold uppercase tracking-[0.11em] text-ink-950"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  Ports and mechanism
                </div>
                <KV items={probe.ports} labelWidth={74} />

                <div className="mt-2">
                  <div
                    className="mb-1 border-b border-ink-300 pb-[2px] text-[9px] font-bold uppercase tracking-[0.11em] text-ink-950"
                    style={{ fontFamily: 'var(--font-heading)' }}
                  >
                    Enable it in ISE
                  </div>
                  <Prose>{probe.gui}</Prose>
                </div>

                <div className="mt-2">
                  <Prose>
                    <strong>Attributes:</strong> {probe.attrs}
                  </Prose>
                </div>

                {probe.note && (
                  <div className="mt-2">
                    <Note label={probe.note.label} tone={probe.note.tone}>
                      {probe.note.body}
                    </Note>
                  </div>
                )}
              </div>

              {/* right: the configuration */}
              <div className="col-span-5">
                <div
                  className="mb-1 border-b border-ink-300 pb-[2px] text-[9px] font-bold uppercase tracking-[0.11em] text-ink-950"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  Configuration
                </div>
                {probe.config ? (
                  <Code title={probe.config.title} code={probe.config.code} />
                ) : (
                  <Prose>
                    No network-device configuration is required for this probe —
                    everything is on the ISE side.
                  </Prose>
                )}
              </div>
            </div>
          </div>
        </Stack>
      </Panel>

      {/* ---------------- CoA ---------------- */}
      <Panel title="Profiler CoA — what happens after reprofiling" span={4}>
        <Stack gap={6}>
          <Prose>
            Reprofiling can mean the endpoint now deserves different
            authorization, but it already holds a live session. CoA is how ISE
            forces re-evaluation.
          </Prose>
          <Table
            head={['Type', 'What ISE sends', 'When']}
            widths={['20%', '42%', '38%']}
            rows={[
              [
                'No CoA',
                'Nothing. The endpoint keeps its authorization until it naturally reauthenticates.',
                'Default and safest. Use during rollout, and permanently where session churn is unacceptable.',
              ],
              [
                'Port Bounce',
                <>
                  Shut / no-shut the port —{' '}
                  <M>subscriber:command=bounce-host-port</M>. The endpoint
                  re-DHCPs.
                </>,
                <>
                  When a device must pick up a new VLAN and will not renew on its
                  own. <strong>Never on multi-host or multi-auth ports</strong> —
                  it drops every device behind that port.
                </>,
              ],
              [
                'Reauth',
                'CoA-Reauthenticate. The session is re-authenticated in place, keeping its session ID.',
                'The general-purpose choice. Safe on multi-auth ports. Use when authorization changes but addressing does not.',
              ],
            ]}
          />
          <Note label="Order of precedence">
            Global settings override per-policy settings, and a global{' '}
            <strong>No CoA</strong> disables CoA deployment-wide. Set the global
            to <strong>Reauth</strong> and carve out exceptions with per-policy{' '}
            <strong>No CoA</strong> — not the other way round. Global:{' '}
            <M>Administration &gt; System &gt; Settings &gt; Profiling</M>. Per
            policy: the <strong>Associated CoA Type</strong> field.
          </Note>
        </Stack>
      </Panel>

      {/* ---------------- policies and groups ---------------- */}
      <Panel title="Policies, groups, feed and anomalies" span={4} tone="quiet">
        <Stack gap={6}>
          <Split
            cols={1}
            parts={[
              {
                title: 'Endpoint Policy or Identity Group?',
                children: (
                  <Bullets
                    items={[
                      <><M>EndPoints:EndPointPolicy</M> — matches the profile directly. Precise, and it follows the tree</>,
                      <><M>IdentityGroup</M> — matches a group the endpoint was placed in. Coarser, but stable across feed updates</>,
                      <><strong>Create Matching Identity Group</strong> makes a group per policy; <strong>Use Hierarchy</strong> matches the whole subtree</>,
                      <><strong>Logical Profiles</strong> gather unrelated policies under one name — every IP phone regardless of vendor</>,
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
                title: 'Feed service and filters',
                children: (
                  <Bullets
                    items={[
                      <><strong>Profiler Feed Service</strong> pulls new and updated profiles from Cisco — online, or offline for air-gapped deployments</>,
                      <><strong>Endpoint Attribute Filter</strong> keeps only the attributes that policies actually use, cutting replication load hard</>,
                      <><strong>Anomalous behaviour detection</strong> watches for an endpoint whose <M>NAS-Port-Type</M>, DHCP class ID or endpoint policy changes under a MAC that should be fixed — and can send a Reauth CoA</>,
                      <><strong>MAC randomisation</strong> is handled by matching the locally-administered bit and by <M>MAC_in_SAN</M> conditions on certificates</>,
                    ]}
                  />
                ),
              },
            ]}
          />
        </Stack>
      </Panel>

      {/* ---------------- sensor vs span + troubleshooting ---------------- */}
      <Panel title="Device Sensor vs SPAN, and how to debug" span={4}>
        <Stack gap={6}>
          <Table
            head={['', 'Device Sensor', 'SPAN probes']}
            widths={['26%', '39%', '35%']}
            rows={[
              ['Transport', 'RADIUS Accounting — a channel already in place', 'Raw mirrored packets on a dedicated NIC'],
              ['Scaling', 'Filtered on the switch; only chosen TLVs cross the network', 'Every mirrored packet crosses and is parsed on the PSN'],
              ['Topology', 'Anywhere the switch reaches ISE — survives L3 and WAN', 'L2-local; remote sites need RSPAN/ERSPAN or a local PSN'],
              ['MAC binding', 'Arrives bound to the session MAC and switchport', 'ISE must correlate L2 and L3 itself'],
              ['Freshness', 'Pushed the moment an attribute changes', 'Only when the endpoint next emits traffic'],
              ['Cost', 'A few extra AV-pairs', 'A switchport, a promiscuous vSwitch, PSN CPU'],
            ]}
          />
          <Code
            title="Debug order — prove the switch first, then ISE"
            code={`! On the switch
show device-sensor cache all
show device-sensor cache mac <mac>
show authentication sessions interface Gi1/0/1 details

! On ISE
show logging application profiler.log tail
! Operations > Troubleshoot > Debug Wizard > Debug Log Configuration
!   -> profiler = DEBUG on the PSN in question
! Operations > Troubleshoot > Diagnostic Tools > Endpoint Debug
! Context Visibility > Endpoints -> attribute list per endpoint`}
          />
        </Stack>
      </Panel>
    </Sheet>
  )
}
