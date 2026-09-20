---
title: "First Hop Redundancy: HSRP, VRRP and GLBP, and the Default Gateway That Cannot Fail"
excerpt: "A PC has one default gateway and no way to find another. When that router dies the subnet is isolated, however much redundancy sits behind it. FHRP solves it by making two routers share one IP and one MAC — and the details of how they share it decide whether your failover takes one second or thirty."
date: "2026-09-14"
tags: ["HSRP", "VRRP", "GLBP", "FHRP", "Routing", "High Availability", "CCNA", "ENCOR"]
draft: false
---

> **Blueprint:** CCNA 200-301 — 3.5 *Describe the purpose, functions, and concepts of first hop redundancy protocols*. ENCOR 350-401 — 1.1.b *High availability techniques such as redundancy, FHRP, and SSO*, 3.3.c *Configure first hop redundancy protocols, such as HSRP, VRRP*.

## Cheat sheet

| | HSRP | VRRP | GLBP |
|---|---|---|---|
| **Origin** | Cisco | **Open** — RFC 5798 | Cisco |
| **Multicast** | v1 `224.0.0.2` · v2 `224.0.0.102` | `224.0.0.18` | `224.0.0.102` |
| **Transport** | UDP 1985 | **IP protocol 112** | UDP 3222 |
| **Virtual MAC** | v1 `0000.0C07.ACxx` · v2 `0000.0C9F.Fxxx` | `0000.5E00.01xx` | `0007.B400.xxyy` |
| **Roles** | Active / Standby | Master / Backup | AVG / AVF |
| **Priority** | 100 default, **higher wins** | 100 default, **255 = address owner** | 100 default |
| **Preempt** | **Off** by default | **On** by default | On by default |
| **Timers** | Hello 3s, Hold 10s | Advertise 1s, Master down ~3.6s | Hello 3s, Hold 10s |
| **Groups** | 0–255 (v1), 0–4095 (v2) | 1–255 | 0–1023 |
| **Load sharing** | Multiple groups, manually | Multiple groups, manually | **Built in** — one group, many forwarders |

**The one that catches people:** HSRP preempt is off, VRRP preempt is on. Restore a failed HSRP router and it comes back as *standby* unless you told it otherwise.

---

## Enterprise design principles this belongs to

FHRP is one piece of a larger idea: an enterprise network is built so that **no single failure takes a service down**. Before the protocol details, two blueprint sub-items set the context.

### Enterprise network design principles

Enterprise networks are built in **layers with redundancy at each one**, and the shape is chosen to match the traffic:

- **2-tier (collapsed core)** — access switches into a redundant distribution/core pair. The common enterprise campus.
- **3-tier** — access, distribution and core separated, for large campuses with many distribution blocks and a feature-light, ultra-stable core.
- **Fabric** — an underlay plus a [VXLAN overlay](/blog/sdn-controllers-overlays-sd-access-and-sd-wan) with a controller, giving segmentation and mobility that a tree design cannot.
- **Cloud** — services rented from a provider, connected back over VPN or a dedicated interconnect, under a **shared-responsibility model**.

- **Beginner:** networks are built in tiers so that losing one device or link does not lose the service.
- **Working knowledge:** the design decision is *where the Layer 3 boundary sits* and *where redundancy is provided* — which is exactly where FHRP fits, at the gateway. See [components and topologies](/blog/network-components-topologies-cabling-and-interface-errors) for each shape in detail.
- **Pro:** redundancy is only useful if failover is **fast and deterministic** — two core switches help nothing if hosts keep sending to a dead gateway. That gap between "the network has a backup path" and "the host uses it" is the problem the next sub-item, and this whole article, exists to close.

### High availability techniques

**High availability** removes single points of failure at three levels:

- **Redundancy** — duplicate devices, links and power, so hardware failure has a standby ready (dual core switches, dual uplinks, [StackWise/VSS/vPC](/blog/virtualization-vms-containers-and-network-virtualization) so both links forward).
- **FHRP** — a **First Hop Redundancy Protocol** (HSRP, VRRP, GLBP) gives hosts a **virtual gateway IP** shared by two routers, so if the active gateway fails the standby takes the same IP over in seconds — without the host knowing or re-learning anything. This is the article's core topic.
- **SSO** — **Stateful Switchover** lets a device with dual supervisors fail over to the standby supervisor **without dropping the control plane**; with **NSF** (nonstop forwarding) the data plane keeps forwarding during the switchover.

- **Beginner:** redundancy is having a spare; FHRP is making hosts use the spare gateway automatically; SSO is a device surviving its own supervisor failing.
- **Working knowledge:** these compose — a redundant pair of switches running an FHRP for the gateway, each with SSO internally, is the standard resilient distribution block.
- **Pro:** match the FHRP to the failover need and pair it with [tracking](/blog/ip-sla-probes-jitter-and-tracking-objects) so the gateway also fails over when the *uplink* fails, not just when the router dies — otherwise the active router happily keeps the virtual IP while black-holing traffic behind a dead uplink.

---

## The problem is on the host, not the router

Everything a network engineer builds for redundancy — two distribution switches, two uplinks, a routing protocol that reconverges in milliseconds — stops at the edge of the PC.

A host has exactly **one default gateway**. It is a single IP address, learned from DHCP or typed in, and the host has no mechanism to discover that it has stopped working. There is no protocol running on a laptop that says "my gateway is dead, let me find another one." The host will keep ARPing for a router that is not there, and every packet destined off-subnet will be dropped, until somebody fixes it or DHCP renews.

<figure class="fig">
<svg class="sv1" viewBox="0 0 640 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A host with a single default gateway is isolated when that router fails, despite a second router being present">
  <style>.sv1 .n{fill:#17171A}.sv1 .dead{fill:#D3002D}.sv1 .alive{fill:#1f9d6b}.sv1 .nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.sv1 .l{stroke:#8A8A93;stroke-width:1.5}.sv1 .dx{stroke:#D3002D;stroke-width:2.5}.sv1 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv1 .k{font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700;fill:#D3002D}
  </style>
  <rect class="n" x="24" y="90" width="90" height="34" rx="3"/><text class="nt" x="69" y="112" text-anchor="middle">PC</text>
  <text class="s" x="69" y="142" text-anchor="middle">gateway 10.1.1.1</text>
  <text class="s" x="69" y="156" text-anchor="middle">and nothing else</text>
  <line class="l" x1="114" y1="107" x2="200" y2="107"/>
  <rect class="n" x="200" y="90" width="80" height="34" rx="3"/><text class="nt" x="240" y="112" text-anchor="middle">SW</text>
  <line class="l" x1="280" y1="100" x2="380" y2="56"/>
  <line class="l" x1="280" y1="114" x2="380" y2="158"/>
  <rect class="dead" x="380" y="38" width="130" height="34" rx="3"/>
  <text class="nt" x="445" y="60" text-anchor="middle">R1  10.1.1.1</text>
  <line class="dx" x1="392" y1="40" x2="498" y2="70"/><line class="dx" x1="498" y1="40" x2="392" y2="70"/>
  <rect class="alive" x="380" y="140" width="130" height="34" rx="3"/>
  <text class="nt" x="445" y="162" text-anchor="middle">R2  10.1.1.2</text>
  <text class="s" x="556" y="60">dead</text>
  <text class="s" x="556" y="162">healthy —</text>
  <text class="s" x="556" y="175">and unused</text>
  <text class="k" x="320" y="196" text-anchor="middle">the PC has no way to learn that .2 exists</text>
</svg>
<figcaption><b>Figure 1.</b> R2 is fine. The subnet is still down, because nothing tells the host to use it.</figcaption>
</figure>

<div class="why">
<b>The trick FHRP plays</b>
Rather than teaching hosts about redundancy, FHRP <em>lies to them</em>. Two routers agree to share a third, made-up IP address and — crucially — a made-up MAC address. The host ARPs for the gateway and gets the virtual MAC back. When the active router fails, the standby starts answering for that same virtual MAC and sends a gratuitous ARP to move the switches' MAC tables. The host's ARP cache never changes, because from its point of view nothing happened. It is still talking to the same MAC address; a different box is simply answering to it now.
</div>

<div class="walk">
<div class="walk-head">A failover, from the host's point of view <span class="walk-hint">click a step</span></div>
<div class="walk-tabs">
  <input type="radio" name="fhw" id="fh1" checked><label for="fh1"><span class="step-n">1</span>The ARP</label>
  <input type="radio" name="fhw" id="fh2"><label for="fh2"><span class="step-n">2</span>Steady state</label>
  <input type="radio" name="fhw" id="fh3"><label for="fh3"><span class="step-n">3</span>Active dies</label>
  <input type="radio" name="fhw" id="fh4"><label for="fh4"><span class="step-n">4</span>The MAC moves</label>
  <input type="radio" name="fhw" id="fh5"><label for="fh5"><span class="step-n">5</span>Nobody noticed</label>
</div>
<div class="walk-panels">
<div class="walk-panel">
<svg class="sv2" viewBox="0 0 640 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The host ARPs for its default gateway and the active router replies with the virtual MAC address">
  <style>.sv2 .n{fill:#17171A}.sv2 .nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.sv2 .l{stroke:#8A8A93;stroke-width:1.5}.sv2 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv2 .b{stroke:#4b7bec;stroke-width:2.5;fill:none}.sv2 .k{font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700;fill:#2b5ab8}</style>
  <rect class="n" x="14" y="80" width="76" height="32" rx="3"/><text class="nt" x="52" y="101" text-anchor="middle">PC</text>
  <line class="l" x1="90" y1="96" x2="240" y2="96"/>
  <rect class="n" x="240" y="80" width="60" height="32" rx="3"/><text class="nt" x="270" y="101" text-anchor="middle">SW</text>
  <line class="l" x1="300" y1="88" x2="420" y2="56"/>
  <line class="l" x1="300" y1="104" x2="420" y2="140"/>
  <rect class="n" x="420" y="40" width="130" height="32" rx="3" fill="#1f9d6b"/><text class="nt" x="485" y="61" text-anchor="middle">R1 — Active</text>
  <rect class="n" x="420" y="124" width="130" height="32" rx="3"/><text class="nt" x="485" y="145" text-anchor="middle">R2 — Standby</text>
  <path class="b" d="M 90 84 L 420 56"/>
  <circle r="5" fill="#4b7bec"><animateMotion dur="1.7s" repeatCount="indefinite" path="M 90 84 L 420 56"/></circle>
  <text class="k" x="176" y="52" text-anchor="middle">who has 10.1.10.1?</text>
  <text class="s" x="176" y="128" text-anchor="middle" fill="#0f6b47">0000.0C9F.F00A — the virtual MAC</text>
  <text class="s" x="320" y="184" text-anchor="middle">The reply does not contain R1's real MAC address. It contains an invented one that belongs to the <tspan font-weight="700">group</tspan>.</text>
</svg>
<p class="walk-say"><span class="walk-title">The lie begins here</span>
The host ARPs for its default gateway exactly as it would for any address. The Active router answers — but with the <b>virtual MAC</b>, not its own. The group number is in the last byte: <code>0000.0C9F.F0<b>0A</b></code> is HSRPv2 group 10.
<br><br>From this moment the host's ARP cache contains an address that belongs to no physical device. Everything else follows from that one substitution.</p>
</div>
<div class="walk-panel">
<svg class="sv3" viewBox="0 0 640 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Traffic flows through the active router while the two routers exchange hellos">
  <style>.sv3 .n{fill:#17171A}.sv3 .nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.sv3 .l{stroke:#8A8A93;stroke-width:1.5}.sv3 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv3 .g{stroke:#1f9d6b;stroke-width:3;fill:none}.sv3 .h{stroke:#F2994A;stroke-width:2;stroke-dasharray:4 4;fill:none}.sv3 .k{font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700;fill:#B26014}</style>
  <rect class="n" x="14" y="80" width="76" height="32" rx="3"/><text class="nt" x="52" y="101" text-anchor="middle">PC</text>
  <line class="l" x1="90" y1="96" x2="240" y2="96"/>
  <rect class="n" x="240" y="80" width="60" height="32" rx="3"/><text class="nt" x="270" y="101" text-anchor="middle">SW</text>
  <path class="g" d="M 90 96 L 240 96 L 300 88 L 420 56"/>
  <rect class="n" x="420" y="40" width="130" height="32" rx="3" fill="#1f9d6b"/><text class="nt" x="485" y="61" text-anchor="middle">R1 — Active</text>
  <rect class="n" x="420" y="124" width="130" height="32" rx="3"/><text class="nt" x="485" y="145" text-anchor="middle">R2 — Standby</text>
  <line class="l" x1="300" y1="104" x2="420" y2="140"/>
  <path class="h" d="M 470 72 L 470 124"/>
  <circle r="4.5" fill="#1f9d6b"><animateMotion dur="1.8s" repeatCount="indefinite" path="M 90 96 L 240 96 L 300 88 L 420 56"/></circle>
  <circle r="4" fill="#F2994A"><animateMotion dur="1.4s" repeatCount="indefinite" path="M 470 72 L 470 124"/></circle>
  <text class="k" x="486" y="102">hellos</text>
  <text class="s" x="176" y="70" text-anchor="middle" fill="#0f6b47">all traffic, to 0000.0C9F.F00A</text>
  <text class="s" x="320" y="182" text-anchor="middle">The switch has learned the virtual MAC on the port facing R1. That entry is the thing that will have to move.</text>
</svg>
<p class="walk-say"><span class="walk-title">Steady state — and the switch is the one keeping score</span>
Traffic flows to the virtual MAC, and the <b>switch</b> decides where that goes, from its MAC address table. Right now it points at R1's port. Meanwhile the two routers exchange hellos so each knows the other is alive.
<br><br>Only Active and Standby send hellos. A third router in the group sits in <code>Listen</code> and says nothing, which is why HSRP does not degrade with more routers — it simply never uses them.</p>
</div>
<div class="walk-panel">
<svg class="sv4" viewBox="0 0 640 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The active router fails and the standby stops hearing hellos">
  <style>.sv4 .n{fill:#17171A}.sv4 .nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.sv4 .l{stroke:#8A8A93;stroke-width:1.5}.sv4 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv4 .dead{stroke:#D3002D;stroke-width:2.5}.sv4 .k{font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700;fill:#B80027}</style>
  <rect class="n" x="14" y="80" width="76" height="32" rx="3"/><text class="nt" x="52" y="101" text-anchor="middle">PC</text>
  <line class="l" x1="90" y1="96" x2="240" y2="96"/>
  <rect class="n" x="240" y="80" width="60" height="32" rx="3"/><text class="nt" x="270" y="101" text-anchor="middle">SW</text>
  <line class="l" x1="300" y1="88" x2="420" y2="56" stroke-dasharray="4 4"/>
  <line class="l" x1="300" y1="104" x2="420" y2="140"/>
  <rect class="n" x="420" y="40" width="130" height="32" rx="3" fill="#D3002D"/><text class="nt" x="485" y="61" text-anchor="middle">R1</text>
  <line class="dead" x1="432" y1="42" x2="538" y2="70"/><line class="dead" x1="538" y1="42" x2="432" y2="70"/>
  <rect class="n" x="420" y="124" width="130" height="32" rx="3"/><text class="nt" x="485" y="145" text-anchor="middle">R2 — Standby</text>
  <text class="k" x="486" y="104">no hellos for 750 ms</text>
  <text class="s" x="176" y="70" text-anchor="middle" fill="#D3002D">traffic still being sent to 0000.0C9F.F00A</text>
  <text class="s" x="176" y="128" text-anchor="middle" fill="#D3002D">— and the switch still points it at a dead router</text>
  <text class="s" x="320" y="182" text-anchor="middle">This is the outage window, and its whole length is the hold timer.</text>
</svg>
<p class="walk-say"><span class="walk-title">The gap</span>
R1 stops. The host does not know and does not care — it keeps sending frames to the virtual MAC, and the switch keeps forwarding them out of a port with nothing behind it. Every one is lost.
<br><br>The length of this window is <b>the hold time, and nothing else</b>: 10 seconds on defaults, 750 ms with the timers above. That is the entire argument for tuning them, and the whole reason to measure it in the lab rather than trusting a number.</p>
</div>
<div class="walk-panel">
<svg class="sv5" viewBox="0 0 640 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The standby becomes active takes over the virtual MAC and sends a gratuitous ARP to move the switch MAC table entry">
  <style>.sv5 .n{fill:#17171A}.sv5 .nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.sv5 .l{stroke:#8A8A93;stroke-width:1.5}.sv5 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv5 .g{stroke:#1f9d6b;stroke-width:3;fill:none}.sv5 .k{font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700;fill:#0f6b47}</style>
  <rect class="n" x="14" y="86" width="76" height="32" rx="3"/><text class="nt" x="52" y="107" text-anchor="middle">PC</text>
  <line class="l" x1="90" y1="102" x2="240" y2="102"/>
  <rect class="n" x="240" y="86" width="60" height="32" rx="3"/><text class="nt" x="270" y="107" text-anchor="middle">SW</text>
  <rect class="n" x="420" y="44" width="130" height="32" rx="3" opacity=".35"/><text class="nt" x="485" y="65" text-anchor="middle">R1 — down</text>
  <rect class="n" x="420" y="130" width="130" height="32" rx="3" fill="#1f9d6b"/><text class="nt" x="485" y="151" text-anchor="middle">R2 — Active</text>
  <path class="g" d="M 420 146 L 300 110 L 240 110"/>
  <circle r="5" fill="#1f9d6b"><animateMotion dur="1.6s" repeatCount="indefinite" path="M 420 146 L 300 110 L 240 110"/></circle>
  <text class="k" x="300" y="176" text-anchor="middle">Gratuitous ARP: &#8220;0000.0C9F.F00A is over here now&#8221;</text>
  <text class="s" x="300" y="194" text-anchor="middle">It re-points the <tspan font-weight="700">switch's MAC table</tspan>. It is not aimed at the host at all.</text>
  <text class="s" x="486" y="112">assumes the virtual MAC</text>
</svg>
<p class="walk-say"><span class="walk-title">The MAC moves, not the IP</span>
R2 becomes Active and <b>starts answering to the same virtual MAC address</b>. Then it sends a gratuitous ARP — and the important thing about that ARP is who it is for. It is not for the host; the host's cache is already correct. It is for <b>the switches</b>, so they move the MAC table entry to the port facing R2.
<br><br>If failover only moved the IP address, every host would have to re-ARP, and a Windows cache can hold an entry for minutes. Moving the MAC means the hosts do nothing at all.</p>
</div>
<div class="walk-panel">
<svg class="sv6" viewBox="0 0 640 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The host ARP cache is unchanged before and after the failover">
  <style>.sv6 .s{font-family:ui-sans-serif,system-ui;font-size:11px;fill:#5C5C64}.sv6 .m{font-family:ui-monospace,Menlo,monospace;font-size:11.5px;fill:#17171A}.sv6 .hdr{font-family:ui-sans-serif,system-ui;font-size:10.5px;font-weight:700;fill:#8A8A93;letter-spacing:.06em}.sv6 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700;fill:#0f6b47}.sv6 .bx{fill:#F1EEE9;stroke:#B5B5BC}</style>
  <text class="hdr" x="14" y="20">PC, BEFORE THE FAILOVER</text>
  <rect class="bx" x="14" y="30" width="280" height="44"/>
  <text class="m" x="26" y="50">10.1.10.1</text>
  <text class="m" x="120" y="50">00-00-0c-9f-f0-0a</text>
  <text class="s" x="26" y="66">dynamic</text>
  <text class="hdr" x="346" y="20">PC, AFTER THE FAILOVER</text>
  <rect class="bx" x="346" y="30" width="280" height="44" fill="rgba(31,157,107,.10)" stroke="#1f9d6b"/>
  <text class="m" x="358" y="50">10.1.10.1</text>
  <text class="m" x="452" y="50" fill="#0f6b47">00-00-0c-9f-f0-0a</text>
  <text class="s" x="358" y="66">dynamic</text>
  <text class="k" x="320" y="108" text-anchor="middle">Byte for byte identical. The host was never told anything, and never had to be.</text>
  <text class="s" x="320" y="136" text-anchor="middle">A different physical router is now answering to that address. That is the entire mechanism —</text>
  <text class="s" x="320" y="154" text-anchor="middle">and the reason FHRP works with hosts that have no idea redundancy exists.</text>
  <text class="s" x="320" y="184" text-anchor="middle">What <tspan font-weight="700">did</tspan> change: one entry in the switch's MAC address table.</text>
</svg>
<p class="walk-say"><span class="walk-title">Run <code>arp -a</code> before and after — nothing moved</span>
This is the check worth doing yourself once, because it settles the concept permanently. The host's ARP cache is identical either side of a failover. It never re-resolved, never timed out, never noticed.
<br><br>Which also explains the failure mode in the next section: if something prevents the gratuitous ARP from updating the switches — port security, dynamic ARP inspection, a switch that ignores it — then everything in HSRP reports perfect health while the traffic still goes to a dead router.</p>
</div>
</div>
</div>

That last point is why the **virtual MAC matters more than the virtual IP**. If failover only moved the IP, every host would have to re-ARP, and their caches can hold the old entry for four hours. Moving the MAC means the host needs to do nothing at all.

---

## HSRP

Cisco's, and still the most deployed. Two routers, one group, one virtual IP.

### The states

`Initial → Learn → Listen → Speak → Standby → Active`

| State | Meaning |
|---|---|
| **Initial** | Not started. Interface down, or HSRP just configured. |
| **Learn** | Does not yet know the virtual IP — waiting to hear it from the active router. Only seen when the virtual IP was not configured locally. |
| **Listen** | Knows the virtual IP, is neither active nor standby. This is where a third router sits, permanently. |
| **Speak** | Sending hellos, contesting the election. |
| **Standby** | The designated backup. Exactly one. Watches the active router. |
| **Active** | Forwarding for the virtual IP and MAC. Exactly one. |

Only the **active** and **standby** routers send hellos. A third router in a group sits in `Listen` and says nothing, which is why HSRP does not degrade with more routers — it just never uses them.

### Configuration, word by word

<div class="cmd">
<div class="cmd-line">interface Vlan10
 ip address 10.1.10.2 255.255.255.0
 <span class="t">standby version 2</span>
 <span class="t">standby 10 ip</span> <span class="opt">10.1.10.1</span>
 <span class="t">standby 10 priority</span> <span class="opt">110</span>
 <span class="t">standby 10 preempt delay minimum</span> <span class="opt">60</span>
 <span class="t">standby 10 authentication md5 key-string</span> <span class="opt">&lt;secret&gt;</span>
 <span class="t">standby 10 timers msec</span> <span class="opt">250</span> <span class="t">msec</span> <span class="opt">750</span>
 <span class="t">standby 10 track</span> <span class="opt">1</span> <span class="t">decrement</span> <span class="opt">20</span></div>
<dl class="cmd-parts">
<div class="is-key"><dt>standby version 2</dt><dd>Use it. Version 1 caps groups at 255, has only 8 bits of group in the virtual MAC, and cannot do millisecond timers or IPv6. <b>Both routers must run the same version</b> or they will not see each other — and the symptom is two Active routers, identical to an authentication mismatch.</dd></div>
<div><dt>standby 10 ip<br>10.1.10.1</dt><dd>The virtual IP. In the subnet, assigned to no interface, configured <b>identically on both routers</b>. This is the address the hosts use as their default gateway and the only one they will ever know about.</dd></div>
<div><dt>priority 110</dt><dd>Higher wins; default 100. Leave both at default and the election falls to the highest interface IP address — a decision nobody made.</dd></div>
<div class="is-key"><dt>preempt</dt><dd><b>Without this, priority only matters once.</b> The first router up becomes Active and keeps the role even when a higher-priority router appears. This is the single most common HSRP misconfiguration, and it is why a router that was rebooted last month is still carrying traffic it should have handed back.</dd></div>
<div class="is-key"><dt>delay minimum 60</dt><dd>And this is why preempt alone is not enough. A router that has just rebooted has HSRP up in seconds but its routing protocol has not converged. Without the delay it <b>seizes the Active role and blackholes traffic</b> for as long as the IGP takes to settle. Sixty seconds is a sane floor; match it to your IGP.</dd></div>
<div><dt>authentication md5<br>key-string</dt><dd>Use MD5, never the plaintext form. HSRPv1's default authentication is the literal string <code>cisco</code>, <b>sent in clear in every hello</b> — you can read it in the capture below. Configure authentication on <b>both</b> routers in the same breath; one side only produces two Active routers.</dd></div>
<div class="is-key"><dt>timers<br>msec 250 msec 750</dt><dd>Hello 250 ms, hold 750 ms. The defaults of 3 and 10 seconds mean <b>up to ten seconds of outage</b> — far too long for voice or any session with a short timeout. Sub-second is normal on modern hardware. Do not go below 250 ms without knowing your CPU headroom; on virtual routers in a lab it will flap.</dd></div>
<div><dt>track 1 decrement 20</dt><dd>Lowers the priority when something this router depends on fails. <b>The decrement must be large enough to cross the peer's priority</b> — 110 minus 20 is 90, which loses to 100. Decrement 5 leaves 105, which still wins, and nothing happens at all. See the next section.</dd></div>
</dl>
</div>

### Tracking — the part that makes it actually work

A router whose uplink has failed is still perfectly healthy on the LAN side. It will keep sending HSRP hellos, keep being active, and keep accepting traffic it cannot forward anywhere. Tracking fixes that by lowering priority when something it depends on goes away.

```cisco
track 1 interface GigabitEthernet0/1 line-protocol
track 2 ip route 0.0.0.0/0 reachability
!
interface Vlan10
 standby 10 track 1 decrement 20
 standby 10 track 2 decrement 30
```

Priority 110, minus 20 when the uplink drops, gives 90 — below the peer's 100, so with preempt configured on the peer the role moves. **The decrement must be large enough to cross the other router's priority.** Decrementing 5 from 110 leaves 105, still the winner, and nothing happens. This is a very common and very quiet failure.

Tracking a route (`track 2`) is stronger than tracking an interface: the uplink can be up while the far end is broken.

### Reading it

<div class="term">
<div class="term-bar"><span class="term-dots"><i></i><i></i><i></i></span>R1 — the one command, and the one column people miss</div>
<pre><span class="p">R1#</span> <span class="c">show standby brief</span>
                     <span class="y">P indicates configured to preempt.</span>
                     |
Interface   Grp  Pri <span class="y">P</span> State    Active          Standby         Virtual IP
Vl10        10   110 <span class="y">P</span> <span class="g">Active</span>   local           10.1.10.3       10.1.10.1
Vl20        20   100 <span class="y">P</span> Standby  10.1.10.3       local           10.1.20.1

<span class="o">! Both VLANs show P, so preempt is set on both. A blank in that column is the</span>
<span class="o">! commonest HSRP fault in existence, and it is one character wide.</span>
<span class="o">! Note also that R1 is Active for VLAN 10 and Standby for VLAN 20 — that is</span>
<span class="o">! deliberate load sharing, not a fault.</span>

<span class="p">R1#</span> <span class="c">show standby vlan10 10</span>
Vlan10 - Group 10 (version 2)
  State is <span class="g">Active</span>
    8 state changes, last state change 04:21:07
  Virtual IP address is 10.1.10.1
  Active virtual MAC address is <span class="y">0000.0C9F.F00A</span>    <span class="o">&lt;- the address hosts actually ARP for</span>
  Hello time 250 msec, hold time 750 msec
  Preemption enabled, delay min 60 secs
  Priority 110 (configured 110)
    Track object 1 state Up decrement 20     <span class="o">&lt;- watch this line when you fail the uplink</span><span class="cur"></span></pre>
</div>
<p class="term-cap"><b>Two commands, and the second one is the one that answers questions.</b> <code>show standby brief</code> tells you who is Active. <code>show standby &lt;interface&gt; &lt;group&gt;</code> tells you the virtual MAC, the real timers, and whether tracking is up — which is everything you need when the roles look right but traffic is not flowing.</p>

Read the **P** column first — if it is blank, preempt is off and your priorities are decorative. Here VLAN 10 is active on this router and VLAN 20 on the peer, which is the correct pattern: split the groups so both routers forward.

---

### Both protocols, side by side on the wire

<div class="cap">
<div class="cap-head">Capture · VLAN 10 <span class="cap-filter">hsrp || vrrp</span></div>
<table class="cap-list">
<thead><tr><th>No.</th><th>Time</th><th>Source</th><th>Destination</th><th>Proto</th><th>Len</th><th>Info</th></tr></thead>
<tbody>
<tr class="is-sel"><td class="no">18</td><td>3.002</td><td>10.1.10.2</td><td>224.0.0.2</td><td>HSRP</td><td>62</td><td><b>Hello (state Active)</b></td></tr>
<tr><td class="no">19</td><td>3.140</td><td>10.1.10.3</td><td>224.0.0.2</td><td>HSRP</td><td>62</td><td>Hello (state Standby)</td></tr>
<tr class="ctrl"><td class="no">44</td><td>9.001</td><td>10.1.10.2</td><td>224.0.0.18</td><td>VRRP</td><td>54</td><td>Announcement (v2)</td></tr>
</tbody>
</table>
<div class="cap-hex"><pre>HSRPv1 Hello
0000  01 00 5e 00 00 02 <mark>00 00  0c 07 ac 0a</mark> 08 00 45 c0   ..^...........E.
0010  00 30 00 00 00 00 <mark>01</mark> <mark>11</mark>  c4 f8 0a 01 0a 02 e0 00   .0..............
0020  00 02 <mark>07 c1 07 c1</mark> 00 1c  00 00 00 00 <mark>10</mark> 03 0a <mark>6e</mark>   ...............n
0030  <mark>0a</mark> 00 <mark>63 69 73 63 6f</mark> 00  00 00 0a 01 0a 01         ..cisco.......</pre></div>
<div class="cap-note"><b>Four things to see here.</b> The <b>source MAC is <code>00:00:0c:07:ac:0a</code></b> — the router sends its hellos <em>from the virtual MAC</em>, which is how switches learn where it lives. <code>01</code> is TTL 1 and <code>11</code> is protocol 17, UDP. <code>07 c1 07 c1</code> is port 1985, source and destination. <code>10</code> is the state field: <b>16 = Active</b> (0 Initial, 1 Learn, 2 Listen, 4 Speak, 8 Standby, 16 Active). <code>6e</code> is priority 110 and <code>0a</code> the group. And then, in plain ASCII, <code><mark>cisco</mark></code> — <b>HSRPv1's default authentication string, readable by anyone on the segment</b>. That is what <code>authentication md5</code> is for.</div>
<div class="cap-hex"><pre>VRRP v2 Advertisement
0000  01 00 5e 00 00 12 <mark>00 00  5e 00 01 0a</mark> 08 00 45 c0   ..^.....^.....E.
0010  00 28 00 00 00 00 <mark>ff</mark> <mark>70</mark>  c6 90 0a 01 0a 02 e0 00   .(.....p........
0020  00 12 <mark>21</mark> 0a <mark>6e</mark> 01 00 01  5c f1 0a 01 0a 01 00 00   ..!.n...\.......</pre></div>
<div class="cap-note"><b>And the differences that matter operationally.</b> The virtual MAC is <code>00:00:5e:00:01:0a</code> — the IANA-assigned VRRP range, group 10 in the last byte. <code>ff</code> is <b>TTL 255</b>, which is mandatory: a receiver must discard any advertisement that does not have it, because a TTL below 255 proves the packet was routed and therefore did not originate on this segment. And <code>70</code> is <b>protocol 112 — not UDP at all</b>.
<br><br>That last byte is the whole reason a firewall rule permitting UDP 1985 does nothing for VRRP, and why the two protocols fail in completely different ways behind the same ACL.</div>
</div>

## VRRP

The open standard. RFC 5798 for version 3, which supports IPv4 and IPv6.

Functionally almost identical to HSRP, with four differences that matter:

**Preempt is on by default.** The opposite of HSRP. A returning higher-priority router takes back the master role automatically.

**Priority 255 means address owner.** If the virtual IP is *the same as* a real interface address on a router, that router is the owner and has priority 255 permanently. It always wins. This is the standard's model and has no HSRP equivalent.

**It runs on IP protocol 112**, not UDP. Some firewalls and ACLs that permit "UDP" will drop it.

**Terminology:** master and backup, not active and standby.

```cisco
interface Vlan10
 ip address 10.1.10.2 255.255.255.0
 vrrp 10 ip 10.1.10.1
 vrrp 10 priority 110
 vrrp 10 timers advertise 1
 vrrp 10 authentication md5 key-string <secret>
```

Choose VRRP when the subnet has non-Cisco routers on it. Choose HSRP when everything is Cisco and you want the tracking and delay options, which are richer.

---

## GLBP

HSRP and VRRP both waste half your capacity. One router forwards, the other watches. You can split groups across VLANs to balance, but within a single VLAN one router does all the work.

GLBP solves it inside one group. The **Active Virtual Gateway (AVG)** answers every ARP for the virtual IP — but hands out a *different virtual MAC* to different hosts, round robin. Each MAC belongs to an **Active Virtual Forwarder (AVF)**, and up to four routers can forward simultaneously for the same virtual IP.

```cisco
interface Vlan10
 ip address 10.1.10.2 255.255.255.0
 glbp 10 ip 10.1.10.1
 glbp 10 priority 110
 glbp 10 preempt
 glbp 10 load-balancing host-dependent
 glbp 10 weighting 100 lower 80 upper 95
 glbp 10 weighting track 1 decrement 25
```

Load balancing modes: `round-robin` (default), `host-dependent` (a given host always gets the same MAC — important for stateful firewalls), `weighted` (proportional to capacity).

<div class="note">
<b>Why you rarely see GLBP any more</b>
It is Cisco proprietary, and the problem it solves has largely been solved better elsewhere — by a Layer 2 multi-chassis technology (vPC, VSS, StackWise Virtual) that makes two physical switches look like one, so a single HSRP instance is active on what is logically one device and both chassis forward. If your distribution layer is a VSS or StackWise Virtual pair, GLBP buys you nothing. It is still on the blueprint, and still worth knowing the mechanism.
</div>

---

## What goes wrong

**Two active routers.** Both think they are alone. Causes, in order of likelihood: HSRP version mismatch (v1 and v2 do not interoperate), the VLAN not actually trunked between them, authentication configured on one side, or an ACL blocking the multicast.

**Failover does not happen when the uplink fails.** No tracking configured, or the decrement is too small to cross the peer's priority.

**Failover happens but traffic still blackholes for a minute.** The new active router's routing protocol has not converged. That is `preempt delay minimum`.

**The router comes back and does not resume.** HSRP preempt is off by default. Add it.

**Failover takes ten seconds.** Default timers. Set `msec` values.

**Everything looks right but hosts still fail.** Check the switch MAC table for the virtual MAC (`show mac address-table address 0000.0c9f.f00a`). If it points at the old router, the gratuitous ARP did not take — usually a port security or DAI interaction.


<div class="real">
<b>In the real world</b>
The failure that wastes the most time is the one where HSRP is <em>perfectly healthy</em> and traffic still does not flow. Everything in <code>show standby</code> is green, the right router is Active, the priorities are right — and the switch's MAC address table still points the virtual MAC at the dead router's port, because the gratuitous ARP was dropped. Port security, dynamic ARP inspection and some wireless bridges all do this. The diagnostic is one command on the <b>switch</b>, not the router:
<br><br><code>show mac address-table address 0000.0c9f.f00a</code>
<br><br>If that port is not the one facing the current Active router, HSRP has done its job and the Layer 2 network has not. Look there before you touch a single HSRP setting.
</div>

---

<div class="lab">
<div class="lab-head">Lab — HSRP with tracking, and every way it fails</div>
<div class="lab-body">

<div class="lab-target"><b>Target</b>
Build a redundant default gateway for VLAN 10 across two routers, prove failover works for a router failure <em>and</em> for an uplink failure, measure how long each takes, and then deliberately reproduce the four classic misconfigurations so you recognise them from the symptom alone.</div>

**Topology.** R1 and R2 both on VLAN 10 via a switch. A PC on VLAN 10. Each router has an uplink to R3, which represents the core. R1 = 10.1.10.2, R2 = 10.1.10.3, virtual IP 10.1.10.1. PC's gateway is 10.1.10.1.

<p class="lab-step"><span class="n">1</span>Baseline HSRP</p>

```cisco
! R1
interface Vlan10
 ip address 10.1.10.2 255.255.255.0
 standby version 2
 standby 10 ip 10.1.10.1
 standby 10 priority 110
 standby 10 preempt

! R2 — identical but priority 100 (default, so omitted)
interface Vlan10
 ip address 10.1.10.3 255.255.255.0
 standby version 2
 standby 10 ip 10.1.10.1
 standby 10 preempt
```

Verify with `show standby brief` on both. R1 Active, R2 Standby, **P** shown on both.

<p class="lab-step"><span class="n">2</span>Find the virtual MAC, and watch it move</p>

On the PC: `arp -a` and note the MAC for 10.1.10.1. It should start `0000.0C9F.F0` with the group number at the end. On the switch: `show mac address-table address <that MAC>` — note which port it is learned on.

Start a continuous ping from the PC to something beyond R3. Now `shutdown` R1's VLAN 10 interface. Count lost pings. Re-run the switch MAC table command and confirm the port changed. Re-run `arp -a` on the PC and confirm **the MAC did not change**.

<div class="lab-watch"><b>Things to notice</b>
The PC's ARP entry is identical before and after. That is the entire mechanism — the host never learned anything. Also note the default timers cost you roughly ten seconds of ping loss, which is far too long for voice or any TCP session with a short timeout.</div>

<p class="lab-step"><span class="n">3</span>Make it sub-second</p>

```cisco
! Both routers
interface Vlan10
 standby 10 timers msec 250 msec 750
```

Repeat the failover. Count lost pings again. Record both numbers — this comparison is the justification you will give someone for changing timers in production.

<p class="lab-step"><span class="n">4</span>Track the uplink</p>

```cisco
! R1
track 1 interface GigabitEthernet0/1 line-protocol
interface Vlan10
 standby 10 track 1 decrement 20
```

With pings running, `shutdown` R1's **uplink** (not the VLAN interface). R1 is still alive on the LAN but cannot reach the core.

<div class="lab-watch"><b>Things to notice</b>
Without tracking, this is the worst failure mode there is: R1 stays Active, keeps answering ARP, and silently discards everything. The ping stops and HSRP looks perfectly healthy in <code>show standby</code>. With tracking, priority drops 110 → 90 and the role moves. Confirm the new priority with <code>show standby Vlan10</code>.</div>

<p class="lab-step"><span class="n">5</span>Break it four ways, on purpose</p>

Do each, record the symptom, then undo it.

1. **Remove `preempt` from R1.** Reload R1. It comes back Standby despite priority 110. Symptom: the P column is blank and the wrong router is Active.
2. **Set the decrement to 5** instead of 20. Fail the uplink. Nothing happens — 110 − 5 = 105, still above R2's 100. Symptom: tracking is configured, shows as Down, and the role does not move.
3. **Set R2 to `standby version 1`.** Symptom: both routers go Active. Check `show standby` on each — neither sees a peer.
4. **Add `standby 10 authentication md5 key-string CISCO` on R1 only.** Symptom: two Active routers again, and `debug standby errors` reports the authentication failure.

<div class="lab-issues"><b>Possible issues</b>
<ul>
<li><b>Both routers Active from the start</b> — the VLAN is not actually carried between them. Check <code>show interfaces trunk</code> before blaming HSRP.</li>
<li><b>The virtual IP does not ping</b> — normal from the routers themselves in some IOS versions. Test from the PC.</li>
<li><b>Tracking shows Up when the interface is down</b> — you tracked <code>line-protocol</code> on the wrong interface, or the interface is a subinterface whose parent is still up.</li>
<li><b>Sub-second timers cause flapping</b> — the CPU cannot keep up, common on virtual routers in EVE-NG. Back off to 500/1500 ms in a simulator.</li>
<li><b>Ping loss is zero even when you expect some</b> — your ping interval is longer than the failover. Use <code>ping ... timeout 0 repeat 10000</code> or a rapid ping from a real host.</li>
</ul></div>

<p class="lab-step"><span class="n">6</span>Add the convergence delay</p>

```cisco
interface Vlan10
 standby 10 preempt delay minimum 60
```

Reload R1 with pings running. Without the delay, traffic breaks for as long as the IGP takes to converge after R1 seizes the role back. With it, R1 waits. Time both.

<p class="lab-step"><span class="n">7</span>Do it again with VRRP</p>

Replace the HSRP configuration with VRRP. Note three things: you did **not** configure preempt and it still preempts; the virtual MAC now starts `0000.5E00.01`; and an ACL permitting only UDP would break it, because VRRP is IP protocol 112.

<p class="lab-step"><span class="n">8</span>Capture the hellos</p>

Mirror the switch port facing R1 to a machine running Wireshark. Filter `hsrp` (then `vrrp`). Open one hello and find: the group number, the priority, the state, the virtual IP, and the hello and hold timers. Watch the priority field change live when you fail the tracked uplink.

<div class="lab-earned"><b>What you earned</b>
You can now explain why a host never notices a gateway failure, and point at the virtual MAC as the reason. You can size timers against a measured outage rather than guessing. You know that HSRP without <code>preempt</code> ignores your priorities, that tracking without a large enough decrement does nothing at all, and that a version mismatch and an authentication mismatch produce the identical symptom of two Active routers — so you will check both. And you have seen the failure mode that matters most in production: a router that is perfectly healthy on the LAN, still Active, and blackholing everything.</div>

</div>
</div>

---

## Test yourself

<div class="qz">
<p class="qz-q"><span class="qz-num">Q1</span>R1 has HSRP priority 110, R2 has 100. R2 boots first. Who is Active, and why?</p>
<label class="qz-opt"><input type="radio" name="fh1"><span>R1 — it has the higher priority</span><em class="qz-fb qz-bad">Only if preempt is configured. Priority alone does not displace a router that is already Active.</em></label>
<label class="qz-opt"><input type="radio" name="fh1"><span>R2 — it was there first, unless R1 has preempt configured</span><em class="qz-fb qz-good">Correct, and this is the commonest HSRP mistake. Preempt is off by default in HSRP — but on by default in VRRP.</em></label>
<label class="qz-opt"><input type="radio" name="fh1"><span>Both — they will each become Active</span><em class="qz-fb qz-bad">That happens on a version or authentication mismatch, not from boot order.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q2</span>R1 is Active with priority 110 and tracks its uplink with <code>decrement 5</code>. R2 is 100. The uplink fails. What happens?</p>
<label class="qz-opt"><input type="radio" name="fh2"><span>Nothing — 110 − 5 = 105, still higher than R2</span><em class="qz-fb qz-good">Exactly. Tracking is configured and shows Down, but the decrement never crosses the peer's priority. Traffic blackholes while everything looks healthy.</em></label>
<label class="qz-opt"><input type="radio" name="fh2"><span>R2 becomes Active immediately</span><em class="qz-fb qz-bad">Only if the decrement brings R1 below 100.</em></label>
<label class="qz-opt"><input type="radio" name="fh2"><span>Both become Active</span><em class="qz-fb qz-bad">Tracking does not split the group.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q3</span>After failover, why does the host not need to re-ARP?</p>
<label class="qz-opt"><input type="radio" name="fh3"><span>Because the standby router takes over the same virtual MAC</span><em class="qz-fb qz-good">Right. The IP and the MAC both move, so the host's ARP cache stays valid. A gratuitous ARP updates the switches' MAC tables, not the host's cache.</em></label>
<label class="qz-opt"><input type="radio" name="fh3"><span>Because the host re-runs DHCP</span><em class="qz-fb qz-bad">Nothing triggers DHCP here, and it would be far too slow.</em></label>
<label class="qz-opt"><input type="radio" name="fh3"><span>Because HSRP sends the host a redirect</span><em class="qz-fb qz-bad">There is no host-facing signalling in HSRP at all — that is the point of the design.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q4</span>An ACL permits UDP 1985 and your FHRP still fails. Which protocol is it?</p>
<label class="qz-opt"><input type="radio" name="fh4"><span>HSRP — the port is wrong</span><em class="qz-fb qz-bad">UDP 1985 is exactly HSRP's port.</em></label>
<label class="qz-opt"><input type="radio" name="fh4"><span>VRRP — it runs on IP protocol 112, not UDP at all</span><em class="qz-fb qz-good">Correct, and a classic firewall problem. VRRP is not UDP, so a UDP permit does nothing for it.</em></label>
<label class="qz-opt"><input type="radio" name="fh4"><span>GLBP — it uses UDP 3222</span><em class="qz-fb qz-bad">True that GLBP uses 3222, but the question describes something UDP rules cannot fix.</em></label>
</div>

---

## References

- **RFC 5798** — Virtual Router Redundancy Protocol (VRRP) Version 3 for IPv4 and IPv6.
- **RFC 2281** — Cisco Hot Standby Router Protocol (HSRP). Informational.
- Cisco — [HSRP Configuration Guide](https://www.cisco.com/c/en/us/support/docs/ip/hot-standby-router-protocol-hsrp/9234-hsrpguidetoc.html)
- Cisco — [Understanding and Troubleshooting HSRP Problems](https://www.cisco.com/c/en/us/support/docs/ip/hot-standby-router-protocol-hsrp/10583-62.html)
- Cisco — [GLBP Overview](https://www.cisco.com/c/en/us/td/docs/ios-xml/ios/ipapp_fhrp/configuration/xe-16/fhp-xe-16-book/fhp-glbp.html)

---

*Part of the [CCNA, ENCOR and ENARSI topic-by-topic study guide](/blog/ccna-ccnp-study-guide).*
