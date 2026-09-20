// ============================================================
// components/ccnp/curriculum.ts
//
// The three enterprise blueprints, exactly as Cisco publishes them.
//
//   CCNA   200-301 v1.1      (live 20 Aug 2024 — last test date 2 Feb 2027)
//   ENCOR  350-401 v1.2      (2025)
//   ENARSI 300-410 v1.1.7    (2025)
//
// Numbering, wording and weightings are kept verbatim so a reader can check
// this against the official PDF line by line. `slug` points at the article
// for that topic once it exists; everything else is what the hub searches.
// ============================================================

export type ExamId = 'ccna' | 'encor' | 'enarsi'

/** One article under a topic that was too big for a single page. */
export interface Part {
  slug: string
  title: string
  /** One line on what this part covers, shown under the link. */
  blurb?: string
}

export interface Topic {
  /** Blueprint number, e.g. "1.11". */
  n: string
  title: string
  /** The lettered sub-items beneath it, verbatim. */
  subs?: string[]
  /** The article, when the topic fits on one page. */
  slug?: string
  /** Several articles, when it does not. Anything much over 5,000 words
   *  reads better split, and each part ranks on its own terms. */
  parts?: Part[]
  /** What to build in the lab to understand this properly. */
  lab?: string
  /** Extra words that should find this topic in search. */
  tags?: string[]
}

export interface Domain {
  n: string
  title: string
  weight: number
  topics: Topic[]
}

export interface Exam {
  id: ExamId
  code: string
  name: string
  short: string
  version: string
  minutes: number
  blurb: string
  official: string
  domains: Domain[]
}

// ------------------------------------------------------------
// CCNA 200-301 v1.1
// ------------------------------------------------------------

const CCNA: Exam = {
  id: 'ccna',
  code: '200-301',
  name: 'Cisco Certified Network Associate',
  short: 'CCNA',
  version: 'v1.1',
  minutes: 120,
  blurb:
    'The foundation. Addressing, switching, routing, services, security and a first look at automation. Everything above it assumes you own this.',
  official: 'https://learningcontent.cisco.com/documents/marketing/exam-topics/200-301-CCNA-v1.1.pdf',
  domains: [
    {
      n: '1.0', title: 'Network Fundamentals', weight: 20,
      topics: [
        { n: '1.1', title: 'Explain the role and function of network components',
          subs: ['Routers', 'Layer 2 and Layer 3 switches', 'Next-generation firewalls and IPS', 'Access points', 'Controllers', 'Endpoints', 'Servers', 'PoE'],
          tags: ['router', 'switch', 'firewall', 'IPS', 'access point', 'WLC', 'PoE', 'endpoint'],
          lab: 'Identify every device class in a packet walk from a laptop to a web server.' },
        { n: '1.2', title: 'Describe characteristics of network topology architectures',
          subs: ['Two-tier', 'Three-tier', 'Spine-leaf', 'WAN', 'Small office/home office (SOHO)', 'On-premises and cloud'],
          tags: ['collapsed core', 'access distribution core', 'CLOS', 'data centre', 'topology'],
          lab: 'Draw the same 200-user site as two-tier and three-tier; count failure domains in each.' },
        { n: '1.3', title: 'Compare physical interface and cabling types',
          subs: ['Single-mode fiber, multimode fiber, copper', 'Connections (Ethernet shared media and point-to-point)'],
          tags: ['SMF', 'MMF', 'SFP', 'twisted pair', 'cabling'] },
        { n: '1.4', title: 'Identify interface and cable issues (collisions, errors, mismatch duplex, and/or speed)',
          tags: ['duplex mismatch', 'CRC', 'runts', 'giants', 'late collision'],
          lab: 'Force a duplex mismatch and read it off the interface counters.' },
        { n: '1.5', title: 'Compare TCP to UDP', slug: 'tcp-explained-handshake-header-and-nagle',
          tags: ['three-way handshake', 'ports', 'sequence', 'window', 'datagram'] },
        { n: '1.6', title: 'Configure and verify IPv4 addressing and subnetting',
          tags: ['VLSM', 'subnet mask', 'CIDR', 'wildcard', 'broadcast address'],
          lab: 'Subnet 172.16.0.0/16 for six sites of differing size using VLSM, no calculator.' },
        { n: '1.7', title: 'Describe private IPv4 addressing', tags: ['RFC 1918', 'NAT', 'private address'] },
        { n: '1.8', title: 'Configure and verify IPv6 addressing and prefix',
          slug: 'ipv6-addressing-types-eui64-and-ndp',
          tags: ['IPv6', 'prefix', 'SLAAC', 'dual stack', 'NDP', 'router advertisement', 'DAD'] },
        { n: '1.9', title: 'Describe IPv6 address types',
          subs: ['Unicast (global, unique local, and link local)', 'Anycast', 'Multicast', 'Modified EUI 64'],
          slug: 'ipv6-addressing-types-eui64-and-ndp',
          tags: ['GUA', 'ULA', 'link-local', 'FE80', 'EUI-64', 'solicited-node', 'FF02', 'anycast'] },
        { n: '1.10', title: 'Verify IP parameters for Client OS (Windows, Mac OS, Linux)',
          tags: ['ipconfig', 'ifconfig', 'ip addr', 'nslookup'],
          lab: 'Read the full IP stack on all three operating systems and compare the output.' },
        { n: '1.11', title: 'Describe wireless principles',
          subs: ['Nonoverlapping Wi-Fi channels', 'SSID', 'RF', 'Encryption'],
          tags: ['2.4GHz', '5GHz', 'channel', 'RF', 'WPA', 'SSID'] },
        { n: '1.12', title: 'Explain virtualization fundamentals (server virtualization, containers, and VRFs)',
          tags: ['hypervisor', 'container', 'VRF', 'virtual machine'] },
        { n: '1.13', title: 'Describe switching concepts',
          subs: ['MAC learning and aging', 'Frame switching', 'Frame flooding', 'MAC address table'],
          slug: 'switching-concepts-vlans-and-inter-vlan-routing',
          tags: ['CAM table', 'unknown unicast', 'flooding', 'MAC'],
          lab: 'Watch a MAC table populate and age out, then force a flood by clearing it.' },
      ],
    },
    {
      n: '2.0', title: 'Network Access', weight: 20,
      topics: [
        { n: '2.1', title: 'Configure and verify VLANs (normal range) spanning multiple switches',
          subs: ['Access ports (data and voice)', 'Default VLAN', 'InterVLAN connectivity'],
          slug: 'switching-concepts-vlans-and-inter-vlan-routing',
          tags: ['VLAN', 'access port', 'voice VLAN', 'SVI', 'router on a stick'],
          lab: 'Build three VLANs across two switches and route between them two ways: ROAS and SVI.' },
        { n: '2.2', title: 'Configure and verify interswitch connectivity',
          subs: ['Trunk ports', '802.1Q', 'Native VLAN'],
          slug: 'dot1q-trunking-native-vlan-and-dtp-explained',
          tags: ['trunk', 'dot1q', 'native VLAN', 'tagging', 'DTP'],
          lab: 'Capture a tagged frame and find the 4-byte 802.1Q header in the hex.' },
        { n: '2.3', title: 'Configure and verify Layer 2 discovery protocols (Cisco Discovery Protocol and LLDP)',
          slug: 'cdp-and-lldp-neighbour-discovery-explained',
          tags: ['CDP', 'LLDP', 'neighbour discovery'] },
        { n: '2.4', title: 'Configure and verify (Layer 2/Layer 3) EtherChannel (LACP)',
          slug: 'etherchannel-lacp-pagp-and-load-balancing-explained',
          tags: ['LACP', 'PAgP', 'port-channel', 'load balancing', 'bundle'],
          lab: 'Build a Layer 2 and a Layer 3 EtherChannel, then break one on purpose and read the mismatch.' },
        { n: '2.5', title: 'Interpret basic operations of Rapid PVST+ Spanning Tree Protocol',
          slug: 'spanning-tree-explained-root-election-port-roles-rstp',
          subs: ['Root port, root bridge (primary/secondary), and other port names', 'Port states and roles', 'PortFast', 'Root guard, loop guard, BPDU filter, and BPDU guard'],
          tags: ['STP', 'RSTP', 'PVST', 'root bridge', 'BPDU', 'PortFast', 'root guard'],
          lab: 'Move the root bridge by priority and watch every port role recalculate.' },
        { n: '2.6', title: 'Describe Cisco Wireless Architectures and AP modes',
          tags: ['autonomous', 'lightweight', 'FlexConnect', 'CAPWAP', 'local mode'] },
        { n: '2.7', title: 'Describe physical infrastructure connections of WLAN components (AP, WLC, access/trunk ports, and LAG)',
          tags: ['WLC', 'LAG', 'AP port', 'wireless'] },
        { n: '2.8', title: 'Describe network device management access (Telnet, SSH, HTTP, HTTPS, console, TACACS+/RADIUS, and cloud managed)',
          tags: ['SSH', 'Telnet', 'console', 'TACACS+', 'RADIUS', 'management plane'] },
        { n: '2.9', title: 'Interpret the wireless LAN GUI configuration for client connectivity, such as WLAN creation, security settings, QoS profiles, and advanced settings',
          tags: ['WLAN', 'WLC GUI', 'QoS profile', 'wireless security'] },
      ],
    },
    {
      n: '3.0', title: 'IP Connectivity', weight: 25,
      topics: [
        { n: '3.1', title: 'Interpret the components of routing table',
          subs: ['Routing protocol code', 'Prefix', 'Network mask', 'Next hop', 'Administrative distance', 'Metric', 'Gateway of last resort'],
          slug: 'how-a-router-chooses-routing-table-longest-match-and-ad',
          tags: ['routing table', 'RIB', 'AD', 'metric', 'next hop'],
          lab: 'Read a routing table with five sources present and explain why each route won.' },
        { n: '3.2', title: 'Determine how a router makes a forwarding decision by default',
          subs: ['Longest prefix match', 'Administrative distance', 'Routing protocol metric'],
          slug: 'how-a-router-chooses-routing-table-longest-match-and-ad',
          tags: ['longest match', 'best path', 'forwarding'],
          lab: 'Install overlapping /16, /24 and /32 routes and prove which one forwards.' },
        { n: '3.3', title: 'Configure and verify IPv4 and IPv6 static routing',
          subs: ['Default route', 'Network route', 'Host route', 'Floating static'],
          tags: ['static route', 'default route', 'floating static', 'AD'],
          lab: 'Build a floating static backup and fail the primary link to watch it install.' },
        { n: '3.4', title: 'Configure and verify single area OSPFv2', slug: 'ospf-explained-areas-lsas-and-adjacency',
          subs: ['Neighbor adjacencies', 'Point-to-point', 'Broadcast (DR/BDR selection)', 'Router ID'],
          tags: ['OSPF', 'DR', 'BDR', 'LSA', 'adjacency', 'router ID'],
          lab: 'Bring up OSPF on broadcast and point-to-point links and compare adjacency counts.' },
        { n: '3.5', title: 'Describe the purpose, functions, and concepts of first hop redundancy protocols',
          slug: 'fhrp-hsrp-vrrp-glbp-explained',
          tags: ['FHRP', 'HSRP', 'VRRP', 'GLBP', 'virtual IP'] },
      ],
    },
    {
      n: '4.0', title: 'IP Services', weight: 10,
      topics: [
        { n: '4.1', title: 'Configure and verify inside source NAT using static and pools',
          slug: 'nat-pat-explained-inside-outside-local-global',
          tags: ['NAT', 'PAT', 'inside global', 'overload'],
          lab: 'Configure static NAT and PAT, then read the translation table while pinging out.' },
        { n: '4.2', title: 'Configure and verify NTP operating in a client and server mode',
          slug: 'ntp-and-ptp-explained-stratum-offset-and-why-time-matters',
          tags: ['NTP', 'stratum', 'clock', 'time'] },
        { n: '4.3', title: 'Explain the role of DHCP and DNS within the network',
          slug: 'dhcp-dora-process-explained',
          tags: ['DHCP', 'DORA', 'DNS', 'resolution'] },
        { n: '4.4', title: 'Explain the function of SNMP in network operations',
          slug: 'snmp-v2c-v3-mibs-oids-and-traps', tags: ['SNMP', 'MIB', 'trap', 'OID'] },
        { n: '4.5', title: 'Describe the use of syslog features, including facilities and severity levels',
          slug: 'syslog-severities-timestamps-and-conditional-debugging',
          tags: ['syslog', 'severity', 'facility', 'logging'] },
        { n: '4.6', title: 'Configure and verify DHCP client and relay',
          tags: ['DHCP relay', 'ip helper-address', 'giaddr'],
          lab: 'Put a DHCP server one subnet away and make it work with ip helper-address.' },
        { n: '4.7', title: 'Explain the forwarding per-hop behavior (PHB) for QoS such as classification, marking, queuing, congestion, policing, and shaping',
          tags: ['QoS', 'DSCP', 'PHB', 'policing', 'shaping', 'queuing'] },
        { n: '4.8', title: 'Configure network devices for remote access using SSH',
          tags: ['SSH', 'RSA key', 'vty', 'remote access'],
          lab: 'Turn on SSHv2 with a local user and prove Telnet is refused.' },
        { n: '4.9', title: 'Describe the capabilities and functions of TFTP/FTP in the network',
          tags: ['TFTP', 'FTP', 'file transfer', 'image copy'] },
      ],
    },
    {
      n: '5.0', title: 'Security Fundamentals', weight: 15,
      topics: [
        { n: '5.1', title: 'Define key security concepts (threats, vulnerabilities, exploits, and mitigation techniques)',
          tags: ['threat', 'vulnerability', 'exploit', 'risk'] },
        { n: '5.2', title: 'Describe security program elements (user awareness, training, and physical access control)',
          tags: ['awareness', 'training', 'physical security'] },
        { n: '5.3', title: 'Configure and verify device access control using local passwords',
          tags: ['enable secret', 'local user', 'password', 'privilege'] },
        { n: '5.4', title: 'Describe security password policy elements, such as management, complexity, and password alternatives (multifactor authentication, certificates, and biometrics)',
          tags: ['MFA', 'certificate', 'biometrics', 'password policy'] },
        { n: '5.5', title: 'Describe IPsec remote access and site-to-site VPNs',
          slug: 'ipsec-ikev1-phase-1-and-phase-2-explained',
          tags: ['IPsec', 'IKE', 'VPN', 'tunnel', 'transform set'] },
        { n: '5.6', title: 'Configure and verify access control lists',
          slug: 'access-control-lists-wildcards-placement-ipv6-and-urpf',
          tags: ['ACL', 'standard', 'extended', 'wildcard mask'],
          lab: 'Write an extended ACL that permits exactly one application and denies the rest, then read the hit counters.' },
        { n: '5.7', title: 'Configure and verify Layer 2 security features (DHCP snooping, dynamic ARP inspection, and port security)',
          slug: 'layer-2-security-port-security-dhcp-snooping-and-dai',
          tags: ['DHCP snooping', 'DAI', 'port security', 'sticky MAC'],
          lab: 'Run a rogue DHCP server, then stop it with snooping and watch the port err-disable.' },
        { n: '5.8', title: 'Compare authentication, authorization, and accounting concepts',
          tags: ['AAA', 'RADIUS', 'TACACS+', 'accounting'] },
        { n: '5.9', title: 'Describe wireless security protocols (WPA, WPA2, and WPA3)',
          tags: ['WPA', 'WPA2', 'WPA3', 'SAE', 'PSK', '802.11i'] },
        { n: '5.10', title: 'Configure and verify WLAN within the GUI using WPA2 PSK',
          tags: ['WLAN', 'WPA2 PSK', 'WLC'] },
      ],
    },
    {
      n: '6.0', title: 'Automation and Programmability', weight: 10,
      topics: [
        { n: '6.1', title: 'Explain how automation impacts network management', tags: ['automation', 'CLI', 'drift'] },
        { n: '6.2', title: 'Compare traditional networks with controller-based networking',
          tags: ['controller', 'SDN', 'traditional'] },
        { n: '6.3', title: 'Describe controller-based, software defined architecture (overlay, underlay, and fabric)',
          subs: ['Separation of control plane and data plane', 'Northbound and Southbound APIs'],
          tags: ['overlay', 'underlay', 'fabric', 'northbound', 'southbound', 'SDN'] },
        { n: '6.4', title: 'Explain AI (generative and predictive) and machine learning in network operations',
          tags: ['AI', 'AIOps', 'machine learning', 'predictive'] },
        { n: '6.5', title: 'Describe characteristics of REST-based APIs (authentication types, CRUD, HTTP verbs, and data encoding)',
          slug: 'how-http-works-methods-status-codes-and-headers',
          tags: ['REST', 'CRUD', 'HTTP verb', 'API', 'JSON'] },
        { n: '6.6', title: 'Recognize the capabilities of configuration management mechanisms such as Ansible and Terraform',
          tags: ['Ansible', 'Terraform', 'idempotent', 'declarative'] },
        { n: '6.7', title: 'Recognize components of JSON-encoded data', tags: ['JSON', 'key value', 'array', 'object'] },
      ],
    },
  ],
}

// ------------------------------------------------------------
// ENCOR 350-401 v1.2
// ------------------------------------------------------------

const ENCOR: Exam = {
  id: 'encor',
  code: '350-401',
  name: 'Implementing Cisco Enterprise Network Core Technologies',
  short: 'ENCOR',
  version: 'v1.2',
  minutes: 120,
  blurb:
    'The core exam for CCNP and CCIE Enterprise. Architecture, virtualization, infrastructure, assurance, security and automation — breadth over depth, but the depth is assumed.',
  official: 'https://learningcontent.cisco.com/documents/marketing/exam-topics/350-401-ENCORE-v1.2.pdf',
  domains: [
    {
      n: '1.0', title: 'Architecture', weight: 15,
      topics: [
        { n: '1.1', title: 'Explain the different design principles used in an enterprise network',
          subs: ['High-level enterprise network design such as 2-tier, 3-tier, fabric, and cloud', 'High availability techniques such as redundancy, FHRP, and SSO'],
          slug: 'fhrp-hsrp-vrrp-glbp-explained',
          tags: ['design', 'two-tier', 'three-tier', 'fabric', 'SSO', 'NSF', 'redundancy', 'FHRP'],
          lab: 'Build a collapsed core with HSRP and fail the active router while pinging.' },
        { n: '1.2', title: 'Explain the working principles of the Cisco Catalyst SD-WAN solution',
          subs: ['SD-WAN control and data planes elements', 'Benefits and limitations of Catalyst SD-WAN solution'],
          tags: ['SD-WAN', 'vSmart', 'vBond', 'vManage', 'cEdge', 'OMP', 'overlay'] },
        { n: '1.3', title: 'Explain the working principles of the Cisco SD-Access solution',
          subs: ['SD-Access control and data planes elements', 'Traditional campus interoperating with SD-Access'],
          tags: ['SD-Access', 'fabric', 'LISP', 'VXLAN', 'control plane node', 'border', 'edge'] },
        { n: '1.4', title: 'Interpret QoS configurations',
          tags: ['QoS', 'MQC', 'class-map', 'policy-map', 'DSCP', 'shaping', 'policing', 'LLQ'],
          lab: 'Build an MQC policy with LLQ for voice and read the class counters under load.' },
      ],
    },
    {
      n: '2.0', title: 'Virtualization', weight: 10,
      topics: [
        { n: '2.1', title: 'Describe device virtualization technologies',
          subs: ['Hypervisor type 1 and 2', 'Virtual machine', 'Virtual switching'],
          tags: ['hypervisor', 'ESXi', 'KVM', 'vSwitch', 'virtual machine'] },
        { n: '2.2', title: 'Configure and verify data path virtualization technologies',
          parts: [
            { slug: 'vrf-lite-and-gre-tunnels-explained', title: 'VRF-Lite and GRE tunnels',
              blurb: 'Separate routing tables on one router, overlapping address space, route leaking, and the two tunnel VRF commands people swap.' },
            { slug: 'ipsec-ikev1-phase-1-and-phase-2-explained', title: 'IPsec: IKEv1 phase 1 and phase 2',
              blurb: 'The two-phase negotiation, transform sets, and what each phase actually protects.' },
          ],
          subs: ['VRF', 'GRE and IPsec tunneling'],
          tags: ['VRF', 'VRF-lite', 'GRE', 'IPsec', 'tunnel', 'route distinguisher',
                 'tunnel vrf', 'recursive routing', 'tunnel MTU', 'adjust-mss'],
          lab: 'Put two customers in separate VRFs over one router and prove they cannot reach each other.' },
        { n: '2.3', title: 'Describe network virtualization concepts',
          subs: ['LISP', 'VXLAN'],
          tags: ['LISP', 'VXLAN', 'VTEP', 'VNI', 'EID', 'RLOC', 'map server', 'overlay'] },
      ],
    },
    {
      n: '3.0', title: 'Infrastructure', weight: 30,
      topics: [
        { n: '3.1', title: 'Layer 2',
          parts: [
            { slug: 'dot1q-trunking-native-vlan-and-dtp-explained', title: '802.1Q trunking, the native VLAN and DTP',
              blurb: 'The four bytes of the tag in hex, the native VLAN mismatch that merges broadcast domains, and why DTP is a security problem.' },
            { slug: 'etherchannel-lacp-pagp-and-load-balancing-explained', title: 'EtherChannel: LACP, PAgP and load balancing',
              blurb: 'The mode matrix, the LACP state byte, every summary flag, and why one flow never uses more than one member.' },
            { slug: 'spanning-tree-explained-root-election-port-roles-rstp', title: 'Spanning tree: root election, port roles and RSTP',
              blurb: 'The three elections, port states, what RSTP changed, and the edge guards.' },
            { slug: 'mst-multiple-spanning-tree-regions-instances-explained', title: 'MST: regions, instances and the digest',
              blurb: 'One BPDU for every VLAN, the three things a region must agree on, and the capital letter that silently splits it.' },
          ],
          subs: ['Troubleshoot static and dynamic 802.1q trunking protocols', 'Troubleshoot static and dynamic EtherChannels', 'Configure and verify common Spanning Tree Protocols (RSTP, MST) and Spanning Tree enhancements such as root guard and BPDU guard'],
          tags: ['802.1Q', 'trunk', 'DTP', 'native VLAN', 'EtherChannel', 'LACP', 'PAgP', 'port-channel', 'RSTP', 'MST', 'region', 'digest', 'root guard', 'BPDU guard'],
          lab: 'Configure MST with two instances and map VLANs so traffic splits across both uplinks.' },
        { n: '3.2', title: 'Layer 3',
          parts: [
            { slug: 'ospf-explained-areas-lsas-and-adjacency', title: 'OSPF: areas, LSAs and adjacency',
              blurb: 'The single-area picture first — how neighbours form and what the database holds.' },
            { slug: 'ospf-multi-area-summarisation-and-filtering', title: 'OSPF beyond one area: ABRs, summarisation and filtering',
              blurb: 'Multi-area, the LSA types and where each stops, the stub family, and the two summarisation commands.' },
            { slug: 'bgp-neighbors-states-and-why-the-session-wont-come-up', title: 'BGP neighbours: the six states and why yours says Active',
              blurb: 'The session, eBGP versus iBGP, next-hop-self, and a checklist that finds the fault.' },
            { slug: 'bgp-best-path-selection-the-tie-breakers-in-order', title: 'BGP best path selection: the tie-breakers in order',
              blurb: 'All eleven steps, which four you actually use, and the inbound/outbound direction problem.' },
            { slug: 'policy-based-routing-pbr-explained', title: 'Policy-based routing: overriding the table without changing it',
              blurb: 'Matching on source instead of destination, why deny does not drop, and the tracked next hop that stops it black-holing.' },
          ],
          subs: ['Compare routing concepts of EIGRP and OSPF (advanced distance vector vs. link state, load balancing, path selection, path operations, metrics, and area types)', 'Configure simple OSPFv2/v3 environments, including multiple normal areas, summarization, and filtering (neighbor adjacency, point-to-point and broadcast network types, and passive-interface)', 'Configure and verify eBGP between directly connected neighbors (best path selection algorithm and neighbor relationships)', 'Describe policy-based routing'],
          tags: ['EIGRP', 'OSPF', 'BGP', 'eBGP', 'PBR', 'summarization', 'area', 'best path'],
          lab: 'Run OSPF multi-area with summarisation on the ABR, then add eBGP to a second AS.' },
        { n: '3.3', title: 'IP Services',
          parts: [
            { slug: 'ntp-and-ptp-explained-stratum-offset-and-why-time-matters', title: 'NTP and PTP: stratum, offset, and why nothing works when the clock is wrong',
              blurb: 'The four-timestamp exchange, what stratum really means, reading associations, and where PTP earns its hardware.' },
            { slug: 'nat-pat-explained-inside-outside-local-global', title: 'NAT and PAT: inside, outside, local, global',
              blurb: 'The four-term grid, all three NAT types, and the order of operations that decides what an ACL sees.' },
            { slug: 'fhrp-hsrp-vrrp-glbp-explained', title: 'First hop redundancy: HSRP, VRRP and GLBP',
              blurb: 'The virtual MAC trick, HSRP states, tracking and preempt delay, and why VRRP preempts when HSRP does not.' },
            { slug: 'multicast-explained-addressing-igmp-and-rpf', title: 'Multicast 1: addressing, IGMP and the RPF check',
              blurb: 'The address ranges, the 32-to-1 MAC collision, the IGMP lifecycle packet by packet, snooping, and why forwarding is decided backwards.' },
            { slug: 'pim-sparse-mode-rp-spt-switchover-ssm-explained', title: 'Multicast 2: PIM sparse mode, the RP, SPT switchover, SSM and bidir',
              blurb: 'Register to Register-Stop to shortest path tree, the three ways to find an RP, anycast with MSDP, and the two designs that delete the RP.' },
          ],
          subs: ['Interpret network time protocol configurations such as NTP and PTP', 'Configure NAT/PAT', 'Configure first hop redundancy protocols, such as HSRP, VRRP', 'Describe multicast protocols, such as RPF check, PIM SM, IGMP v2/v3, SSM, bidir, and MSDP'],
          tags: ['NTP', 'PTP', 'NAT', 'PAT', 'HSRP', 'VRRP', 'multicast', 'PIM', 'IGMP', 'RPF', 'SSM', 'MSDP'],
          lab: 'Build HSRP with preemption and interface tracking, then fail the tracked uplink. Then build PIM sparse mode end to end and watch the tree move off the RP onto the shortest path.' },
      ],
    },
    {
      n: '4.0', title: 'Network Assurance', weight: 10,
      topics: [
        { n: '4.1', title: 'Diagnose network problems using such as debugs, conditional debugs, traceroute, ping, SNMP, and syslog',
          tags: ['debug', 'conditional debug', 'traceroute', 'ping', 'SNMP', 'syslog'],
          lab: 'Use a conditional debug to isolate one neighbour on a busy router without flooding the console.' },
        { n: '4.2', title: 'Configure and verify Flexible NetFlow',
          slug: 'netflow-flexible-netflow-templates-and-ipfix',
          tags: ['NetFlow', 'flow record', 'flow exporter', 'flow monitor', 'IPFIX'],
          lab: 'Build a custom flow record and read the cache to find the top talker.' },
        { n: '4.3', title: 'Configure SPAN/RSPAN/ERSPAN',
          slug: 'span-rspan-erspan-port-mirroring-explained',
          tags: ['SPAN', 'RSPAN', 'ERSPAN', 'port mirroring', 'capture'],
          lab: 'Mirror a port to a laptop running Wireshark and capture the traffic yourself.' },
        { n: '4.4', title: 'Configure and verify IPSLA',
          slug: 'ip-sla-probes-jitter-and-tracking-objects',
          tags: ['IP SLA', 'probe', 'jitter', 'tracking'],
          lab: 'Track an IP SLA ICMP probe and use it to withdraw a static route on failure.' },
        { n: '4.5', title: 'Describe how Cisco Catalyst Center (formerly Cisco DNA Center) is used to apply network configuration, monitoring, and management using traditional and AI-powered workflows',
          tags: ['Catalyst Center', 'DNA Center', 'assurance', 'AI', 'automation'] },
        { n: '4.6', title: 'Configure and verify NETCONF and RESTCONF',
          tags: ['NETCONF', 'RESTCONF', 'YANG', 'XML', 'JSON', 'port 830'],
          lab: 'Pull an interface config over RESTCONF with curl and then change it.' },
      ],
    },
    {
      n: '5.0', title: 'Security', weight: 20,
      topics: [
        { n: '5.1', title: 'Configure and verify device access control',
          subs: ['Lines and local user authentication', 'Authentication and authorization using AAA'],
          tags: ['AAA', 'TACACS+', 'RADIUS', 'vty', 'local user', 'privilege level'] },
        { n: '5.2', title: 'Configure and verify infrastructure security features',
          subs: ['ACLs', 'CoPP'],
          tags: ['ACL', 'CoPP', 'control plane policing', 'infrastructure ACL'],
          lab: 'Write a CoPP policy that rate-limits ICMP to the control plane and prove it works.' },
        { n: '5.3', title: 'Describe REST API security', tags: ['REST', 'API security', 'token', 'OAuth', 'TLS'] },
        { n: '5.4', title: 'Describe the components of network security design',
          subs: ['Threat defense', 'Endpoint security', 'Next-generation firewall', 'TrustSec and MACsec'],
          tags: ['NGFW', 'endpoint', 'TrustSec', 'SGT', 'MACsec', 'threat defense'] },
      ],
    },
    {
      n: '6.0', title: 'Automation and Artificial Intelligence', weight: 15,
      topics: [
        { n: '6.1', title: 'Interpret basic Python components and scripts', tags: ['Python', 'script', 'loop', 'function'] },
        { n: '6.2', title: 'Construct valid JSON-encoded files', tags: ['JSON', 'encoding', 'validation'] },
        { n: '6.3', title: 'Describe the high-level principles and benefits of a data modeling language, such as YANG',
          tags: ['YANG', 'data model', 'schema', 'OpenConfig'] },
        { n: '6.4', title: 'Describe APIs for Cisco Catalyst Center and SD-WAN Manager',
          tags: ['API', 'Catalyst Center', 'vManage', 'SD-WAN Manager'] },
        { n: '6.5', title: 'Interpret REST API response codes and results in payload using Cisco Catalyst Center and RESTCONF',
          tags: ['REST', 'status code', 'payload', 'RESTCONF'] },
        { n: '6.6', title: 'Construct an EEM applet to automate configuration, troubleshooting, or data collection',
          tags: ['EEM', 'applet', 'event manager', 'automation'],
          lab: 'Write an EEM applet that saves the config and logs a message whenever someone leaves config mode.' },
        { n: '6.7', title: 'Compare agent vs. agentless orchestration tools',
          tags: ['Ansible', 'Puppet', 'Chef', 'agentless', 'orchestration'] },
      ],
    },
  ],
}

// ------------------------------------------------------------
// ENARSI 300-410 v1.1.7
// ------------------------------------------------------------

const ENARSI: Exam = {
  id: 'enarsi',
  code: '300-410',
  name: 'Implementing Cisco Enterprise Advanced Routing and Services',
  short: 'ENARSI',
  version: 'v1.1',
  minutes: 90,
  blurb:
    'The routing concentration, and the one that is almost entirely troubleshooting. Where ENCOR asks you to configure, ENARSI asks you why it broke.',
  official: 'https://learningcontent.cisco.com/documents/marketing/exam-topics/300-410-ENARSI-v1.1.pdf',
  domains: [
    {
      n: '1.0', title: 'Layer 3 Technologies', weight: 35,
      topics: [
        { n: '1.1', title: 'Troubleshoot administrative distance (all routing protocols)',
          slug: 'how-a-router-chooses-routing-table-longest-match-and-ad',
          tags: ['administrative distance', 'AD', 'route selection', 'believability',
                 'floating static', 'longest prefix match', 'RIB', 'FIB', 'CEF'],
          lab: 'Run two protocols advertising the same prefix and move the winner by changing AD.' },
        { n: '1.2', title: 'Troubleshoot route map for any routing protocol (attributes, tagging, filtering)',
          tags: ['route-map', 'match', 'set', 'tag', 'prefix-list'],
          lab: 'Tag routes on redistribution and filter on the tag at the far end.' },
        { n: '1.3', title: 'Troubleshoot loop prevention mechanisms (filtering, tagging, split horizon, route poisoning)',
          tags: ['split horizon', 'route poisoning', 'routing loop', 'tagging', 'filtering'],
          lab: 'Create a redistribution loop between two protocols, then break it with tags.' },
        { n: '1.4', title: 'Troubleshoot redistribution between any routing protocols or routing sources',
          slug: 'route-redistribution-seed-metrics-loops-and-tags',
          tags: ['redistribution', 'seed metric', 'mutual redistribution', 'suboptimal routing',
                 'route tag', 'administrative distance', 'metric-type', 'E1', 'E2', 'default-metric',
                 'feedback loop', 'route-map', 'subnets keyword'],
          lab: 'Mutually redistribute OSPF and EIGRP at two points, build the feedback loop deliberately, then close it with tags.' },
        { n: '1.5', title: 'Troubleshoot manual and auto-summarization with any routing protocol',
          tags: ['summarization', 'auto-summary', 'aggregate', 'discard route', 'Null0'] },
        { n: '1.6', title: 'Configure and verify policy-based routing',
          slug: 'policy-based-routing-pbr-explained',
          tags: ['PBR', 'route-map', 'set ip next-hop', 'set ip default next-hop', 'policy routing',
                 'ip local policy', 'verify-availability', 'IP SLA', 'track', 'ingress'],
          lab: 'Send traffic from one subnet out a different link using PBR and prove it with traceroute.' },
        { n: '1.7', title: 'Configure and verify VRF-Lite',
          slug: 'vrf-lite-and-gre-tunnels-explained',
          tags: ['VRF', 'VRF-lite', 'route distinguisher', 'address family', 'vrf definition',
                 'vrf forwarding', 'route leaking', 'global keyword', 'overlapping address space'],
          lab: 'Two VRFs, overlapping address space, one router — prove full isolation.' },
        { n: '1.8', title: 'Describe Bidirectional Forwarding Detection',
          tags: ['BFD', 'fast failure detection', 'echo', 'asynchronous'] },
        { n: '1.9', title: 'Troubleshoot EIGRP (classic and named mode; VRF and global)',
          subs: ['Address families (IPv4, IPv6)', 'Neighbor relationship and authentication', 'Loop-free path selections (RD, FD, FC, successor, feasible successor, stuck in active)', 'Stubs', 'Load balancing (equal and unequal cost)', 'Metrics'],
          slug: 'eigrp-explained-dual-metrics-and-feasible-successors',
          tags: ['EIGRP', 'DUAL', 'feasible successor', 'SIA', 'stub', 'variance', 'named mode'],
          lab: 'Force a stuck-in-active and read the query path that caused it.' },
        { n: '1.10', title: 'Troubleshoot OSPF (v2/v3)',
          subs: ['Address families (IPv4, IPv6)', 'Neighbor relationship and authentication', 'Network types, area types, and router types', 'Point-to-point, multipoint, broadcast, nonbroadcast', 'Area type: backbone, normal, transit, stub, NSSA, totally stub', 'Internal router, backbone router, ABR, ASBR', 'Virtual link', 'Path preference'],
          parts: [
            { slug: 'ospf-explained-areas-lsas-and-adjacency', title: 'OSPF: areas, LSAs and adjacency',
              blurb: 'Neighbour states, network types, DR/BDR and the link-state database.' },
            { slug: 'ospf-multi-area-summarisation-and-filtering', title: 'OSPF beyond one area: ABRs, summarisation and filtering',
              blurb: 'Area types, every LSA type and its scope, summarisation, and what can be filtered where.' },
          ],
          tags: ['OSPF', 'OSPFv3', 'LSA', 'NSSA', 'stub', 'virtual link', 'ABR', 'ASBR', 'network type'],
          lab: 'Build every area type in one topology and read which LSAs appear in each.' },
        { n: '1.11', title: 'Troubleshoot BGP (Internal and External; unicast and VRF-lite)',
          subs: ['Address families (IPv4, IPv6)', 'Neighbor relationship and authentication (next-hop, multihop, 4-byte AS, private AS, route refresh, synchronization, operation, peer group, states and timers)', 'Path preference (attributes and best-path)', 'Route reflector (excluding multiple route reflectors, confederations, dynamic peer)', 'Policies (inbound/outbound filtering, path manipulation)'],
          parts: [
            { slug: 'bgp-neighbors-states-and-why-the-session-wont-come-up', title: 'BGP neighbours: the six states and why yours says Active',
              blurb: 'eBGP versus iBGP, TTL and multihop, next-hop-self, route reflectors, authentication.' },
            { slug: 'bgp-best-path-selection-the-tie-breakers-in-order', title: 'BGP best path selection: the tie-breakers in order',
              blurb: 'Weight, local preference, AS_PATH, MED and the rest — and which direction each controls.' },
          ],
          tags: ['BGP', 'iBGP', 'eBGP', 'route reflector', 'local preference', 'AS path', 'MED', 'weight', 'best path'],
          lab: 'Build iBGP with a route reflector, then manipulate the path four different ways.' },
      ],
    },
    {
      n: '2.0', title: 'VPN Technologies', weight: 20,
      topics: [
        { n: '2.1', title: 'Describe MPLS operations (LSR, LDP, label switching, LSP)',
          tags: ['MPLS', 'LDP', 'LSR', 'LSP', 'label', 'PHP'] },
        { n: '2.2', title: 'Describe MPLS Layer 3 VPN',
          tags: ['MPLS L3VPN', 'VRF', 'RD', 'RT', 'MP-BGP', 'PE', 'CE'] },
        { n: '2.3', title: 'Configure and verify DMVPN (single hub)',
          subs: ['GRE/mGRE', 'NHRP', 'IPsec', 'Dynamic neighbor', 'Spoke-to-spoke'],
          tags: ['DMVPN', 'mGRE', 'NHRP', 'IPsec', 'spoke to spoke', 'phase 1', 'phase 3'],
          lab: 'Build a single-hub DMVPN and watch a spoke-to-spoke tunnel form on demand.' },
      ],
    },
    {
      n: '3.0', title: 'Infrastructure Security', weight: 20,
      topics: [
        { n: '3.1', title: 'Troubleshoot device security using IOS AAA (TACACS+, RADIUS, local database)',
          tags: ['AAA', 'TACACS+', 'RADIUS', 'local database', 'method list'] },
        { n: '3.2', title: 'Troubleshoot router security features',
          subs: ['IPv4 access control lists (standard, extended, time-based)', 'IPv6 traffic filter', 'Unicast reverse path forwarding (uRPF)'],
          slug: 'access-control-lists-wildcards-placement-ipv6-and-urpf',
          tags: ['ACL', 'time-based ACL', 'IPv6 traffic filter', 'uRPF', 'spoofing'],
          lab: 'Turn on strict uRPF and watch it drop a spoofed source.' },
        { n: '3.3', title: 'Troubleshoot control plane policing (CoPP) (Telnet, SSH, HTTP(S), SNMP, EIGRP, OSPF, BGP)',
          tags: ['CoPP', 'control plane', 'policing', 'protection'] },
        { n: '3.4', title: 'Describe IPv6 First Hop security features (RA guard, DHCP guard, binding table, ND inspection/snooping, source guard)',
          tags: ['IPv6 first hop security', 'RA guard', 'DHCPv6 guard', 'ND inspection', 'source guard', 'binding table'] },
      ],
    },
    {
      n: '4.0', title: 'Infrastructure Services', weight: 25,
      topics: [
        { n: '4.1', title: 'Troubleshoot device management',
          subs: ['Console and VTY', 'Telnet, HTTP, HTTPS, SSH, SCP', '(T)FTP'],
          tags: ['console', 'VTY', 'SSH', 'SCP', 'TFTP', 'management'] },
        { n: '4.2', title: 'Troubleshoot SNMP (v2c, v3)',
          slug: 'snmp-v2c-v3-mibs-oids-and-traps',
          tags: ['SNMP', 'v2c', 'v3', 'community', 'trap', 'inform', 'MIB'] },
        { n: '4.3', title: 'Troubleshoot network problems using logging (local, syslog, debugs, conditional debugs, timestamps, telemetry)',
          slug: 'syslog-severities-timestamps-and-conditional-debugging',
          tags: ['logging', 'syslog', 'debug', 'conditional debug', 'timestamp', 'telemetry'] },
        { n: '4.4', title: 'Troubleshoot IPv4 and IPv6 DHCP (DHCP client, IOS DHCP server, DHCP relay, DHCP options)',
          slug: 'dhcp-dora-process-explained',
          tags: ['DHCP', 'DHCPv6', 'relay', 'option 82', 'DORA', 'helper address'] },
        { n: '4.5', title: 'Troubleshoot network performance issues using IP SLA (jitter, tracking objects, delay, connectivity)',
          slug: 'ip-sla-probes-jitter-and-tracking-objects',
          tags: ['IP SLA', 'jitter', 'tracking', 'delay', 'responder'] },
        { n: '4.6', title: 'Troubleshoot NetFlow (v9, flexible NetFlow, Ipfix)',
          slug: 'netflow-flexible-netflow-templates-and-ipfix',
          tags: ['NetFlow', 'v9', 'flexible NetFlow', 'IPFIX', 'exporter'] },
        { n: '4.7', title: 'Troubleshoot network problems using Cisco Catalyst Center Assurance (formerly Cisco DNA Center) (connectivity, monitoring, device health, network health)',
          tags: ['Catalyst Center', 'DNA Center', 'Assurance', 'device health', 'monitoring'] },
      ],
    },
  ],
}

export const EXAMS: Exam[] = [CCNA, ENCOR, ENARSI]

/** Every topic across every exam, flattened for search. */
export interface FlatTopic extends Topic {
  exam: Exam
  domain: Domain
  /** Everything a search should look through. */
  haystack: string
}

export const ALL_TOPICS: FlatTopic[] = EXAMS.flatMap(exam =>
  exam.domains.flatMap(domain =>
    domain.topics.map(topic => ({
      ...topic,
      exam,
      domain,
      haystack: [
        exam.short, exam.code, domain.n, domain.title,
        topic.n, topic.title, ...(topic.subs ?? []), ...(topic.tags ?? []), topic.lab ?? '',
        ...(topic.parts ?? []).flatMap(part => [part.title, part.blurb ?? '']),
      ].join(' ').toLowerCase(),
    })),
  ),
)

export const COUNTS = {
  topics: ALL_TOPICS.length,
  subs: ALL_TOPICS.reduce((n, t) => n + (t.subs?.length ?? 0), 0),
  labs: ALL_TOPICS.filter(t => t.lab).length,
  written: ALL_TOPICS.filter(t => t.slug || t.parts?.length).length,
  articles: new Set(ALL_TOPICS.flatMap(t => [t.slug ?? '', ...(t.parts ?? []).map(p => p.slug)]).filter(Boolean)).size,
}
