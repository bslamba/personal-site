---
title: "VRF-Lite and GRE: One Router, Many Routing Tables, and the Two VRF Commands People Swap"
excerpt: "A VRF gives a router a second routing table that knows nothing about the first — so two customers can both use 10.1.1.0/24 on the same box and never meet. The concept is easy; the operational detail is where it bites. Assigning an interface to a VRF silently deletes its IP address, every troubleshooting command you know needs a new keyword, and on a GRE tunnel there are two different VRF commands that mean opposite things."
date: "2026-09-22"
tags: ["VRF", "VRF-Lite", "GRE", "Tunnel", "Virtualization", "Routing", "ENARSI", "ENCOR", "CCNP"]
draft: false
---

> **Blueprint:** ENARSI 300-410 — 1.7 *Configure and verify VRF-Lite*. ENCOR 350-401 — 2.2 *Configure and verify data path virtualization technologies: VRF, GRE and IPsec tunneling*. For the IPsec half see [IPsec IKEv1 phase 1 and phase 2](/blog/ipsec-ikev1-phase-1-and-phase-2-explained).

## Cheat sheet

| | |
|---|---|
| **What a VRF is** | A separate routing table **and** forwarding table on the same router |
| **What decides which one** | The **input interface**. Nothing else |
| **Overlapping addresses** | Allowed and normal — that is the point |
| **Modern syntax** | `vrf definition NAME` + `address-family ipv4` |
| **Legacy syntax** | `ip vrf NAME` — IPv4 only, still seen everywhere |
| **On the interface** | `vrf forwarding NAME` — **and this deletes the IP address** |
| **Route distinguisher** | **Not required** for VRF-Lite. Required for MPLS VPN |
| **Every command changes** | `ping vrf RED` · `show ip route vrf RED` · `traceroute vrf RED` |
| **GRE overhead** | **24 bytes** — 20 outer IP + 4 GRE. Tunnel MTU 1476 on a 1500 underlay |
| **GRE IP protocol** | **47** |
| **`vrf forwarding` on a tunnel** | The VRF the tunnel **carries** (inner packets) |
| **`tunnel vrf`** | The VRF the tunnel **travels through** (outer packets) |

**The one sentence.** A VRF is not a filter and not an ACL — it is a *different routing table*. Traffic does not cross between VRFs because there is no route, not because something is blocking it.

---

## One router, two customers, the same subnet

Conventional routing gives a router exactly one routing table. Every interface shares it, every route lives in it, and any two subnets on the box can reach each other unless you actively prevent it.

VRF-Lite gives the router **several independent routing tables**, and binds each interface to one of them. A packet arriving on an interface in VRF RED is looked up in RED's table, forwarded out of a RED interface, and has no way of reaching anything in BLUE — because BLUE's routes simply are not in the table being consulted.

<figure class="fig">
<svg class="sv1" viewBox="0 0 640 250" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="One router holding two independent routing tables, each with the same prefix pointing at a different interface">
  <style>.sv1 .n{fill:#17171A}.sv1 .nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.sv1 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv1 .m{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;fill:#17171A}.sv1 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv1 .red{fill:rgba(211,0,45,.08);stroke:#D3002D}.sv1 .blue{fill:rgba(75,123,236,.08);stroke:#4b7bec}.sv1 .hdr{font-family:ui-sans-serif,system-ui;font-size:10px;font-weight:700;letter-spacing:.06em}
  </style>
  <rect x="236" y="30" width="168" height="188" fill="#F1EEE9" stroke="#B5B5BC"/>
  <text class="hdr" x="320" y="50" text-anchor="middle" fill="#5C5C64">ONE ROUTER</text>
  <rect class="red" x="252" y="62" width="136" height="64"/>
  <text class="hdr" x="262" y="80" fill="#B80027">VRF RED</text>
  <text class="m" x="262" y="100">10.1.1.0/24</text>
  <text class="m" x="262" y="116" fill="#B80027">→ Gi0/1</text>
  <rect class="blue" x="252" y="138" width="136" height="64"/>
  <text class="hdr" x="262" y="156" fill="#2b5ab8">VRF BLUE</text>
  <text class="m" x="262" y="176">10.1.1.0/24</text>
  <text class="m" x="262" y="192" fill="#2b5ab8">→ Gi0/3</text>
  <rect class="n" x="24" y="76" width="96" height="30" rx="3"/><text class="nt" x="72" y="96" text-anchor="middle">CUSTOMER A</text>
  <text class="s" x="72" y="122" text-anchor="middle">10.1.1.0/24</text>
  <rect class="n" x="24" y="152" width="96" height="30" rx="3"/><text class="nt" x="72" y="172" text-anchor="middle">CUSTOMER B</text>
  <text class="s" x="72" y="198" text-anchor="middle">10.1.1.0/24</text>
  <line x1="120" y1="91" x2="236" y2="91" stroke="#D3002D" stroke-width="2.5"/>
  <line x1="120" y1="167" x2="236" y2="167" stroke="#4b7bec" stroke-width="2.5"/>
  <text class="s" x="178" y="84" text-anchor="middle" fill="#B80027">Gi0/0</text>
  <text class="s" x="178" y="160" text-anchor="middle" fill="#2b5ab8">Gi0/2</text>
  <line x1="404" y1="91" x2="520" y2="91" stroke="#D3002D" stroke-width="2.5"/>
  <line x1="404" y1="167" x2="520" y2="167" stroke="#4b7bec" stroke-width="2.5"/>
  <rect class="n" x="520" y="76" width="96" height="30" rx="3"/><text class="nt" x="568" y="96" text-anchor="middle">A's SERVERS</text>
  <rect class="n" x="520" y="152" width="96" height="30" rx="3"/><text class="nt" x="568" y="172" text-anchor="middle">B's SERVERS</text>
  <circle r="4" fill="#D3002D"><animateMotion dur="2s" repeatCount="indefinite" path="M 120 91 L 520 91"/></circle>
  <circle r="4" fill="#4b7bec"><animateMotion dur="2s" begin="0.7s" repeatCount="indefinite" path="M 120 167 L 520 167"/></circle>
  <text class="k" x="320" y="240" text-anchor="middle">The same prefix, twice, in one router — and neither table has ever heard of the other.</text>
</svg>
<figcaption><b>Figure 1.</b> Both customers use 10.1.1.0/24 and both work. The router is not choosing between them; it is looking in a different book depending on which door the packet came through.</figcaption>
</figure>

<div class="why">
<b>Why this is not a security feature you can lean on carelessly</b>
The isolation is real and it is structural — there is no route, so there is no path. But it is isolation of the <b>data plane on this router</b>, and it lasts exactly as long as nobody leaks routes between the tables. A single static route with the <code>global</code> keyword, or an import/export policy, punches a hole straight through it. Treat a VRF as a strong default rather than an enforced boundary, and put an ACL or a firewall at any point where you deliberately join two VRFs together.
</div>

---

## The command that catches everyone, once

<div class="cmd">
<div class="cmd-line"><span class="t">vrf definition</span> <span class="opt">RED</span>
 <span class="t">rd</span> <span class="opt">65001:1</span>
 <span class="t">address-family ipv4</span>
 exit-address-family
!
interface GigabitEthernet0/0
 <span class="t">vrf forwarding</span> <span class="opt">RED</span>
 <span class="t">ip address</span> <span class="opt">10.1.1.1 255.255.255.0</span></div>
<dl class="cmd-parts">
<div class="is-key"><dt>vrf definition RED</dt><dd>The modern syntax, and the one to use. The legacy <code>ip vrf RED</code> still works on most platforms but is <b>IPv4 only</b> — it has no address-family structure, so it cannot carry IPv6. You will meet both in the field; the two forms cannot be mixed for the same VRF, and converting requires removing the interfaces first.</dd></div>
<div><dt>rd 65001:1</dt><dd>The route distinguisher. <b>Not required for VRF-Lite</b> — it exists to make overlapping prefixes unique when they are carried in MP-BGP for an MPLS VPN. Configure it anyway: it costs nothing, some features refuse to work without it, and it makes the VRF usable the day somebody adds BGP.</dd></div>
<div class="is-key"><dt>address-family ipv4</dt><dd>Must be present, even for a plain IPv4 VRF. A <code>vrf definition</code> with no address family exists but forwards nothing, and the interface command will be rejected or silently ineffective. This is the difference that trips people converting from <code>ip vrf</code>.</dd></div>
<div class="is-key"><dt>vrf forwarding RED</dt><dd><b>This command deletes the interface's IP address.</b> Not disables — deletes. IOS prints a warning and moves on, and if you were typing the configuration in the order you had it written down, you have just removed the address and not put it back. <b>Always apply <code>vrf forwarding</code> first, then the IP address</b>, in that order. Doing it the other way round on a remote router is how people lose access to it.</dd></div>
<div><dt><span class="opt">(what else moves)</span></dt><dd>The interface leaves the global table entirely. Any static route, routing-protocol network statement, ACL reference or HSRP group that pointed at it needs to be recreated inside the VRF. Nothing warns you about these; they simply stop being part of anything.</dd></div>
</dl>
</div>

<div class="warn">
<b>Every command you know now needs a keyword</b>
<code>ping 10.1.1.10</code> uses the <b>global</b> table and will fail, even though the address is right there on an interface. It is <code>ping vrf RED 10.1.1.10</code>. The same applies to <code>traceroute vrf RED</code>, <code>show ip route vrf RED</code>, <code>show ip arp vrf RED</code>, <code>show ip cef vrf RED</code>, <code>telnet x.x.x.x /vrf RED</code> and <code>copy</code> with <code>ip ssh source-interface</code> inside a VRF. Forgetting the keyword produces a failure that looks exactly like a broken network, and the single most common reaction to it is to start changing configuration that was never wrong.
</div>

---

## Following a packet through

<div class="walk">
<div class="walk-head">Which table gets consulted, and why nothing leaks <span class="walk-hint">click a step</span></div>
<div class="walk-tabs">
  <input type="radio" name="vrfw" id="vf1" checked><label for="vf1"><span class="step-n">1</span>Arrival</label>
  <input type="radio" name="vrfw" id="vf2"><label for="vf2"><span class="step-n">2</span>Lookup</label>
  <input type="radio" name="vrfw" id="vf3"><label for="vf3"><span class="step-n">3</span>The other VRF</label>
  <input type="radio" name="vrfw" id="vf4"><label for="vf4"><span class="step-n">4</span>Leaking on purpose</label>
</div>
<div class="walk-panels">
<div class="walk-panel">
<svg class="sv2" viewBox="0 0 640 185" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The input interface determines which routing table the packet is looked up in">
  <style>.sv2 .n{fill:#17171A}.sv2 .nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.sv2 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv2 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv2 .m{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;fill:#17171A}.sv2 .bx{fill:#F1EEE9;stroke:#B5B5BC}</style>
  <rect class="n" x="20" y="62" width="96" height="30" rx="3"/><text class="nt" x="68" y="82" text-anchor="middle">10.1.1.10</text>
  <line x1="116" y1="77" x2="212" y2="77" stroke="#D3002D" stroke-width="2.5"/>
  <rect x="212" y="58" width="150" height="38" rx="3" fill="rgba(211,0,45,.14)" stroke="#D3002D"/>
  <text class="m" x="287" y="82" text-anchor="middle" fill="#B80027">Gi0/0 · vrf RED</text>
  <circle r="5" fill="#D3002D"><animateMotion dur="1.8s" repeatCount="indefinite" path="M 116 77 L 212 77"/></circle>
  <text class="k" x="287" y="40" text-anchor="middle" fill="#B80027">the input interface IS the decision</text>
  <text class="s" x="320" y="124" text-anchor="middle">There is no tag in the packet, no VLAN, nothing in the header that names a VRF.</text>
  <text class="s" x="320" y="142" text-anchor="middle">Membership is a property of the <tspan font-weight="700">interface</tspan>, held entirely inside the router.</text>
  <text class="s" x="320" y="166" text-anchor="middle">Move the cable to a port in another VRF and the same packet is routed by a different table.</text>
</svg>
<p class="walk-say"><span class="walk-title">Arrival — the interface decides, and nothing else can</span>
The packet carries no marker. VRF membership is not in the frame or the IP header; it is a property of the port it arrived on. That is why VRF-Lite scales only as far as your interfaces do — to extend a VRF to the next router you need either a dedicated link per VRF, or one trunk with a subinterface per VRF, which is how it is almost always done.</p>
</div>
<div class="walk-panel">
<svg class="sv3" viewBox="0 0 640 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The lookup happens in the RED table only and the global table is not consulted">
  <style>.sv3 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv3 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv3 .m{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;fill:#17171A}.sv3 .hdr{font-family:ui-sans-serif,system-ui;font-size:10px;font-weight:700;letter-spacing:.06em}</style>
  <rect x="20" y="40" width="180" height="96" fill="rgba(211,0,45,.10)" stroke="#D3002D"/>
  <text class="hdr" x="32" y="60" fill="#B80027">VRF RED — CONSULTED</text>
  <text class="m" x="32" y="82">10.1.1.0/24  Gi0/0</text>
  <text class="m" x="32" y="100">10.1.2.0/24  Gi0/1</text>
  <text class="m" x="32" y="118">0.0.0.0/0    Gi0/1</text>
  <rect x="228" y="40" width="180" height="96" fill="#F1EEE9" stroke="#B5B5BC" opacity=".45"/>
  <text class="hdr" x="240" y="60" fill="#8A8A93">VRF BLUE — NOT CONSULTED</text>
  <text class="m" x="240" y="82" opacity=".45">10.1.1.0/24  Gi0/2</text>
  <text class="m" x="240" y="100" opacity=".45">10.9.9.0/24  Gi0/3</text>
  <rect x="436" y="40" width="180" height="96" fill="#F1EEE9" stroke="#B5B5BC" opacity=".45"/>
  <text class="hdr" x="448" y="60" fill="#8A8A93">GLOBAL — NOT CONSULTED</text>
  <text class="m" x="448" y="82" opacity=".45">192.0.2.0/24 Gi0/9</text>
  <text class="m" x="448" y="100" opacity=".45">0.0.0.0/0    Gi0/9</text>
  <text class="k" x="320" y="168" text-anchor="middle" fill="#B80027">Three tables exist. Exactly one is opened.</text>
  <text class="s" x="320" y="190" text-anchor="middle">If the destination is not in RED, the packet is dropped — even if a perfect route sits in one of the others.</text>
</svg>
<p class="walk-say"><span class="walk-title">Lookup — in one table, completely</span>
The router does not search RED and then fall back to global. There is no fallback. A destination absent from RED is unreachable from RED, full stop, and the router sends an ICMP unreachable exactly as it would for any missing route.
<br><br>This is the source of the classic "my VRF has no internet" surprise: the default route is in the <b>global</b> table where you put it, and RED cannot see it. Each VRF needs its own default, or a deliberate leak.</p>
</div>
<div class="walk-panel">
<svg class="sv4" viewBox="0 0 640 195" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A host in one VRF cannot reach a host in the other even though the router has both interfaces">
  <style>.sv4 .n{fill:#17171A}.sv4 .nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.sv4 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv4 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv4 .m{font-family:ui-monospace,Menlo,monospace;font-size:10.5px}</style>
  <rect class="n" x="20" y="44" width="110" height="30" rx="3"/><text class="nt" x="75" y="64" text-anchor="middle">RED host</text>
  <rect class="n" x="20" y="118" width="110" height="30" rx="3"/><text class="nt" x="75" y="138" text-anchor="middle">BLUE host</text>
  <rect x="250" y="44" width="150" height="104" fill="#F1EEE9" stroke="#B5B5BC"/>
  <text class="s" x="325" y="66" text-anchor="middle">one router</text>
  <text class="s" x="325" y="88" text-anchor="middle" fill="#B80027">vrf RED</text>
  <text class="s" x="325" y="126" text-anchor="middle" fill="#2b5ab8">vrf BLUE</text>
  <line x1="130" y1="59" x2="250" y2="80" stroke="#D3002D" stroke-width="2.5"/>
  <line x1="130" y1="133" x2="250" y2="118" stroke="#4b7bec" stroke-width="2.5"/>
  <path d="M 325 96 L 325 112" stroke="#D3002D" stroke-width="2.5" stroke-dasharray="4 4"/>
  <line x1="316" y1="96" x2="334" y2="112" stroke="#D3002D" stroke-width="2.5"/>
  <line x1="334" y1="96" x2="316" y2="112" stroke="#D3002D" stroke-width="2.5"/>
  <text class="k" x="470" y="86" fill="#B80027">no route,</text>
  <text class="k" x="470" y="104" fill="#B80027">therefore no path</text>
  <text class="s" x="320" y="174" text-anchor="middle">Nothing is filtering this. There is simply no entry in RED's table for anything of BLUE's,</text>
  <text class="s" x="320" y="190" text-anchor="middle">and the two tables have no relationship at all.</text>
</svg>
<p class="walk-say"><span class="walk-title">The isolation is structural, not enforced</span>
No ACL is involved. The router is not deciding to refuse anything — it looked in RED's table, found nothing for BLUE's prefix, and dropped the packet the way it drops any packet with no route.
<br><br>That distinction matters when you write up a design. "Separated by ACL" is a control that can be misconfigured a rule at a time; "separated by VRF" fails closed, because the mechanism that would carry the traffic does not exist. It is a genuinely stronger default — right up until somebody leaks a route.</p>
</div>
<div class="walk-panel">
<svg class="sv5" viewBox="0 0 640 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A static route with the global keyword deliberately leaks one prefix between a VRF and the global table">
  <style>.sv5 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv5 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv5 .m{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;fill:#17171A}.sv5 .hdr{font-family:ui-sans-serif,system-ui;font-size:10px;font-weight:700;letter-spacing:.06em}</style>
  <rect x="20" y="40" width="230" height="80" fill="rgba(211,0,45,.10)" stroke="#D3002D"/>
  <text class="hdr" x="32" y="60" fill="#B80027">VRF RED</text>
  <text class="m" x="32" y="82">10.1.1.0/24  Gi0/0</text>
  <text class="m" x="32" y="102" fill="#0f6b47">0.0.0.0/0    → global</text>
  <rect x="390" y="40" width="230" height="80" fill="#F1EEE9" stroke="#B5B5BC"/>
  <text class="hdr" x="402" y="60" fill="#5C5C64">GLOBAL</text>
  <text class="m" x="402" y="82">0.0.0.0/0    Gi0/9 → internet</text>
  <text class="m" x="402" y="102" fill="#0f6b47">10.1.1.0/24  → vrf RED</text>
  <path d="M 254 74 L 386 74" stroke="#1f9d6b" stroke-width="2.5" fill="none"/>
  <path d="M 386 100 L 254 100" stroke="#1f9d6b" stroke-width="2.5" fill="none"/>
  <circle r="4.5" fill="#1f9d6b"><animateMotion dur="1.8s" repeatCount="indefinite" path="M 254 74 L 386 74"/></circle>
  <circle r="4.5" fill="#1f9d6b"><animateMotion dur="1.8s" begin="0.9s" repeatCount="indefinite" path="M 386 100 L 254 100"/></circle>
  <text class="k" x="320" y="150" text-anchor="middle" fill="#0f6b47">Both directions must be configured. A leak in one direction only is a black hole.</text>
  <text class="m" x="320" y="176" text-anchor="middle">ip route vrf RED 0.0.0.0 0.0.0.0 192.0.2.254 global</text>
  <text class="m" x="320" y="196" text-anchor="middle">ip route 10.1.1.0 255.255.255.0 GigabitEthernet0/0</text>
</svg>
<p class="walk-say"><span class="walk-title">Leaking, when you mean to</span>
The <code>global</code> keyword on a static route says "the next hop is in the global table, not in this VRF". It is the standard way to give a VRF internet access without MPLS or BGP.
<br><br><b>The trap is that routing is two-way and a leak is not.</b> The route above gets packets out of RED; the return traffic arrives in the global table and needs its own route back into RED. Configure one and not the other and you have a path that works in one direction, which presents as "it half works" — usually described by the user as "the internet is slow".
<br><br>For anything more than a handful of prefixes, use MP-BGP with import and export route-targets instead. Static leaks do not scale and nobody remembers they are there.</p>
</div>
</div>
</div>

---

## Running a routing protocol inside a VRF

<div class="cmd">
<div class="cmd-line">router ospf <span class="opt">10</span> <span class="t">vrf</span> <span class="opt">RED</span>
 network 10.1.0.0 0.0.255.255 area 0
!
router eigrp <span class="opt">ENTERPRISE</span>
 <span class="t">address-family ipv4 unicast vrf</span> <span class="opt">RED autonomous-system</span> <span class="opt">100</span>
!
router bgp 65001
 <span class="t">address-family ipv4 vrf</span> <span class="opt">RED</span></div>
<dl class="cmd-parts">
<div class="is-key"><dt>router ospf 10 vrf RED</dt><dd>OSPF needs a <b>separate process per VRF</b> — process 10 for RED, process 20 for BLUE. They are entirely independent: separate databases, separate SPF runs, separate router IDs. Platforms cap the number of processes, which is a real limit if you are building dozens of VRFs.</dd></div>
<div class="is-key"><dt>EIGRP named mode</dt><dd>VRF support requires <b>named mode</b>. Classic <code>router eigrp 100</code> cannot do VRFs at all — if you are adding VRFs to a network running classic EIGRP, converting is part of the job, not an optional tidy-up. Note that the autonomous-system number moves into the address-family line.</dd></div>
<div><dt>BGP address-family</dt><dd>One BGP process, an address family per VRF. This is also the route into proper route leaking — <code>import</code> and <code>export</code> route-targets under the VRF definition let BGP move prefixes between VRFs without a static route per prefix.</dd></div>
<div><dt><span class="opt">(what stays global)</span></dt><dd>The router's own management traffic. SSH, NTP, syslog, SNMP and TACACS all use the global table unless you tell them otherwise — and if your management interface is <em>inside</em> a VRF, every one of those needs a <code>vrf</code> keyword too. A management VRF that cannot reach the syslog server is a very common outcome of a half-finished migration.</dd></div>
</dl>
</div>

---

## GRE, and the two VRF commands

A GRE tunnel is a virtual point-to-point link built over any routed path. It takes the original packet, wraps it in a new IP header with **protocol 47**, and sends it to the far tunnel endpoint, which unwraps it.

<div class="cap">
<div class="cap-head">Capture · the same ping, inside and outside the tunnel <span class="cap-filter">ip.proto == 47</span></div>
<div class="cap-hex"><pre>INNER — what the host sent, 36 bytes
0000  45 00 00 24 1f 4c 00 00  80 <mark>01</mark> 04 78 <mark>0a 01 01 0a</mark>   E..$.L.....x....
0010  <mark>0a 01 02 0a</mark> 08 00 65 69  01 00 00 01 61 62 63 64   ......ei....abcd
0020  65 66 67 68                                          efgh

OUTER — the same packet on the underlay, 60 bytes
0000  45 00 00 3c 3a 71 00 00  ff <mark>2f</mark> fd 1d <mark>c0 00 02 01</mark>   E..&lt;:q.../......
0010  <mark>c0 00 02 02</mark> <mark>00 00 08 00</mark>  <mark>45 00 00 24</mark> 1f 4c 00 00   ........E..$.L..
0020  80 01 04 78 0a 01 01 0a  0a 01 02 0a 08 00 65 69   ...x..........ei
0030  01 00 00 01 61 62 63 64  65 66 67 68               ....abcdefgh</pre></div>
<div class="cap-note"><b>24 bytes of overhead, and you can count them.</b> 60 minus 36. The outer header is 20 bytes of IP with <code>2f</code> — protocol <b>47, GRE</b> — and <code>c0 00 02 01</code> → <code>c0 00 02 02</code>, the tunnel endpoints, which are <em>underlay</em> addresses and have nothing to do with the traffic inside.
<br><br>Then four bytes of GRE: <code>00 00</code> flags (no checksum, no key, no sequence number) and <code>08 00</code> — the protocol type, meaning the payload is IPv4. Immediately after, at offset 0x18, <b>a second IP header begins</b>: <code>45 00 00 24</code>, the original packet, byte for byte unchanged including its TTL and checksum.
<br><br><b>That is why tunnel MTU is 1476 on a 1500-byte underlay</b>, and why large packets across a GRE tunnel are the first thing to suspect when small ones work and file transfers hang.</div>
</div>

<div class="cmd">
<div class="cmd-line">interface Tunnel0
 <span class="t">vrf forwarding</span> <span class="opt">RED</span>                  <span class="opt">! what the tunnel CARRIES</span>
 <span class="t">ip address</span> <span class="opt">172.16.0.1 255.255.255.252</span>
 <span class="t">tunnel source</span> <span class="opt">GigabitEthernet0/9</span>
 <span class="t">tunnel destination</span> <span class="opt">192.0.2.2</span>
 <span class="t">tunnel vrf</span> <span class="opt">TRANSPORT</span>              <span class="opt">! where the tunnel TRAVELS</span>
 <span class="t">ip mtu</span> <span class="opt">1400</span>
 <span class="t">ip tcp adjust-mss</span> <span class="opt">1360</span></div>
<dl class="cmd-parts">
<div class="is-key"><dt>vrf forwarding RED</dt><dd>The VRF of the <b>inner</b> packets — the traffic the tunnel carries. Set this and the tunnel interface becomes part of RED's routing table, so routes learned over it land in RED.</dd></div>
<div class="is-key"><dt>tunnel vrf TRANSPORT</dt><dd>The VRF the <b>outer</b> packets travel in — where <code>tunnel source</code> and <code>tunnel destination</code> are resolved. <b>These two commands are not alternatives and they are not interchangeable.</b> A tunnel can carry VRF RED across an underlay that lives in VRF TRANSPORT, or in the global table if you omit this. Swapping them produces a tunnel that will not come up and an error message that does not obviously say why.</dd></div>
<div class="is-key"><dt>tunnel source<br>tunnel destination</dt><dd>Underlay addresses, resolved in the transport VRF. <b>Use a loopback as the source</b> where you can — a physical interface takes the tunnel down when that one link fails, even if another path exists.</dd></div>
<div><dt>ip mtu 1400</dt><dd>Below the 1476 that GRE alone permits, leaving headroom for anything added later (IPsec, another tag). Setting it too high is invisible until somebody transfers a large file.</dd></div>
<div class="is-key"><dt>ip tcp adjust-mss 1360</dt><dd>Rewrites the MSS in TCP SYNs crossing the tunnel so hosts never generate segments too big to fit. This is the line that fixes "ping works, HTTPS hangs" — the classic MTU symptom, caused by path MTU discovery failing because somebody filtered ICMP. <b>Configure it on every GRE tunnel</b>; it costs nothing and prevents a fault that is genuinely painful to diagnose.</dd></div>
</dl>
</div>

<div class="warn">
<b>Recursive routing — the way GRE tunnels kill themselves</b>
If the route to the <b>tunnel destination</b> is learned <b>through the tunnel</b>, the tunnel needs itself to exist in order to exist. IOS detects this and shuts it down:
<br><br><code>%TUN-5-RECURDOWN: Tunnel0 temporarily disabled due to recursive routing</code>
<br><br>It happens most often when you redistribute the underlay network into the routing protocol running over the tunnel, or advertise a summary that covers the tunnel endpoints. The tunnel flaps — up, down, up, down — on a cycle set by your routing timers.
<br><br>The fixes, in order of preference: <b>keep the underlay and the overlay in separate routing domains</b> (which is exactly what <code>tunnel vrf</code> makes structural rather than a matter of discipline); or pin a static host route to the tunnel destination via the underlay; or filter the endpoint prefix out of the overlay protocol.
</div>

---

## Verifying it

<div class="term">
<div class="term-bar"><span class="term-dots"><i></i><i></i><i></i></span>R1 — everything needs the keyword</div>
<pre><span class="p">R1#</span> <span class="c">show vrf</span>
  Name       Default RD     Protocols   Interfaces
  <span class="y">RED</span>        65001:1        ipv4        Gi0/0, Gi0/1, Tu0
  <span class="y">BLUE</span>       65001:2        ipv4        Gi0/2, Gi0/3

<span class="p">R1#</span> <span class="c">show ip route vrf RED</span>
Routing Table: <span class="y">RED</span>
      10.0.0.0/8 is variably subnetted, 3 subnets, 2 masks
C        10.1.1.0/24 is directly connected, GigabitEthernet0/0
O        10.1.2.0/24 [110/2] via 172.16.0.2, 00:14:02, Tunnel0
S*       0.0.0.0/0 [1/0] via 192.0.2.254, <span class="g">global</span>       <span class="o">&lt;- the leak, visible</span>

<span class="p">R1#</span> <span class="c">ping 10.1.1.10</span>
<span class="r">.....</span>
Success rate is 0 percent (0/5)
<span class="o">! Not a network fault. That used the GLOBAL table, which has never heard of 10.1.1.0/24.</span>

<span class="p">R1#</span> <span class="c">ping vrf RED 10.1.1.10</span>
<span class="g">!!!!!</span>
Success rate is 100 percent (5/5), round-trip min/avg/max = 1/1/4 ms

<span class="p">R1#</span> <span class="c">show interfaces Tunnel0</span>
Tunnel0 is up, line protocol is up
  Tunnel source 192.0.2.1 (Loopback0), destination 192.0.2.2
  Tunnel Subblocks:
     src-track: Tunnel0 source tracking subblock associated with Loopback0
  Tunnel protocol/transport <span class="y">GRE/IP</span>
  Tunnel <span class="y">TTL 255</span>, Fast tunneling enabled
  Tunnel transport MTU <span class="y">1476</span> bytes                 <span class="o">&lt;- 1500 minus 24</span>
  Tunnel is in <span class="y">VRF TRANSPORT</span>                     <span class="o">&lt;- the OUTER vrf</span><span class="cur"></span></pre>
</div>
<p class="term-cap"><b>The two pings are the lesson.</b> A failure caused by a missing <code>vrf</code> keyword is indistinguishable from a real outage, and it sends people off editing configuration that was correct all along. When anything in a VRF network "does not work", the first question is always whether the command you ran was actually looking in the right table.</p>

---

<div class="real">
<b>In the real world</b>
VRF migrations fail on the management plane, not the data plane. The routing works on the first attempt; what breaks is everything the router does <em>for itself</em>. SSH from the NOC stops because the management interface moved into a VRF and the VTY lines still listen globally. Syslog goes silent. NTP drifts. TACACS times out, so authentication falls back to local — and nobody notices until the local password is the only way in. Each of those needs its own VRF-aware line: <code>ip ssh source-interface</code>, <code>logging host … vrf</code>, <code>ntp server … vrf</code>, <code>ip tacacs source-interface</code>.
<br><br>Write that list before the change, not after. The data plane will tell you immediately when it is wrong; the management plane will wait until you need it.
</div>

## What goes wrong

**The interface lost its IP address.** `vrf forwarding` removes it. Apply the VRF first, then the address.

**Ping fails but the route is right there.** You pinged from the global table. `ping vrf RED`.

**The VRF has no internet.** The default route is in the global table. Each VRF needs its own, or a leak with `global` — in **both** directions.

**Routes leak one way only.** A static leak is directional. Configure the return route too.

**EIGRP will not accept a VRF.** Classic mode does not support VRFs. Convert to named mode.

**The tunnel will not come up.** `tunnel vrf` and `vrf forwarding` swapped, or the tunnel destination is not reachable *in the transport VRF*. Check with `ping vrf TRANSPORT <destination>`.

**The tunnel flaps with `%TUN-5-RECURDOWN`.** Recursive routing — the route to the tunnel destination is being learned through the tunnel.

**Small packets work, large transfers hang.** MTU. Add `ip mtu` and `ip tcp adjust-mss`.

**Management stopped working after the migration.** SSH, syslog, NTP and TACACS all use the global table by default. Each needs its own VRF-aware configuration.

---

<div class="lab">
<div class="lab-head">Lab — two customers on one router, then a tunnel between two sites</div>
<div class="lab-body">

<div class="lab-target"><b>Target</b>
Put two customers with <em>identical</em> addressing on one router and prove they cannot reach each other; experience the IP-address deletion and the missing-keyword failure deliberately rather than at 2am; give one VRF internet access with a static leak and discover the return route by breaking it; then build a GRE tunnel that carries a VRF across an underlay, break it with recursive routing on purpose, and measure the MTU cliff.</div>

**Topology.** R1 with four inside interfaces: Gi0/0 and Gi0/1 for customer RED, Gi0/2 and Gi0/3 for customer BLUE. Both customers use `10.1.1.0/24` and `10.1.2.0/24`. Gi0/9 is the global uplink. A second router R2 at the far end of the underlay for the tunnel.

<p class="lab-step"><span class="n">1</span>Lose an IP address on purpose</p>

Configure Gi0/0 with `10.1.1.1/24` **first**, then apply `vrf forwarding RED`.

```cisco
R1# show ip interface brief | include Gi0/0
```

<div class="lab-watch"><b>Things to notice</b>
The address is <b>gone</b>, and IOS told you in a single line you probably scrolled past. Now imagine doing that over SSH on the interface you are connected through.
<br><br>Do it in the correct order on Gi0/1 — VRF first, then address — and note that this is the ordering you should build into any template. Then check <code>show running-config interface Gi0/0</code> and confirm the VRF line appears <em>above</em> the IP address line: IOS writes it in the order that works, which is a small hint it expects you to follow.</div>

<p class="lab-step"><span class="n">2</span>Build both VRFs with the same addresses</p>

```cisco
vrf definition RED
 rd 65001:1
 address-family ipv4
!
vrf definition BLUE
 rd 65001:2
 address-family ipv4
```

Assign Gi0/0 and Gi0/1 to RED, Gi0/2 and Gi0/3 to BLUE, and give **both** customers 10.1.1.1 and 10.1.2.1 on their respective interfaces.

```cisco
R1# show vrf
R1# show ip route vrf RED
R1# show ip route vrf BLUE
```

<div class="lab-watch"><b>Things to notice</b>
The same two prefixes appear in both tables, pointing at different interfaces, and the router is completely untroubled by it. That is the whole feature in one screen. Then from a RED host, try to reach a BLUE host — it fails, and <code>show ip route vrf RED</code> shows why: there is simply no entry.
<br><br>Run <code>show ip route</code> with no keyword and note that the global table is nearly empty. Every interface you moved has left it.</div>

<p class="lab-step"><span class="n">3</span>Meet the missing keyword</p>

From R1: `ping 10.1.1.10`, then `ping vrf RED 10.1.1.10`.

<div class="lab-watch"><b>Things to notice</b>
The first fails completely and looks exactly like a down host. Do the same with <code>traceroute</code>, <code>show ip arp</code> and <code>telnet</code>. Build yourself the habit now: in a VRF network, <b>the first thing to check is whether you asked the right table</b>, before you touch any configuration.</div>

<p class="lab-step"><span class="n">4</span>Give RED the internet, badly, then properly</p>

```cisco
ip route vrf RED 0.0.0.0 0.0.0.0 192.0.2.254 global
```

Test from a RED host. Then add the return route:

```cisco
ip route 10.1.1.0 255.255.255.0 GigabitEthernet0/0
```

<div class="lab-issues"><b>Possible issues</b>
<ul>
<li><b>It works immediately without the return route</b> — you have NAT configured, which hides the inside address so the return traffic is destined for a global address. Turn NAT off for this test; it masks the lesson.</li>
<li><b>Nothing works at all</b> — check the <code>global</code> keyword is present. Without it the router looks for <code>192.0.2.254</code> inside RED and does not find it.</li>
<li><b>It works in both directions immediately</b> — confirm with <code>show ip route 10.1.1.0</code> in the global table that the return route really is absent before concluding anything.</li>
</ul>
With only the outbound leak, traffic leaves and never comes back — the packet reaches the internet and the reply arrives in the global table with nowhere to go. <b>That is a one-way route, and it presents to users as "slow" rather than "broken"</b>, which is why it survives so long.</div>

<p class="lab-step"><span class="n">5</span>Carry a VRF across a GRE tunnel</p>

Build Tunnel0 between R1 and R2 over the global underlay, carrying VRF RED:

```cisco
interface Tunnel0
 vrf forwarding RED
 ip address 172.16.0.1 255.255.255.252
 tunnel source Loopback0
 tunnel destination 192.0.2.2
```

Run OSPF for VRF RED over it and confirm R2's RED prefixes appear in R1's RED table.

<div class="lab-watch"><b>Things to notice</b>
Capture on the underlay link and find a <b>protocol 47</b> packet. Expand it until you find the second IP header inside, and confirm the inner addresses are RED's — private, overlapping, and meaningless to the underlay. You are looking at customer traffic crossing a network that has no route to it.
<br><br>Check <code>show interfaces Tunnel0</code> for the transport MTU: <b>1476</b>. Then work out 1500 − 20 − 4 for yourself and confirm it matches.</div>

<p class="lab-step"><span class="n">6</span>Kill the tunnel with recursive routing</p>

Advertise the tunnel destination's subnet **into the routing protocol running over the tunnel** — for example, redistribute connected into RED's OSPF on R2.

<div class="lab-watch"><b>Things to notice</b>
Watch for <code>%TUN-5-RECURDOWN</code> and the tunnel flapping on a cycle set by your routing timers. The logic is worth saying out loud: the tunnel needs a route to its destination; that route is now learned <em>through the tunnel</em>; so the tunnel must be up before it can be up.
<br><br>Fix it three ways and compare. A static host route to the destination via the underlay. Filtering the endpoint prefix out of the overlay. And <code>tunnel vrf</code> putting the underlay in its own VRF — note that the third one makes the fault <b>structurally impossible</b> rather than merely fixed, which is why it is the right answer on anything you have to maintain.</div>

<p class="lab-step"><span class="n">7</span>Find the MTU cliff, then remove it</p>

With the tunnel working, from a RED host: `ping 10.1.2.10 size 1400 df-bit`, then 1450, then 1473, then 1476, then 1500.

<div class="lab-watch"><b>Things to notice</b>
There is a precise size at which it stops, and it is <b>1476</b>. Then block ICMP somewhere in the underlay and try a large TCP transfer: path MTU discovery cannot work without ICMP, so the session establishes — small packets — and then hangs the moment it tries to send a full-size segment. <b>Ping works, the application does not.</b>
<br><br>Add <code>ip mtu 1400</code> and <code>ip tcp adjust-mss 1360</code> and repeat. The transfer completes, because the hosts were told to send smaller segments before they ever produced one that could not fit.</div>

<div class="lab-earned"><b>What you earned</b>
You can build overlapping address space on one router and explain why the isolation holds — no route, not no permission. You have lost an IP address to <code>vrf forwarding</code> once, in a lab, so you will never do it on a production interface you are connected through. You know that a missing <code>vrf</code> keyword produces a perfect imitation of an outage. You have built a one-way route leak and understand why it presents as "slow". And you have watched a GRE tunnel eat itself through recursive routing, then made that failure structurally impossible with <code>tunnel vrf</code> — plus you know the exact byte at which a GRE tunnel starts dropping packets, and the two lines that stop it mattering.</div>

</div>
</div>

---

## Test yourself

<div class="qz">
<p class="qz-q"><span class="qz-num">Q1</span>What happens when you apply <code>vrf forwarding RED</code> to an interface that already has an IP address?</p>
<label class="qz-opt"><input type="radio" name="vq1"><span>The address is kept and moved into the VRF</span><em class="qz-fb qz-bad">That is what everyone expects and it is not what happens.</em></label>
<label class="qz-opt"><input type="radio" name="vq1"><span>The address is deleted and must be reconfigured</span><em class="qz-fb qz-good">Correct. IOS warns in one line and removes it. Always apply the VRF first, then the address — especially on an interface you are connected through.</em></label>
<label class="qz-opt"><input type="radio" name="vq1"><span>The command is rejected until you remove the address</span><em class="qz-fb qz-bad">It is accepted. It would be safer if it were rejected.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q2</span>A host in VRF RED cannot reach a host in VRF BLUE on the same router. Why?</p>
<label class="qz-opt"><input type="radio" name="vq2"><span>An implicit ACL blocks inter-VRF traffic</span><em class="qz-fb qz-bad">There is no ACL. Nothing is being blocked.</em></label>
<label class="qz-opt"><input type="radio" name="vq2"><span>RED's routing table has no entry for BLUE's prefix, so the packet is dropped as unroutable</span><em class="qz-fb qz-good">Right — the isolation is structural. That is why it fails closed, and why a single leaked route removes it completely.</em></label>
<label class="qz-opt"><input type="radio" name="vq2"><span>The route distinguisher prevents it</span><em class="qz-fb qz-bad">The RD makes prefixes unique inside MP-BGP. It plays no part in forwarding on this router.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q3</span>On a GRE tunnel, what does <code>tunnel vrf</code> specify?</p>
<label class="qz-opt"><input type="radio" name="vq3"><span>The VRF the tunnel carries — the inner packets</span><em class="qz-fb qz-bad">That is <code>vrf forwarding</code> on the tunnel interface. The two are constantly swapped.</em></label>
<label class="qz-opt"><input type="radio" name="vq3"><span>The VRF the tunnel travels through — where source and destination are resolved</span><em class="qz-fb qz-good">Correct. <code>tunnel vrf</code> is the outer, transport VRF; <code>vrf forwarding</code> is the inner, carried one. Getting them the wrong way round gives you a tunnel that will not come up.</em></label>
<label class="qz-opt"><input type="radio" name="vq3"><span>The VRF used for the tunnel's keepalives only</span><em class="qz-fb qz-bad">Keepalives follow the transport, but that is a consequence, not the definition.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q4</span>A GRE tunnel flaps with <code>%TUN-5-RECURDOWN</code>. What is happening?</p>
<label class="qz-opt"><input type="radio" name="vq4"><span>The route to the tunnel destination is being learned through the tunnel itself</span><em class="qz-fb qz-good">Correct — the tunnel would have to be up in order to come up. Usually caused by redistributing the underlay into the protocol running over the tunnel.</em></label>
<label class="qz-opt"><input type="radio" name="vq4"><span>The MTU is too small for the routing protocol</span><em class="qz-fb qz-bad">MTU problems break large packets; they do not produce this message.</em></label>
<label class="qz-opt"><input type="radio" name="vq4"><span>The tunnel source interface is flapping</span><em class="qz-fb qz-bad">That takes the tunnel down, but with a different message and no recursion.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q5</span>How much overhead does GRE add, and what is the resulting tunnel MTU over a 1500-byte path?</p>
<label class="qz-opt"><input type="radio" name="vq5"><span>24 bytes — 20 outer IP plus 4 GRE — giving 1476</span><em class="qz-fb qz-good">Correct, and you can count it in a capture: the outer packet is exactly 24 bytes longer than the inner one.</em></label>
<label class="qz-opt"><input type="radio" name="vq5"><span>20 bytes, giving 1480</span><em class="qz-fb qz-bad">That is the IP header alone. The GRE header itself is another four bytes.</em></label>
<label class="qz-opt"><input type="radio" name="vq5"><span>4 bytes, giving 1496</span><em class="qz-fb qz-bad">That is the GRE header alone, forgetting the new IP header wrapped around it.</em></label>
</div>

---

## References

- Cisco — [Configuring VRF-lite](https://www.cisco.com/c/en/us/td/docs/switches/lan/catalyst9500/software/release/17-12/configuration_guide/rtng/b_1712_rtng_9500_cg/configuring_vrf_lite.html) — the modern `vrf definition` syntax and the input-interface model.
- Cisco — [GRE Tunnel IP Source and Destination VRF Membership](https://www.cisco.com/c/en/us/td/docs/switches/lan/c9000/lyr3-fwd/gre/gre-configuration-guide/m-gre-tunnel-ip-source-and-destination-vrf-membership.html) — the authoritative statement of `tunnel vrf` versus `vrf forwarding`.
- Cisco — [GRE Tunnel with VRF Configuration Example](https://www.cisco.com/c/en/us/support/docs/multiprotocol-label-switching-mpls/mpls/46252-grewithvrf.html)
- **RFC 2784** — Generic Routing Encapsulation. The four-byte header and protocol 47.
- **RFC 4364** — BGP/MPLS IP VPNs, where the route distinguisher actually matters.

---

*Related: [IPsec IKEv1: phase 1 and phase 2](/blog/ipsec-ikev1-phase-1-and-phase-2-explained) · [Redistribution: seed metrics, loops and tags](/blog/route-redistribution-seed-metrics-loops-and-tags) · [Policy-based routing](/blog/policy-based-routing-pbr-explained).*

*Part of the [CCNA, ENCOR and ENARSI topic-by-topic study guide](/blog/ccna-ccnp-study-guide).*
