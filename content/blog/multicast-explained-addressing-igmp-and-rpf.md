---
title: "Multicast, Part 1: Addressing, IGMP and the RPF Check"
excerpt: "One video stream, five hundred viewers, one copy on the wire. Multicast is the only way to do that — but it replaces the certainties of unicast with a receiver-driven control plane and a loop-prevention rule that works backwards. This is the part everything else in multicast is built on: the address ranges, the 32-to-1 MAC collision, how IGMP actually signals interest, and why a router checks where a packet came from rather than where it is going."
date: "2026-09-20"
tags: ["Multicast", "IGMP", "PIM", "RPF", "Routing", "ENCOR", "CCNP"]
draft: false
---

> **Blueprint:** ENCOR 350-401 — 3.3.d *Describe multicast protocols, such as RPF check, PIM SM, IGMP v2/v3, SSM, bidir, and MSDP*. This is part one of two: addressing, IGMP and RPF. [Part two](/blog/pim-sparse-mode-rp-spt-switchover-ssm-explained) covers PIM sparse mode, the RP, SPT switchover, SSM, bidir and MSDP.

## Cheat sheet

| | |
|---|---|
| **IP protocol number** | 2 (IGMP) · 103 (PIM) |
| **TTL on every IGMP message** | **1** — it must never leave the subnet |
| **IP header** | Carries the **Router Alert** option, so routers punt it to the CPU |
| **All hosts** | `224.0.0.1` — IGMP general queries go here |
| **All routers** | `224.0.0.2` — IGMPv2 leaves go here |
| **All IGMPv3 routers** | `224.0.0.22` — every IGMPv3 report goes here |
| **Query** | Type `0x11` |
| **IGMPv1 / v2 / v3 report** | `0x12` / `0x16` / `0x22` |
| **IGMPv2 leave** | `0x17` |
| **MAC mapping** | `01:00:5E` + **23 bits** of the group — a **32:1** collision |
| **RFC default query interval** | 125 s · **Cisco IOS default: 60 s** |
| **Cisco `ip pim spt-threshold` default** | **0 kbps** — switch to the source tree on the first packet |

**The two sentences that matter.** Multicast is **receiver-driven**: nothing is sent anywhere until a host asks, and the asking is IGMP. And multicast forwarding is decided by **where a packet came from**, not where it is going — that is the RPF check, and it is the only thing standing between you and a loop that melts the network.

---

## Why it exists

A trading floor gets a market data feed. A hospital pushes a 4 Mbps video briefing to 500 workstations. A school streams assembly to every classroom.

Do it with unicast and the server builds 500 independent TCP streams. Two gigabits of identical bytes leave one NIC, cross the same uplink 500 times, and arrive at 500 machines that all wanted exactly the same thing. The server dies before the network does.

Broadcast is worse in a different way — it reaches machines that did not ask, cannot cross a router, and forces every CPU on the segment to process a frame it will discard.

Multicast is the third option: **one sender, one copy per link, replicated only where the paths diverge.**

<figure class="fig">
<svg viewBox="0 0 640 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Unicast sends one copy per receiver across the shared link; multicast sends one copy and replicates it at the router">
  <style>
    .n{fill:#17171A}.nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}
    .l{stroke:#8A8A93;stroke-width:1.5;fill:none}
    .hot{stroke:#D3002D;stroke-width:3;fill:none}
    .ok{stroke:#1f9d6b;stroke-width:3;fill:none}
    .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}
    .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}
    .bad{fill:#D3002D}.good{fill:#0f6b47}
    .hdr{font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700;fill:#8A8A93;letter-spacing:.08em}
    .p{fill:#D3002D}.pg{fill:#1f9d6b}
  </style>
  <text class="hdr" x="14" y="16">UNICAST — ONE COPY PER RECEIVER</text>
  <rect class="n" x="14" y="60" width="72" height="32" rx="3"/><text class="nt" x="50" y="81" text-anchor="middle">SERVER</text>
  <line class="hot" x1="86" y1="76" x2="252" y2="76"/>
  <rect class="n" x="252" y="60" width="56" height="32" rx="3"/><text class="nt" x="280" y="81" text-anchor="middle">R</text>
  <line class="l" x1="308" y1="70" x2="470" y2="30"/>
  <line class="l" x1="308" y1="76" x2="470" y2="76"/>
  <line class="l" x1="308" y1="82" x2="470" y2="122"/>
  <rect class="n" x="470" y="16"  width="78" height="28" rx="3"/><text class="nt" x="509" y="35"  text-anchor="middle">PC 1</text>
  <rect class="n" x="470" y="62"  width="78" height="28" rx="3"/><text class="nt" x="509" y="81"  text-anchor="middle">PC 2</text>
  <rect class="n" x="470" y="108" width="78" height="28" rx="3"/><text class="nt" x="509" y="127" text-anchor="middle">PC 3</text>
  <circle class="p" r="4.5"><animateMotion dur="2.2s" repeatCount="indefinite" path="M 86 76 L 252 76"/></circle>
  <circle class="p" r="4.5"><animateMotion dur="2.2s" begin="0.35s" repeatCount="indefinite" path="M 86 76 L 252 76"/></circle>
  <circle class="p" r="4.5"><animateMotion dur="2.2s" begin="0.7s" repeatCount="indefinite" path="M 86 76 L 252 76"/></circle>
  <text class="k bad" x="169" y="106" text-anchor="middle">3 copies · 12 Mbps</text>
  <text class="s" x="169" y="122" text-anchor="middle">500 receivers → 2 Gbps on this one link</text>
  <line x1="14" y1="152" x2="626" y2="152" stroke="#ECECEF" stroke-width="1"/>
  <text class="hdr" x="14" y="176">MULTICAST — ONE COPY, SPLIT WHERE THE PATHS DIVERGE</text>
  <rect class="n" x="14" y="220" width="72" height="32" rx="3"/><text class="nt" x="50" y="241" text-anchor="middle">SERVER</text>
  <line class="ok" x1="86" y1="236" x2="252" y2="236"/>
  <rect class="n" x="252" y="220" width="56" height="32" rx="3"/><text class="nt" x="280" y="241" text-anchor="middle">R</text>
  <line class="l" x1="308" y1="230" x2="470" y2="190"/>
  <line class="l" x1="308" y1="236" x2="470" y2="236"/>
  <line class="l" x1="308" y1="242" x2="470" y2="282"/>
  <rect class="n" x="470" y="176" width="78" height="28" rx="3"/><text class="nt" x="509" y="195" text-anchor="middle">PC 1</text>
  <rect class="n" x="470" y="222" width="78" height="28" rx="3"/><text class="nt" x="509" y="241" text-anchor="middle">PC 2</text>
  <rect class="n" x="470" y="268" width="78" height="28" rx="3"/><text class="nt" x="509" y="287" text-anchor="middle">PC 3</text>
  <circle class="pg" r="4.5"><animateMotion dur="2.2s" repeatCount="indefinite" path="M 86 236 L 252 236"/></circle>
  <circle class="pg" r="4"><animateMotion dur="1.1s" begin="1.1s" repeatCount="indefinite" path="M 308 230 L 470 190"/></circle>
  <circle class="pg" r="4"><animateMotion dur="1.1s" begin="1.1s" repeatCount="indefinite" path="M 308 236 L 470 236"/></circle>
  <circle class="pg" r="4"><animateMotion dur="1.1s" begin="1.1s" repeatCount="indefinite" path="M 308 242 L 470 282"/></circle>
  <text class="k good" x="169" y="266" text-anchor="middle">1 copy · 4 Mbps</text>
  <text class="s" x="169" y="282" text-anchor="middle">500 receivers → still 4 Mbps</text>
</svg>
<figcaption><b>Figure 1.</b> The saving is not at the edge — it is on every link the traffic shares. Add receivers to the multicast picture and the load on the left-hand link does not move.</figcaption>
</figure>

<div class="why">
<b>What you give up</b>
Multicast is UDP. There is no handshake, no retransmission, no flow control and no acknowledgement — a sender has no idea whether anybody is listening, and a receiver has no way to ask for a lost packet. Everything reliable in a multicast application is built <em>above</em> the transport by the application itself. This is also why multicast is so unforgiving to troubleshoot: nothing complains. It just does not arrive.
</div>

---

## The address plan

`224.0.0.0/4` — everything from `224.0.0.0` to `239.255.255.255`. It splits into ranges that behave very differently, and using the wrong one is a real and common design mistake.

| Range | Name | Behaviour |
|---|---|---|
| `224.0.0.0/24` | **Link-local control** | **TTL 1, never routed.** OSPF `224.0.0.5/.6`, EIGRP `.10`, PIM `.13`, VRRP `.18`, IGMPv3 `.22`, HSRPv2/GLBP `.102` |
| `224.0.1.0` – `238.255.255.255` | Globally scoped | Routable across the internet. `224.0.1.1` is NTP |
| `232.0.0.0/8` | **SSM** | Source-specific. No RP, no shared tree. Needs IGMPv3 |
| `233.0.0.0/8` | GLOP | Your AS number in the middle two octets (RFC 3180) |
| `239.0.0.0/8` | **Administratively scoped** | RFC 2365 — private, like RFC 1918. **Use this inside an enterprise** |

<div class="real">
<b>In the real world</b>
Pick your enterprise groups out of <code>239.x.x.x</code> and then sub-divide it deliberately — <code>239.1.x.x</code> for video, <code>239.2.x.x</code> for market data, <code>239.192.x.x</code> for a site-local scope you filter at the WAN edge. Applications that ship with a hard-coded <code>224.x</code> group are the ones that later collide with a routing protocol or leak across your entire WAN, because nothing in the globally-scoped range stops at a boundary you did not build.
</div>

### The 32-to-1 MAC collision

An Ethernet frame needs a destination MAC. A multicast group maps to one by a fixed rule: take `01:00:5E`, set the next bit to 0, and paste in **the low 23 bits of the group address**.

The group address has 28 usable bits. Only 23 survive. **Five bits are thrown away, so 32 different groups land on the same MAC address.**

<figure class="fig">
<svg viewBox="0 0 640 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Of the 32 bits of a multicast group address, four are the fixed 224/4 prefix, five are discarded, and only the low 23 bits are copied into the destination MAC address">
  <style>
    .lbl{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}
    .mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;fill:#17171A;letter-spacing:.5px}
    .hdr{font-family:ui-sans-serif,system-ui;font-size:10.5px;font-weight:700;fill:#8A8A93;letter-spacing:.07em}
    .k{font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}
  </style>
  <text class="hdr" x="14" y="18">GROUP  239.1.1.1  — 32 BITS</text>
  <rect x="10" y="30" width="44" height="22" fill="#ECECEF" stroke="#B5B5BC"/>
  <rect x="56" y="30" width="58" height="22" fill="#FFE0E5" stroke="#F5384F"/>
  <rect x="116" y="30" width="250" height="22" fill="rgba(31,157,107,.14)" stroke="#1f9d6b"/>
  <text class="mono" x="16" y="46">1110</text>
  <text class="mono" x="60" y="46" fill="#B80027">1111 0</text>
  <text class="mono" x="120" y="46" fill="#0f6b47">000 0001 0000 0001 0000 0001</text>
  <text class="lbl" x="12" y="68">4 bits</text>
  <text class="lbl" x="12" y="81">224/4</text>
  <text class="k" x="58" y="68" fill="#B80027">5 bits</text>
  <text class="lbl" x="58" y="81" fill="#B80027">discarded</text>
  <text class="k" x="118" y="68" fill="#0f6b47">23 bits</text>
  <text class="lbl" x="118" y="81" fill="#0f6b47">all that reaches the wire</text>
  <path d="M 240 92 L 240 122" stroke="#1f9d6b" stroke-width="1.5" fill="none" marker-end="url(#mcarrow)"/>
  <defs><marker id="mcarrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L10 5 L0 10 z" fill="#1f9d6b"/></marker></defs>
  <text class="hdr" x="14" y="142">DESTINATION MAC — 48 BITS</text>
  <rect x="10" y="152" width="104" height="22" fill="#ECECEF" stroke="#B5B5BC"/>
  <rect x="116" y="152" width="106" height="22" fill="rgba(31,157,107,.14)" stroke="#1f9d6b"/>
  <text class="mono" x="16" y="168">01:00:5E</text>
  <text class="mono" x="122" y="168" fill="#0f6b47">01:01:01</text>
  <text class="lbl" x="12" y="190">25 bits: the IANA prefix, plus one 0 bit</text>
  <text class="lbl" x="240" y="168" fill="#0f6b47">← the 23 green bits, copied straight in</text>
  <text class="k" x="14" y="212" fill="#D3002D">239.1.1.1 · 224.1.1.1 · 239.129.1.1 · 232.1.1.1 — four different groups, one MAC: 01:00:5E:01:01:01</text>
</svg>
<figcaption><b>Figure 2.</b> Four fixed bits, five discarded, twenty-three kept: 2<sup>5</sup> = <b>32 groups share every multicast MAC address</b>. Check it by hand — mask the second octet with <code>0x7F</code> and keep the last two. <code>239.<b>129</b>.1.1</code> gives <code>0x81 &amp; 0x7F = 0x01</code>, the same byte <code>224.<b>1</b>.1.1</code> produces.</figcaption>
</figure>

<div class="warn">
<b>Why this bites</b>
A NIC that has joined <code>239.1.1.1</code> programs its filter for <code>01:00:5E:01:01:01</code> — and will therefore accept every frame for the other 31 groups that share it. The card passes them up, the IP stack looks at the real destination and discards them, and the cost lands on the host CPU. On a quiet network you will never notice. On a trading floor with hundreds of groups, a badly chosen group plan produces mystery CPU load on receivers that "are not even subscribed to that feed". Keep the low 23 bits of your groups distinct and the problem disappears.
</div>

---

## IGMP — how a host asks

IGMP runs **only between hosts and their local router**. It never crosses the router; that is what PIM is for. Every message is TTL 1 and carries the IP Router Alert option so that routers intercept it instead of forwarding it.

Step through the whole lifecycle — a host joining, the stream arriving, the periodic query, and the leave:

<div class="walk">
<div class="walk-head">IGMPv2 — the full lifecycle <span class="walk-hint">click a step</span></div>
<div class="walk-tabs">
  <input type="radio" name="igmpwalk" id="ig1" checked><label for="ig1"><span class="step-n">1</span>Silence</label>
  <input type="radio" name="igmpwalk" id="ig2"><label for="ig2"><span class="step-n">2</span>Join</label>
  <input type="radio" name="igmpwalk" id="ig3"><label for="ig3"><span class="step-n">3</span>Stream</label>
  <input type="radio" name="igmpwalk" id="ig4"><label for="ig4"><span class="step-n">4</span>Query</label>
  <input type="radio" name="igmpwalk" id="ig5"><label for="ig5"><span class="step-n">5</span>Suppression</label>
  <input type="radio" name="igmpwalk" id="ig6"><label for="ig6"><span class="step-n">6</span>Leave</label>
</div>
<div class="walk-panels">

<div class="walk-panel">
<svg viewBox="0 0 640 190" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Before any host joins, the router forwards nothing onto the segment">
  <style>
    .n{fill:#17171A}.nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}
    .l{stroke:#8A8A93;stroke-width:1.5}.s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}
    .k{font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700;fill:#8A8A93}
    .dim{opacity:.35}
  </style>
  <rect class="n dim" x="14" y="76" width="82" height="32" rx="3"/><text class="nt dim" x="55" y="97" text-anchor="middle">SOURCE</text>
  <text class="s dim" x="55" y="124" text-anchor="middle">10.10.10.10</text>
  <line class="l dim" x1="96" y1="92" x2="240" y2="92"/>
  <rect class="n" x="240" y="76" width="70" height="32" rx="3"/><text class="nt" x="275" y="97" text-anchor="middle">R1</text>
  <text class="s" x="275" y="124" text-anchor="middle">10.1.10.1</text>
  <line class="l" x1="310" y1="92" x2="420" y2="92"/>
  <rect class="n" x="420" y="76" width="60" height="32" rx="3"/><text class="nt" x="450" y="97" text-anchor="middle">SW</text>
  <line class="l" x1="480" y1="92" x2="560" y2="92"/>
  <rect class="n" x="560" y="76" width="66" height="32" rx="3"/><text class="nt" x="593" y="97" text-anchor="middle">PC</text>
  <text class="s" x="593" y="124" text-anchor="middle">10.1.10.50</text>
  <text class="k" x="320" y="40" text-anchor="middle">no group state · no traffic on this segment</text>
  <text class="s" x="320" y="164" text-anchor="middle">The source may be streaming happily. R1 has nobody to send it to, so it sends nothing.</text>
</svg>
<p class="walk-say"><span class="walk-title">Nothing is sent to nobody</span>
This is the state multicast starts in and the one people forget. A perfectly healthy source can be transmitting, and not one byte reaches this segment, because <b>multicast is receiver-driven</b>. There is no group state on R1 at all — <code>show ip igmp groups</code> is empty.</p>
</div>

<div class="walk-panel">
<svg viewBox="0 0 640 190" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The PC sends an unsolicited IGMPv2 membership report to the group address">
  <style>
    .n{fill:#17171A}.nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}
    .l{stroke:#8A8A93;stroke-width:1.5}.s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}
    .blue{stroke:#4b7bec;stroke-width:2.5;fill:none}
    .k{font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700;fill:#2b5ab8}
  </style>
  <rect class="n" x="14" y="76" width="82" height="32" rx="3" opacity=".35"/><text class="nt" x="55" y="97" text-anchor="middle" opacity=".35">SOURCE</text>
  <line class="l" x1="96" y1="92" x2="240" y2="92" opacity=".35"/>
  <rect class="n" x="240" y="76" width="70" height="32" rx="3"/><text class="nt" x="275" y="97" text-anchor="middle">R1</text>
  <line class="l" x1="310" y1="92" x2="420" y2="92"/>
  <rect class="n" x="420" y="76" width="60" height="32" rx="3"/><text class="nt" x="450" y="97" text-anchor="middle">SW</text>
  <line class="l" x1="480" y1="92" x2="560" y2="92"/>
  <rect class="n" x="560" y="76" width="66" height="32" rx="3"/><text class="nt" x="593" y="97" text-anchor="middle">PC</text>
  <path class="blue" d="M 560 84 L 480 84 L 420 84 L 310 84"/>
  <circle r="5" fill="#4b7bec"><animateMotion dur="1.8s" repeatCount="indefinite" path="M 560 84 L 310 84"/></circle>
  <text class="k" x="435" y="66" text-anchor="middle">IGMPv2 Membership Report</text>
  <text class="s" x="435" y="50" text-anchor="middle">type 0x16 · dst 239.1.1.1 · TTL 1</text>
  <text class="s" x="320" y="150" text-anchor="middle">The report goes to the group itself, not to the router — every member hears it. That matters in step 5.</text>
  <text class="s" x="320" y="168" text-anchor="middle">R1 now has (*, 239.1.1.1) state on this interface and asks PIM to pull the stream.</text>
</svg>
<p class="walk-say"><span class="walk-title">The host speaks first</span>
The application calls <code>setsockopt(IP_ADD_MEMBERSHIP)</code>, and the stack immediately sends an <b>unsolicited report</b> — it does not wait to be asked. Note the destination: the report is addressed to <b>the group itself</b>, <code>239.1.1.1</code>, not to the router. Every other member of that group on the segment receives it.</p>
<div class="walk-wire">Ethernet  dst <b>01:00:5e:01:01:01</b>  src 00:50:56:a1:b2:c3  type 0x0800
IPv4      10.1.10.50 → <b>239.1.1.1</b>  proto 2 (IGMP)  <b>TTL 1</b>  opt: Router Alert
IGMPv2    type <b>0x16</b> (Membership Report)  max-resp 0  group 239.1.1.1</div>
</div>

<div class="walk-panel">
<svg viewBox="0 0 640 190" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The multicast stream now flows from the source through the router to the PC">
  <style>
    .n{fill:#17171A}.nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}
    .l{stroke:#8A8A93;stroke-width:1.5}.s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}
    .ok{stroke:#1f9d6b;stroke-width:3;fill:none}
    .k{font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700;fill:#0f6b47}
  </style>
  <rect class="n" x="14" y="76" width="82" height="32" rx="3"/><text class="nt" x="55" y="97" text-anchor="middle">SOURCE</text>
  <line class="ok" x1="96" y1="92" x2="240" y2="92"/>
  <rect class="n" x="240" y="76" width="70" height="32" rx="3"/><text class="nt" x="275" y="97" text-anchor="middle">R1</text>
  <line class="ok" x1="310" y1="92" x2="420" y2="92"/>
  <rect class="n" x="420" y="76" width="60" height="32" rx="3"/><text class="nt" x="450" y="97" text-anchor="middle">SW</text>
  <line class="ok" x1="480" y1="92" x2="560" y2="92"/>
  <rect class="n" x="560" y="76" width="66" height="32" rx="3"/><text class="nt" x="593" y="97" text-anchor="middle">PC</text>
  <circle r="4.5" fill="#1f9d6b"><animateMotion dur="2s" repeatCount="indefinite" path="M 96 92 L 560 92"/></circle>
  <circle r="4.5" fill="#1f9d6b"><animateMotion dur="2s" begin="0.5s" repeatCount="indefinite" path="M 96 92 L 560 92"/></circle>
  <circle r="4.5" fill="#1f9d6b"><animateMotion dur="2s" begin="1s" repeatCount="indefinite" path="M 96 92 L 560 92"/></circle>
  <text class="k" x="320" y="52" text-anchor="middle">10.10.10.10 → 239.1.1.1 · UDP · one copy per link</text>
  <text class="s" x="320" y="160" text-anchor="middle">Source MAC is the server's. Destination MAC is 01:00:5e:01:01:01 on every hop — it is derived from the group, not learned.</text>
</svg>
<p class="walk-say"><span class="walk-title">The stream arrives</span>
The data itself is plain UDP to the group address. Nothing about it is negotiated: the source never learns a receiver exists, and the receiver never acknowledges anything. The destination MAC is <b>calculated</b> from the group, which is why a multicast frame is never flooded by a switch the way an unknown unicast is — it is a multicast frame, and by default a switch floods it to every port in the VLAN. Fixing that is IGMP snooping, below.</p>
</div>

<div class="walk-panel">
<svg viewBox="0 0 640 190" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The router sends a periodic general query to 224.0.0.1 and the host answers">
  <style>
    .n{fill:#17171A}.nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}
    .l{stroke:#8A8A93;stroke-width:1.5}.s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}
    .q{stroke:#F2994A;stroke-width:2.5;fill:none}.blue{stroke:#4b7bec;stroke-width:2.5;fill:none}
    .k{font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700;fill:#B26014}
  </style>
  <rect class="n" x="240" y="76" width="70" height="32" rx="3"/><text class="nt" x="275" y="97" text-anchor="middle">R1</text>
  <text class="s" x="275" y="124" text-anchor="middle">querier</text>
  <line class="l" x1="310" y1="92" x2="420" y2="92"/>
  <rect class="n" x="420" y="76" width="60" height="32" rx="3"/><text class="nt" x="450" y="97" text-anchor="middle">SW</text>
  <line class="l" x1="480" y1="92" x2="560" y2="92"/>
  <rect class="n" x="560" y="76" width="66" height="32" rx="3"/><text class="nt" x="593" y="97" text-anchor="middle">PC</text>
  <path class="q" d="M 310 80 L 560 80"/>
  <circle r="5" fill="#F2994A"><animateMotion dur="1.6s" repeatCount="indefinite" path="M 310 80 L 560 80"/></circle>
  <path class="blue" d="M 560 106 L 310 106"/>
  <circle r="5" fill="#4b7bec"><animateMotion dur="1.6s" begin="1.6s" repeatCount="indefinite" path="M 560 106 L 310 106"/></circle>
  <text class="k" x="435" y="62" text-anchor="middle">General Query · type 0x11 · dst 224.0.0.1 · every 60 s</text>
  <text class="s" x="435" y="140" text-anchor="middle" fill="#2b5ab8">Report · type 0x16 · sent after a random delay of 0–10 s</text>
  <text class="s" x="320" y="172" text-anchor="middle">Two queries missed and R1 removes the group. Membership is soft state — it has to be re-earned, continuously.</text>
</svg>
<p class="walk-say"><span class="walk-title">Membership is soft state</span>
R1 asks the whole segment, every 60 seconds by default on IOS (the RFC says 125), "who still wants anything?" Hosts answer with a report per group they are still in. The <b>Max Response Time</b> field in the query — 10 seconds by default — tells hosts the window to answer in, and each host picks a random moment inside it so 400 PCs do not reply at once. Miss enough queries and the state times out at <code>robustness × query-interval + max-response</code>, which is 130 s on IOS defaults.</p>
<div class="walk-wire">IPv4      10.1.10.1 → <b>224.0.0.1</b>  proto 2  TTL 1  opt: Router Alert
IGMPv2    type <b>0x11</b> (Membership Query)  max-resp <b>100</b> = 10.0 s  group <b>0.0.0.0</b> = general</div>
</div>

<div class="walk-panel">
<svg viewBox="0 0 640 190" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="One host reports and the other hosts hear it and stay silent">
  <style>
    .n{fill:#17171A}.nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}
    .l{stroke:#8A8A93;stroke-width:1.5}.s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}
    .blue{stroke:#4b7bec;stroke-width:2.5;fill:none}
    .mute{stroke:#B5B5BC;stroke-width:1.5;stroke-dasharray:4 4;fill:none}
    .k{font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700;fill:#2b5ab8}
  </style>
  <rect class="n" x="210" y="76" width="70" height="32" rx="3"/><text class="nt" x="245" y="97" text-anchor="middle">R1</text>
  <line class="l" x1="280" y1="92" x2="360" y2="92"/>
  <rect class="n" x="360" y="76" width="56" height="32" rx="3"/><text class="nt" x="388" y="97" text-anchor="middle">SW</text>
  <line class="l" x1="416" y1="86" x2="520" y2="34"/>
  <line class="l" x1="416" y1="92" x2="520" y2="92"/>
  <line class="l" x1="416" y1="98" x2="520" y2="150"/>
  <rect class="n" x="520" y="20"  width="70" height="28" rx="3"/><text class="nt" x="555" y="39"  text-anchor="middle">PC 1</text>
  <rect class="n" x="520" y="78"  width="70" height="28" rx="3"/><text class="nt" x="555" y="97"  text-anchor="middle">PC 2</text>
  <rect class="n" x="520" y="136" width="70" height="28" rx="3"/><text class="nt" x="555" y="155" text-anchor="middle">PC 3</text>
  <path class="blue" d="M 520 34 L 416 34 L 280 34"/>
  <circle r="5" fill="#4b7bec"><animateMotion dur="1.7s" repeatCount="indefinite" path="M 520 34 L 280 34"/></circle>
  <path class="mute" d="M 520 92 L 470 92"/><path class="mute" d="M 520 150 L 470 150"/>
  <text class="s" x="462" y="112" text-anchor="end" fill="#8A8A93">heard it — cancels its timer</text>
  <text class="s" x="462" y="170" text-anchor="end" fill="#8A8A93">heard it — cancels its timer</text>
  <text class="k" x="360" y="18" text-anchor="middle">PC 1's timer fired first. Its report is sent to the group, so PC 2 and PC 3 receive it.</text>
</svg>
<p class="walk-say"><span class="walk-title">Report suppression — and why v3 dropped it</span>
Because reports are addressed to the group, every member hears every other member's report. A host that hears somebody else answer for a group it is in <b>cancels its own report</b>. One reply per group per segment, regardless of how many hosts are in it. Elegant, and it keeps the segment quiet.
<br><br>It is also why <b>the router does not know how many receivers it has</b>, only that it has at least one — and why IGMP snooping on the switch needs care, since a switch that never sees PC 2's report does not know PC 2 wants the stream. <b>IGMPv3 removes report suppression entirely</b>: every host reports every time.</p>
</div>

<div class="walk-panel">
<svg viewBox="0 0 640 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The host sends a leave to 224.0.0.2 and the router replies with a group specific query before removing the state">
  <style>
    .n{fill:#17171A}.nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}
    .l{stroke:#8A8A93;stroke-width:1.5}.s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}
    .red{stroke:#D3002D;stroke-width:2.5;fill:none}.q{stroke:#F2994A;stroke-width:2.5;fill:none}
    .k{font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700;fill:#B80027}
  </style>
  <rect class="n" x="240" y="86" width="70" height="32" rx="3"/><text class="nt" x="275" y="107" text-anchor="middle">R1</text>
  <line class="l" x1="310" y1="102" x2="420" y2="102"/>
  <rect class="n" x="420" y="86" width="60" height="32" rx="3"/><text class="nt" x="450" y="107" text-anchor="middle">SW</text>
  <line class="l" x1="480" y1="102" x2="560" y2="102"/>
  <rect class="n" x="560" y="86" width="66" height="32" rx="3"/><text class="nt" x="593" y="107" text-anchor="middle">PC</text>
  <path class="red" d="M 560 74 L 310 74"/>
  <circle r="5" fill="#D3002D"><animateMotion dur="1.5s" repeatCount="indefinite" path="M 560 74 L 310 74"/></circle>
  <path class="q" d="M 310 132 L 560 132"/>
  <circle r="5" fill="#F2994A"><animateMotion dur="1.5s" begin="1.5s" repeatCount="indefinite" path="M 310 132 L 560 132"/></circle>
  <text class="k" x="435" y="58" text-anchor="middle">Leave Group · type 0x17 · dst 224.0.0.2 (all routers)</text>
  <text class="s" x="435" y="156" text-anchor="middle" fill="#B26014">Group-Specific Query · dst 239.1.1.1 · "anyone else?" · ×2, 1 s apart</text>
  <text class="s" x="320" y="184" text-anchor="middle">Silence for ~3 s and R1 tears the group down. Answer, and nothing changes — the other member keeps the stream alive.</text>
</svg>
<p class="walk-say"><span class="walk-title">Leaving, and the three seconds it costs</span>
The leave goes to <code>224.0.0.2</code> — <b>all routers</b>, not the group, because the other members must not hear it. R1 cannot just delete the state, since other hosts may still want the feed, so it sends a <b>group-specific query</b> to the group address and waits. <code>last-member-query-interval</code> 1 s × <code>last-member-query-count</code> 2 means roughly three seconds of stream still flowing after the last viewer left.
<br><br>IGMPv1 had <b>no leave message at all</b> — a group stayed alive until the query timer expired, up to three minutes of unwanted video on the segment. That alone is why v1 is gone.</p>
</div>

</div>
</div>

### What it looks like on the wire

These are real bytes — the checksums are correct, so you can paste the hex into Wireshark's *Import from Hex Dump* and it will decode.

<div class="cap">
<div class="cap-head">Capture · VLAN 10 access port <span class="cap-filter">igmp</span></div>
<table class="cap-list">
<thead><tr><th>No.</th><th>Time</th><th>Source</th><th>Destination</th><th>Proto</th><th>Len</th><th>Info</th></tr></thead>
<tbody>
<tr><td class="no">41</td><td>12.004</td><td>10.1.10.1</td><td>224.0.0.1</td><td>IGMPv2</td><td>60</td><td>Membership Query, general</td></tr>
<tr class="is-sel"><td class="no">42</td><td>15.338</td><td>10.1.10.50</td><td>239.1.1.1</td><td>IGMPv2</td><td>46</td><td><b>Membership Report group 239.1.1.1</b></td></tr>
<tr><td class="no">43</td><td>15.341</td><td>10.10.10.10</td><td>239.1.1.1</td><td>UDP</td><td>1358</td><td>1234 → 5004  Len=1316</td></tr>
<tr><td class="no">44</td><td>15.361</td><td>10.10.10.10</td><td>239.1.1.1</td><td>UDP</td><td>1358</td><td>1234 → 5004  Len=1316</td></tr>
<tr><td class="no">88</td><td>72.110</td><td>10.1.10.50</td><td>224.0.0.2</td><td>IGMPv2</td><td>46</td><td>Leave Group 239.1.1.1</td></tr>
<tr class="ctrl"><td class="no">89</td><td>72.112</td><td>10.1.10.1</td><td>239.1.1.1</td><td>IGMPv2</td><td>60</td><td>Membership Query, group 239.1.1.1</td></tr>
</tbody>
</table>
<div class="cap-tree"><pre>▾ Ethernet II
    <span class="f">Destination:</span> <span class="v">IPv4mcast_01:01:01 (<mark>01:00:5e:01:01:01</mark>)</span>
    <span class="f">Source:</span> <span class="v">VMware_a1:b2:c3 (00:50:56:a1:b2:c3)</span>
▾ Internet Protocol Version 4
    <span class="f">Header Length:</span> <span class="v">24 bytes (6)</span>      ← 20 + the Router Alert option
    <span class="f">Time to Live:</span> <span class="v"><mark>1</mark></span>                     ← never leaves this subnet
    <span class="f">Protocol:</span> <span class="v">IGMP (2)</span>
    <span class="f">Destination:</span> <span class="v">239.1.1.1</span>            ← the group, not the router
  ▾ <span class="f">Options:</span> (4 bytes)
      <span class="f">IP Option - Router Alert</span> <span class="v">(value 0)</span>
▾ Internet Group Management Protocol
    <span class="f">[IGMP Version:</span> <span class="v">2]</span>
    <span class="f">Type:</span> <span class="v"><mark>Membership Report (0x16)</mark></span>
    <span class="f">Max Resp Time:</span> <span class="v">0.0 sec (0x00)</span>
    <span class="f">Checksum:</span> <span class="v">0xf9fc [correct]</span>
    <span class="f">Multicast Address:</span> <span class="v">239.1.1.1</span></pre></div>
<div class="cap-hex"><pre>0000  01 00 5e 01 01 01 00 50  56 a1 b2 c3 08 00 <mark>46</mark> c0   ..^....PV.....F.
0010  00 20 00 00 40 00 <mark>01</mark> <mark>02</mark>  df e2 0a 01 0a 32 ef 01   . ..@........2..
0020  01 01 <mark>94 04 00 00</mark> <mark>16</mark> 00  f9 fc ef 01 01 01         ..............</pre></div>
<div class="cap-note"><b>Read the highlights left to right.</b> <code>46</code> — version 4, header length 6 words = 24 bytes, because of the option. <code>01</code> — TTL 1. <code>02</code> — protocol IGMP. <code>94 04 00 00</code> — the Router Alert option itself: option 148, length 4, value 0. <code>16</code> — IGMPv2 Membership Report. The last four bytes <code>ef 01 01 01</code> are the group, 239.1.1.1, appearing for the second time in the frame: once as the IP destination, once inside IGMP.</div>
</div>

An IGMPv3 report for a source-specific join looks quite different — note the destination is `224.0.0.22`, and the group is now buried inside a *group record* along with the source it will accept:

<div class="cap">
<div class="cap-head">Capture · IGMPv3 source-specific join <span class="cap-filter">igmp.type == 0x22</span></div>
<div class="cap-tree"><pre>▾ Internet Protocol Version 4
    <span class="f">Destination:</span> <span class="v"><mark>224.0.0.22</mark></span>            ← all IGMPv3-capable routers
▾ Internet Group Management Protocol
    <span class="f">Type:</span> <span class="v"><mark>Membership Report (0x22)</mark></span>
    <span class="f">Num Group Records:</span> <span class="v">1</span>
  ▾ <span class="f">Group Record : 232.1.1.1  CHANGE_TO_INCLUDE_MODE</span>
      <span class="f">Record Type:</span> <span class="v"><mark>Change To Include Mode (3)</mark></span>
      <span class="f">Aux Data Len:</span> <span class="v">0</span>
      <span class="f">Num Src:</span> <span class="v">1</span>
      <span class="f">Multicast Address:</span> <span class="v">232.1.1.1</span>
      <span class="f">Source Address:</span> <span class="v"><mark>10.10.10.10</mark></span>   ← "this source and no other"</pre></div>
<div class="cap-hex"><pre>0000  01 00 5e 00 00 16 00 50  56 a1 b2 c3 08 00 46 c0   ..^....PV.....F.
0010  00 2c 00 00 40 00 01 02  ef c2 0a 01 0a 32 <mark>e0 00</mark>   .,..@........2..
0020  <mark>00 16</mark> 94 04 00 00 <mark>22</mark> 00  dd e6 00 00 00 01 <mark>03</mark> 00   ......"........
0030  00 01 <mark>e8 01 01 01</mark> <mark>0a 0a</mark>  <mark>0a 0a</mark>                     ..........</pre></div>
<div class="cap-note"><b>The six record types</b> are what IGMPv3 is for: <code>1</code> MODE_IS_INCLUDE, <code>2</code> MODE_IS_EXCLUDE, <code>3</code> CHANGE_TO_INCLUDE_MODE, <code>4</code> CHANGE_TO_EXCLUDE_MODE, <code>5</code> ALLOW_NEW_SOURCES, <code>6</code> BLOCK_OLD_SOURCES. A join is a state change; a periodic report is a state report. The bytes <code>e8 01 01 01</code> are 232.1.1.1 and <code>0a 0a 0a 0a</code> is 10.10.10.10 — group and source, side by side, which is the whole idea.</div>
</div>

### The three versions

| | **IGMPv1** (RFC 1112) | **IGMPv2** (RFC 2236) | **IGMPv3** (RFC 9776) |
|---|---|---|---|
| **Leave** | None — wait for timeout | **Leave Group** `0x17` | Report with BLOCK/TO_INCLUDE |
| **Group-specific query** | No | **Yes** | Yes, plus group-and-source |
| **Querier election** | None — PIM DR queries | **Lowest IP wins** | Lowest IP wins |
| **Max response time** | Fixed 10 s | **Configurable field** | Configurable |
| **Source filtering** | No | No | **INCLUDE / EXCLUDE lists** |
| **Report suppression** | Yes | Yes | **Removed** |
| **Reports sent to** | The group | The group | `224.0.0.22` |
| **Leave latency** | Up to ~3 min | ~3 s | ~3 s |

<div class="warn">
<b>Versions do not negotiate upward</b>
If any router on the segment speaks v2, all of them must. A host running v3 and a router running v2 will fall back to v2 and <b>silently lose source filtering</b> — the join still works, the SSM behaviour does not. IOS defaults to IGMPv2; SSM needs v3 turned on explicitly with <code>ip igmp version 3</code> on every receiver-facing interface. And the querier election is <b>lowest IP wins</b>, which is the opposite of PIM's DR election on the same segment — highest IP wins. Two elections, two rules, one wire. Expect that in an exam and in a real fault.
</div>

---

## IGMP snooping — the switch problem

A switch does not run IGMP. To a switch, a multicast frame is a frame with a group-bit set in the destination MAC, and the default behaviour for that is **flood it to every port in the VLAN**. One 4 Mbps stream, and every PC in VLAN 10 receives it — including the forty that never asked.

IGMP snooping (RFC 4541) fixes it: the switch listens to the IGMP conversation it is forwarding, notes which port each report came from, and builds a Layer 2 forwarding entry for the group MAC containing only those ports.

<figure class="fig">
<svg viewBox="0 0 640 240" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Without snooping the switch floods multicast to all ports, with snooping it forwards only to ports that sent reports">
  <style>
    .n{fill:#17171A}.nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}
    .l{stroke:#8A8A93;stroke-width:1.5}.s{font-family:ui-sans-serif,system-ui;font-size:10px;fill:#5C5C64}
    .bad{stroke:#D3002D;stroke-width:2.5}.ok{stroke:#1f9d6b;stroke-width:2.5}
    .mute{stroke:#D9D9DE;stroke-width:1.5}
    .hdr{font-family:ui-sans-serif,system-ui;font-size:10.5px;font-weight:700;letter-spacing:.06em}
  </style>
  <text class="hdr" x="14" y="16" fill="#D3002D">NO SNOOPING — FLOODED</text>
  <rect class="n" x="24" y="46" width="56" height="30" rx="3"/><text class="nt" x="52" y="66" text-anchor="middle">SW</text>
  <line class="bad" x1="80" y1="52" x2="190" y2="26"/>
  <line class="bad" x1="80" y1="58" x2="190" y2="58"/>
  <line class="bad" x1="80" y1="66" x2="190" y2="90"/>
  <line class="bad" x1="80" y1="72" x2="190" y2="122"/>
  <rect class="n" x="190" y="14"  width="66" height="24" rx="3"/><text class="nt" x="223" y="31"  text-anchor="middle">joined</text>
  <rect class="n" x="190" y="46"  width="66" height="24" rx="3" opacity=".4"/><text class="nt" x="223" y="63"  text-anchor="middle">no</text>
  <rect class="n" x="190" y="78"  width="66" height="24" rx="3" opacity=".4"/><text class="nt" x="223" y="95"  text-anchor="middle">no</text>
  <rect class="n" x="190" y="110" width="66" height="24" rx="3" opacity=".4"/><text class="nt" x="223" y="127" text-anchor="middle">no</text>
  <text class="s" x="140" y="152" text-anchor="middle" fill="#D3002D">4 Mbps × 4 ports — three of them wasted</text>
  <line x1="320" y1="10" x2="320" y2="230" stroke="#ECECEF"/>
  <text class="hdr" x="352" y="16" fill="#0f6b47">SNOOPING ON — FORWARDED</text>
  <rect class="n" x="362" y="46" width="56" height="30" rx="3"/><text class="nt" x="390" y="66" text-anchor="middle">SW</text>
  <line class="ok" x1="418" y1="52" x2="528" y2="26"/>
  <line class="mute" x1="418" y1="58" x2="528" y2="58"/>
  <line class="mute" x1="418" y1="66" x2="528" y2="90"/>
  <line class="mute" x1="418" y1="72" x2="528" y2="122"/>
  <rect class="n" x="528" y="14"  width="66" height="24" rx="3"/><text class="nt" x="561" y="31"  text-anchor="middle">joined</text>
  <rect class="n" x="528" y="46"  width="66" height="24" rx="3" opacity=".4"/><text class="nt" x="561" y="63"  text-anchor="middle">no</text>
  <rect class="n" x="528" y="78"  width="66" height="24" rx="3" opacity=".4"/><text class="nt" x="561" y="95"  text-anchor="middle">no</text>
  <rect class="n" x="528" y="110" width="66" height="24" rx="3" opacity=".4"/><text class="nt" x="561" y="127" text-anchor="middle">no</text>
  <circle r="4" fill="#1f9d6b"><animateMotion dur="1.4s" repeatCount="indefinite" path="M 418 52 L 528 26"/></circle>
  <text class="s" x="478" y="152" text-anchor="middle" fill="#0f6b47">4 Mbps × 1 port</text>
  <rect x="14" y="176" width="612" height="52" fill="#F1EEE9" stroke="#D9D9DE"/>
  <text class="s" x="26" y="196" font-weight="700" fill="#17171A">The trap:</text>
  <text class="s" x="82" y="196">snooping needs somebody to send queries. No router on the VLAN — a Layer 2 island, or</text>
  <text class="s" x="26" y="212">a VLAN whose SVI has no PIM — means no queries. Membership times out, and the stream stops.</text>
</svg>
<figcaption><b>Figure 3.</b> Snooping is on by default on Catalyst switches. The failure it produces is not "too much traffic" — it is a stream that works for a minute and then stops.</figcaption>
</figure>

<div class="real">
<b>In the real world</b>
This is the single most common multicast fault in a campus, and it looks nothing like a multicast fault. A video wall in a Layer-2-only VLAN works perfectly for about three minutes after a reboot, then goes black. The cause is that snooping aged out the group because nothing was querying. The fix is one line on a switch — <code>ip igmp snooping querier</code> — or a routed SVI with PIM on it. If you ever meet "it works right after a reload and then dies", check for a querier before anything else.
</div>

---

## The RPF check — forwarding, backwards

Here is the problem. A multicast packet's destination is a group, not a place. It has no single exit interface. A router that simply forwarded a group packet out of every interface would, on any network with a loop in it, produce a packet that circulates and multiplies forever — and unlike unicast, there is no TTL-per-path discipline that saves you, because the packet is being duplicated on every pass.

So multicast forwarding uses a completely different test. The router ignores the destination and asks:

> **Did this packet arrive on the interface I would use to send a packet *to its source*?**

That is **Reverse Path Forwarding**. Look up the *source* address in the unicast routing table, take the outgoing interface, and compare it with the interface the packet actually came in on. Same interface — accept and forward. Different — **drop, silently**.

<figure class="fig">
<svg viewBox="0 0 640 236" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Two identical multicast packets reach R4 by different paths; the one arriving on the interface that points back at the source is forwarded, the other is dropped by the RPF check">
  <style>
    .n{fill:#17171A}.nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}
    .ok{stroke:#1f9d6b;stroke-width:2.5;fill:none}.bad{stroke:#D3002D;stroke-width:2.5;fill:none}
    .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}
    .k{font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}
  </style>
  <rect class="n" x="14" y="98" width="86" height="32" rx="3"/><text class="nt" x="57" y="119" text-anchor="middle">SOURCE</text>
  <text class="s" x="57" y="146" text-anchor="middle">10.10.10.10</text>
  <path class="ok"  d="M 100 108 C 170 76 200 62 250 62"/>
  <path class="bad" d="M 100 122 C 170 156 200 176 250 176"/>
  <rect class="n" x="250" y="46" width="66" height="30" rx="3"/><text class="nt" x="283" y="66" text-anchor="middle">R2</text>
  <rect class="n" x="250" y="160" width="66" height="30" rx="3"/><text class="nt" x="283" y="180" text-anchor="middle">R3</text>
  <path class="ok"  d="M 316 62 C 370 62 390 96 430 110"/>
  <path class="bad" d="M 316 176 C 370 176 390 142 430 130"/>
  <rect class="n" x="430" y="102" width="92" height="36" rx="3"/><text class="nt" x="476" y="125" text-anchor="middle">R4</text>
  <circle r="4.5" fill="#1f9d6b"><animateMotion dur="2.6s" repeatCount="indefinite" path="M 100 108 C 170 76 200 62 250 62 L 316 62 C 370 62 390 96 430 110"/></circle>
  <circle r="4.5" fill="#D3002D"><animateMotion dur="2.6s" begin="0.7s" repeatCount="indefinite" path="M 100 122 C 170 156 200 176 250 176 L 316 176 C 370 176 390 142 430 130"/></circle>
  <text class="k" x="334" y="34" fill="#0f6b47">Gi0/1 — the RPF interface</text>
  <text class="s" x="334" y="48">matches the unicast route to 10.10.10.10 → <tspan font-weight="700" fill="#0f6b47">forward</tspan></text>
  <text class="k" x="334" y="206" fill="#D3002D">Gi0/2 — byte-for-byte the same packet</text>
  <text class="s" x="334" y="220">not the reverse path → <tspan font-weight="700" fill="#D3002D">dropped, silently</tspan></text>
  <text class="s" x="544" y="120">receivers</text>
  <text class="s" x="544" y="134">downstream</text>
</svg>
<figcaption><b>Figure 4.</b> Two identical packets arrive at R4. The one that came in on the interface R4 would use to reach the source is forwarded; the other is discarded — with no log, no interface error, and no counter anyone thinks to look at.</figcaption>
</figure>

<div class="term">
<div class="term-bar"><span class="term-dots"><i></i><i></i><i></i></span>R4 — the command that settles it</div>
<pre><span class="p">R4#</span> <span class="c">show ip rpf 10.10.10.10</span>
RPF information for ? (10.10.10.10)
  <span class="g">RPF interface: GigabitEthernet0/1</span>       <span class="o">&lt;- anything arriving anywhere else is dropped</span>
  RPF neighbor: ? (10.0.24.2)
  RPF route/mask: 10.10.10.0/24
  RPF type: <span class="g">unicast (ospf 1)</span>              <span class="o">&lt;- the table it consulted</span>
  Doing distance-preferred lookups across tables<span class="cur"></span></pre>
</div>
<p class="term-cap"><b>Read it as a question about the source, not the group.</b> The group appears nowhere in this output — RPF is purely a statement about the path back to the sender, which is exactly why a change to unicast routing can break multicast without touching anything that has the word multicast in it.</p>

<div class="why">
<b>Why this kills loops</b>
Every router accepts a given (source, group) on exactly <b>one</b> interface — the one facing the source. A packet that has gone round a loop must, by definition, arrive on some other interface, and is dropped there. The loop cannot close. The cost of that guarantee is that <b>multicast follows the unicast routing table backwards</b>: change a unicast path and the multicast tree moves with it, and any asymmetry between the forward and reverse paths breaks multicast while unicast stays perfectly healthy.
</div>

<div class="warn">
<b>The classic RPF failure</b>
A GRE tunnel or an asymmetric WAN design where traffic to a source leaves via one path and arrives via another. Unicast works — it does not care. Multicast fails completely, and the drops are silent. <code>show ip mroute</code> shows the group with an <b>incoming interface of Null</b> or the wrong interface, and the fix is either to correct the unicast path or to override it with a static multicast route: <code>ip mroute 10.10.10.0 255.255.255.0 &lt;correct-neighbour&gt;</code>, which is consulted <em>before</em> the unicast table for RPF purposes only.
</div>

---

## Configuration, word by word

Multicast routing is off by default. Three things must be true before anything works: routing enabled globally, PIM on **every** interface in the path, and IGMP on the receiver-facing interface (which PIM enables for you).

<div class="cmd">
<div class="cmd-line"><span class="t">ip multicast-routing</span> <span class="opt">[distributed]</span></div>
<dl class="cmd-parts">
<div class="is-key"><dt>ip multicast-routing</dt><dd>Global. Turns on the multicast routing process and creates the mroute table. <b>Without this, PIM commands are accepted on interfaces and nothing whatsoever happens</b> — no error, no forwarding. First thing to check on a dead multicast network.</dd></div>
<div><dt>distributed</dt><dd>Platform-dependent. Pushes replication onto the line cards instead of the route processor. Required on some platforms, rejected on others; harmless to omit in a lab.</dd></div>
</dl>
</div>

<div class="cmd">
<div class="cmd-line">interface GigabitEthernet0/1
 <span class="t">ip pim sparse-mode</span></div>
<dl class="cmd-parts">
<div><dt>ip pim</dt><dd>Enables PIM on this interface: it starts sending PIM hellos to <code>224.0.0.13</code> every 30 s, elects a DR on the segment, and — as a side effect — <b>enables IGMP on the interface too</b>. There is no separate "enable IGMP" command.</dd></div>
<div class="is-key"><dt>sparse-mode</dt><dd>The mode. <b>Sparse</b> = explicit join: nothing is forwarded until a downstream router asks. <b>Dense</b> = flood and prune: push to everyone, then wait to be told to stop. Dense mode is obsolete and should not be deployed. <code>sparse-dense-mode</code> is a legacy hybrid used for Auto-RP discovery; if you see it in a live network, it is old.</dd></div>
<div><dt>(implied)</dt><dd><b>PIM must be on every interface along the path</b> — including the link between two routers where no receiver exists. A single interface without <code>ip pim</code> in the middle of an otherwise perfect design silently breaks the tree.</dd></div>
</dl>
</div>

<div class="cmd">
<div class="cmd-line">interface Vlan10
 <span class="t">ip igmp version 3</span>
 <span class="t">ip igmp query-interval</span> <span class="opt">30</span>
 <span class="t">ip igmp last-member-query-count</span> <span class="opt">2</span></div>
<dl class="cmd-parts">
<div class="is-key"><dt>ip igmp version 3</dt><dd>IOS defaults to <b>version 2</b>. Version 3 is required for SSM and for any application that wants to specify its source. Set it on every router interface on the segment — <b>a mismatch drops the whole segment to the lowest version present</b>, without warning.</dd></div>
<div><dt>query-interval 30</dt><dd>How often the querier asks. IOS default <b>60 s</b>; the RFC default is 125 s. Lowering it detects a departed receiver faster and costs a little more control traffic. The group times out at <code>(robustness × query-interval) + max-response-time</code> — with defaults, 130 s.</dd></div>
<div><dt>last-member-query-count 2</dt><dd>After a leave, how many group-specific queries to send before tearing the group down. With <code>last-member-query-interval</code> of 1 s, this is the ~3 s of stream that keeps flowing after the last viewer quits. Drop both to 1 for a fast-leave-like behaviour on a segment with many receivers.</dd></div>
</dl>
</div>

<div class="cmd">
<div class="cmd-line"><span class="t">ip igmp snooping</span>
<span class="t">ip igmp snooping vlan</span> <span class="opt">10</span> <span class="t">querier</span></div>
<dl class="cmd-parts">
<div><dt>ip igmp snooping</dt><dd>Global, and <b>on by default</b> on Catalyst switches. Constrains multicast to the ports that asked for it instead of flooding the VLAN.</dd></div>
<div class="is-key"><dt>vlan 10 querier</dt><dd>Makes the switch generate IGMP queries itself. <b>Needed whenever the VLAN has no router doing it</b> — a Layer 2 island, or an SVI without PIM. Without a querier, snooping ages out the group and the stream stops. This one line is the fix for the most common campus multicast fault there is.</dd></div>
</dl>
</div>

### What a healthy router looks like

<div class="term">
<div class="term-bar"><span class="term-dots"><i></i><i></i><i></i></span>R1 — console</div>
<pre><span class="p">R1#</span> <span class="c">show ip igmp groups</span>
IGMP Connected Group Membership
Group Address    Interface      Uptime    Expires   Last Reporter   Group Accounted
<span class="y">239.1.1.1</span>        Vlan10         00:14:22  <span class="g">00:02:41</span>  <span class="y">10.1.10.50</span>
224.0.1.40       Vlan10         01:02:11  00:02:38  10.1.10.1

<span class="o">! Expires counts DOWN from 130s and is reset by every report. If you watch it</span>
<span class="o">! reach 00:00:00 and the group disappear, nothing is reporting — look for a querier.</span>

<span class="p">R1#</span> <span class="c">show ip mroute 239.1.1.1</span>
(*, 239.1.1.1), 00:14:22/stopped, RP 10.255.255.1, flags: SJC
  Incoming interface: <span class="y">GigabitEthernet0/1</span>, RPF nbr 10.0.12.2
  Outgoing interface list:
    Vlan10, Forward/Sparse, 00:14:22/00:02:41

(<span class="y">10.10.10.10</span>, 239.1.1.1), 00:09:40/00:02:55, flags: <span class="g">JT</span>
  Incoming interface: <span class="y">GigabitEthernet0/1</span>, RPF nbr 10.0.12.2
  Outgoing interface list:
    Vlan10, Forward/Sparse, 00:09:40/00:02:41

<span class="p">R1#</span> <span class="c">show ip rpf 10.10.10.10</span>
RPF information for ? (10.10.10.10)
  <span class="g">RPF interface: GigabitEthernet0/1</span>
  RPF neighbor: ? (10.0.12.2)
  RPF route/mask: 10.10.10.0/24
  RPF type: <span class="g">unicast (ospf 1)</span>
  Doing distance-preferred lookups across tables<span class="cur"></span></pre>
</div>
<p class="term-cap"><b>Three commands, in this order, every time.</b> <code>show ip igmp groups</code> answers "is anyone asking?". <code>show ip mroute</code> answers "did a tree get built, and which way does it point?". <code>show ip rpf</code> answers "does the router agree with me about where the source is?". Most multicast faults are diagnosed by the first command that comes back empty.</p>

### Reading the mroute flags

They are not decoration — each one tells you which mechanism is in play.

| Flag | On the entry | Meaning |
|---|---|---|
| **S** | `(*, G)` | Sparse mode |
| **J** | `(*, G)` | **Joined the SPT** — traffic exceeded the threshold, an `(S, G)` is being built |
| **T** | `(S, G)` | **Traffic is arriving on the shortest path tree**, not via the RP |
| **C** | either | A **connected** member — a directly attached host joined via IGMP |
| **L** | either | The **local** router itself is a member |
| **P** | either | **Pruned** — no outgoing interfaces. An empty OIL is normal; it is also what a broken tree looks like |
| **F** | `(S, G)` | **Register** — this is the first-hop router encapsulating to the RP |

<div class="note">
<b>The one to look at first</b>
An <b>empty outgoing interface list</b> with flag <code>P</code> means the router has the traffic and nowhere to send it. If a receiver is complaining, that is your fault domain: either IGMP never registered the join on this router, or a downstream router never sent a PIM join. Work one hop closer to the receiver and run the same three commands again.
</div>

---

## What goes wrong

**Nothing arrives, and no errors anywhere.** Check `ip multicast-routing` is on globally. It is missing more often than anything else, and it fails silently.

**The tree builds but the incoming interface is wrong or Null.** RPF failure. Run `show ip rpf <source>` and compare with reality. Asymmetric routing or a tunnel is the usual cause; `ip mroute` is the override.

**Works for a minute, then stops.** No IGMP querier on the VLAN. Add `ip igmp snooping querier` or put PIM on the SVI.

**Works for one receiver, not for a second one on another switch.** Snooping on the intermediate switch has not learned the second port, usually because report suppression meant it never saw a report from it. Check the snooping group table, not the router.

**Every PC in the VLAN gets the stream, subscribed or not.** Snooping is off, or the switch has fallen back to flooding because it saw an unknown multicast MAC.

**A group works and the one next to it does not.** Check the low 23 bits. Two groups on the same MAC, one snooping entry, and the behaviour depends on which one was learned.

**Source-specific joins are ignored.** The segment negotiated down to IGMPv2. `show ip igmp interface` shows the version actually in use, not the one you configured.

---

<div class="lab">
<div class="lab-head">Lab — build multicast from nothing, then break it on purpose</div>
<div class="lab-body">

<div class="lab-target"><b>Target</b>
Get a real multicast stream from a source to a receiver across two routers; prove with a capture that the join, the query and the leave are exactly the packets described above; watch the RPF check drop a packet that unicast would have happily forwarded; and then produce — deliberately — the four failures you will actually meet in production, so that you recognise each one from its symptom alone.</div>

**Topology.** `SOURCE` (10.10.10.10) — `R2` — `R1` — `SW` — `PC` (10.1.10.50). VLAN 10 is 10.1.10.0/24 with R1's SVI at .1. OSPF everywhere. Group `239.1.1.1`. Anything will do for the traffic: VLC streaming to 239.1.1.1:5004, `iperf -u -c 239.1.1.1`, or just `ping 239.1.1.1 repeat 1000` from the source router once a receiver has joined.

<p class="lab-step"><span class="n">1</span>Prove the "before" state</p>

With unicast routing converged and **no multicast configuration at all**, start the stream from the source. On R1:

```cisco
R1# show ip mroute
R1# show ip igmp groups
```

Both empty. Now join the group on the PC — on Linux `socat UDP4-RECV:5004,ip-add-membership=239.1.1.1:eth0 -`, on Windows just start VLC on the stream URL.

Still empty on R1, because `ip multicast-routing` is off.

<div class="lab-watch"><b>Things to notice</b>
Take a capture on the PC's switch port <em>now</em>. You will see the host's IGMP report going out perfectly correctly, every 60 seconds or so, being answered by nothing at all. The host has no idea anything is wrong — this is exactly what a real "multicast does not work" ticket looks like from the receiver's end, and it is why you always start at the router.</div>

<p class="lab-step"><span class="n">2</span>Turn it on, one layer at a time</p>

```cisco
! R1 and R2 — global
ip multicast-routing

! Every interface in the path, both routers
interface GigabitEthernet0/1
 ip pim sparse-mode
interface Vlan10
 ip pim sparse-mode

! An RP — anything, for now. Use R2's loopback.
ip pim rp-address 10.255.255.2
```

Add these **one command at a time**, re-running `show ip mroute` after each. Watch the `(*, G)` appear when PIM comes up on the receiver side, and the `(S, G)` appear when traffic starts flowing.

<div class="lab-watch"><b>Things to notice</b>
The order in which state appears tells you the mechanism. <code>(*, 239.1.1.1)</code> exists because a <em>receiver</em> asked — it points at the RP and has nothing to do with the source. <code>(10.10.10.10, 239.1.1.1)</code> appears only once real traffic arrives, and its <code>T</code> flag tells you the router has moved off the shared tree onto the shortest path. If you see the <code>(*, G)</code> and never the <code>(S, G)</code>, the receiver side is fine and your problem is upstream.</div>

<p class="lab-step"><span class="n">3</span>Capture the three packets that matter</p>

Mirror the PC's switch port to a machine running Wireshark. Filter `igmp`. Then, in order: join the group, wait ninety seconds, leave the group.

You should have captured a **report (0x16)** to 239.1.1.1, at least one **general query (0x11)** to 224.0.0.1, a **leave (0x17)** to 224.0.0.2, and a **group-specific query** to 239.1.1.1. Open each and confirm, by eye: `TTL = 1`, IP header length 24 bytes, and the Router Alert option present.

<div class="lab-watch"><b>Things to notice</b>
Time the gap between your leave and the stream actually stopping. It will be around three seconds, and you can now explain precisely which two timers produced that number. Then set <code>ip igmp last-member-query-count 1</code> and <code>ip igmp last-member-query-interval 100</code> (milliseconds) and measure it again.</div>

<p class="lab-step"><span class="n">4</span>Break RPF deliberately</p>

Add a second path between R1 and R2, and make unicast prefer the *other* one:

```cisco
! On R1 — force the unicast route to the source over the second link
interface GigabitEthernet0/2
 ip ospf cost 1
interface GigabitEthernet0/1
 ip ospf cost 500
```

The stream is still arriving on Gi0/1, because that is where the tree was built. Watch it die.

```cisco
R1# show ip rpf 10.10.10.10
R1# show ip mroute 239.1.1.1
```

<div class="lab-watch"><b>Things to notice</b>
Unicast to the source still works perfectly — ping it and see. Multicast is dead, with no log message, no interface error and no counter on any interface that says "dropped". This is the whole lesson of RPF: it is a silent check against a table that something else changed. Now fix it without touching OSPF:
<br><br><code>ip mroute 10.10.10.0 255.255.255.0 10.0.12.2</code>
<br><br>and confirm with <code>show ip rpf</code> that the RPF type has changed from <code>unicast</code> to <code>static mroute</code>.</div>

<p class="lab-step"><span class="n">5</span>Kill the querier</p>

Put a second PC on a **Layer 2 only** VLAN — a VLAN with no SVI, or an SVI without PIM — and join the group from it.

It will work. Wait three minutes.

<div class="lab-issues"><b>Possible issues</b>
<ul>
<li><b>It never worked at all</b> — the stream has to be able to reach that VLAN in the first place. This test needs the group already flowing on a trunk into the switch.</li>
<li><b>It does not stop</b> — another device on the VLAN is querying. Find it with <code>show ip igmp snooping querier</code>; some switches enable it by default, and some hypervisor virtual switches do too.</li>
<li><b>It stops instantly rather than after minutes</b> — snooping fast-leave is on. Turn it off for this test.</li>
</ul>
Then fix it with <code>ip igmp snooping querier</code> on the switch and watch the group reappear in <code>show ip igmp snooping groups</code>.</div>

<p class="lab-step"><span class="n">6</span>Prove the MAC collision</p>

Join `239.1.1.1` on the PC. Now, from anywhere on the segment, send traffic to **`224.1.1.1`** — a completely different group the PC never joined.

Capture on the PC with a filter of `eth.dst == 01:00:5e:01:01:01`, and count.

<div class="lab-watch"><b>Things to notice</b>
The frames for the group nobody joined arrive at the NIC and are accepted at Layer 2, because the MAC filter cannot tell the two groups apart. They are discarded by the IP stack — so <code>ip.dst == 224.1.1.1</code> shows them in the capture while the application never sees a byte. You have just measured the cost of a bad group plan: CPU spent on a stream the host is not subscribed to.</div>

<p class="lab-step"><span class="n">7</span>Turn on IGMPv3 and watch the wire change</p>

```cisco
interface Vlan10
 ip igmp version 3
```

Re-join from the PC and capture again.

<div class="lab-watch"><b>Things to notice</b>
Three things change at once: reports now go to <b>224.0.0.22</b> instead of the group, the type is <b>0x22</b>, and — the one people miss — <b>report suppression is gone</b>, so with two receivers on the segment you now see two reports where before you saw one. Leave one router on the segment at version 2 and watch everything drop back; <code>show ip igmp interface Vlan10</code> tells you the truth about which version is actually running.</div>

<div class="lab-earned"><b>What you earned</b>
You can now find a multicast fault in the right order instead of guessing: is anyone asking (<code>show ip igmp groups</code>), did a tree get built and which way does it point (<code>show ip mroute</code>), and does the router agree about where the source is (<code>show ip rpf</code>). You have seen the RPF check drop traffic that unicast forwards happily, so asymmetric routing will be on your list of suspects from the start. You know that "works for a minute then stops" means querier, and that "everyone gets it" means snooping — two symptoms that now map straight to two one-line fixes. And you can read an IGMP packet off the wire well enough to tell which version a segment has actually negotiated, rather than which one the configuration claims.</div>

</div>
</div>

---

## Test yourself

<div class="qz">
<p class="qz-q"><span class="qz-num">Q1</span>A host sends an IGMPv2 membership report. What is the destination IP address?</p>
<label class="qz-opt"><input type="radio" name="mc1"><span>224.0.0.1 — all hosts</span><em class="qz-fb qz-bad">That is where the router sends general <em>queries</em>, not where reports go.</em></label>
<label class="qz-opt"><input type="radio" name="mc1"><span>The group being joined — 239.1.1.1</span><em class="qz-fb qz-good">Correct, and it is the reason report suppression works: every other member of the group hears the report and stays quiet.</em></label>
<label class="qz-opt"><input type="radio" name="mc1"><span>224.0.0.2 — all routers</span><em class="qz-fb qz-bad">That is where an IGMPv2 <em>leave</em> goes, deliberately, so the other members do not hear it.</em></label>
<label class="qz-opt"><input type="radio" name="mc1"><span>224.0.0.22</span><em class="qz-fb qz-bad">That is IGMPv<em>3</em>. In v3 all reports go there — one of the clearest ways to tell the versions apart in a capture.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q2</span>Unicast routing to the source is working. Multicast for that source is not, and no interface shows any errors. What do you check first?</p>
<label class="qz-opt"><input type="radio" name="mc2"><span>The RPF interface against the unicast route to the source</span><em class="qz-fb qz-good">Right. Silent drops with healthy unicast is the signature of an RPF failure — the packet is arriving on an interface that is not the reverse path. <code>show ip rpf &lt;source&gt;</code>.</em></label>
<label class="qz-opt"><input type="radio" name="mc2"><span>The TTL on the multicast packets</span><em class="qz-fb qz-bad">Worth knowing about for scoped boundaries, but it would not produce this symptom with unicast healthy.</em></label>
<label class="qz-opt"><input type="radio" name="mc2"><span>The IGMP version on the receiver</span><em class="qz-fb qz-bad">A version mismatch breaks source filtering, not plain forwarding — and you would see the join in <code>show ip igmp groups</code>.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q3</span>Groups 239.1.1.1 and 224.1.1.1 are in use on the same VLAN. What is true?</p>
<label class="qz-opt"><input type="radio" name="mc3"><span>They map to the same destination MAC, so NICs joined to one will accept frames for the other</span><em class="qz-fb qz-good">Exactly — only the low 23 bits survive into the MAC, so 0x81 and 0x01 in the second octet both become 0x01. The IP stack discards them, but the CPU has already paid.</em></label>
<label class="qz-opt"><input type="radio" name="mc3"><span>Nothing — different groups always have different MACs</span><em class="qz-fb qz-bad">28 bits of group space compressed into 23 bits of MAC means 32 groups share every multicast MAC address.</em></label>
<label class="qz-opt"><input type="radio" name="mc3"><span>One of them will fail to join</span><em class="qz-fb qz-bad">Both join fine. The collision is a filtering inefficiency, not a failure.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q4</span>A stream on a Layer-2-only VLAN works for about three minutes after every reload, then stops. Cause?</p>
<label class="qz-opt"><input type="radio" name="mc4"><span>No IGMP querier on the VLAN, so snooping ages the group out</span><em class="qz-fb qz-good">Correct — and the fix is one line, <code>ip igmp snooping querier</code>. The "works then stops" timing is the giveaway: it is a timeout, not a configuration error.</em></label>
<label class="qz-opt"><input type="radio" name="mc4"><span>The source stopped sending</span><em class="qz-fb qz-bad">Then it would fail for everyone everywhere, not just on this VLAN.</em></label>
<label class="qz-opt"><input type="radio" name="mc4"><span>RPF failure</span><em class="qz-fb qz-bad">RPF failures are immediate and total. They do not wait three minutes.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q5</span>On one segment, which device becomes the IGMP querier and which becomes the PIM DR?</p>
<label class="qz-opt"><input type="radio" name="mc5"><span>Both the highest IP address</span><em class="qz-fb qz-bad">Half right — that is the PIM DR. The IGMP querier goes the other way.</em></label>
<label class="qz-opt"><input type="radio" name="mc5"><span>Querier = lowest IP, DR = highest IP</span><em class="qz-fb qz-good">Correct, and it means the two roles routinely land on different routers on the same segment. Worth checking whenever behaviour on a segment does not match the router you assumed was in charge.</em></label>
<label class="qz-opt"><input type="radio" name="mc5"><span>Both the lowest IP address</span><em class="qz-fb qz-bad">That is the querier rule applied to both. PIM elects the highest.</em></label>
</div>

---

## References

- **RFC 9776** — Internet Group Management Protocol, Version 3. Published March 2025; **obsoletes RFC 3376**, and is the current IGMPv3 specification. Message types, the six record types and all default timers are taken from it.
- **RFC 2236** — IGMPv2. Where Leave Group and the querier election come from.
- **RFC 1112** — Host Extensions for IP Multicasting. IGMPv1, and the original MAC mapping rule.
- **RFC 4541** — Considerations for IGMP and MLD Snooping Switches.
- **RFC 2365** — Administratively Scoped IP Multicast (`239.0.0.0/8`).
- **RFC 3180** — GLOP Addressing in 233/8.
- Cisco — [IP Multicast Technology Overview](https://www.cisco.com/c/en/us/td/docs/routers/ios-xe/ip-multicast/ip-multicast/m_imc_tech_oview-0.html)
- Cisco — [IGMP Snooping Configuration Guide](https://www.cisco.com/c/en/us/td/docs/routers/ios/config/17-x/ip-multicast/b-ip-multicast/m_imc_igmp_snoop.html)
- Cisco — [IP Multicast Quick-Start Configuration Guide](https://www.cisco.com/c/en/us/support/docs/ip/ip-multicast/9356-48.html)

---

*Next: [PIM sparse mode, the RP, SPT switchover and SSM](/blog/pim-sparse-mode-rp-spt-switchover-ssm-explained) — how the tree is actually built between routers.*

*Part of the [CCNA, ENCOR and ENARSI topic-by-topic study guide](/blog/ccna-ccnp-study-guide).*
