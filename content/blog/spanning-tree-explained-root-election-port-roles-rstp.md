---
title: "Spanning Tree From Scratch: Why It Exists, How the Root Is Elected, and What RSTP Changed"
excerpt: "A redundant Layer 2 network melts itself in under a second without STP. Here is the loop that causes it, the three elections that stop it, the BPDU that carries the votes, and the guards that keep a good design from being ruined by one cable."
date: "2026-09-20"
tags: ["Spanning Tree", "STP", "RSTP", "MST", "Layer 2", "Switching", "CCNA", "ENCOR"]
draft: false
---

> **Blueprint:** CCNA 200-301 — 2.5 *Interpret basic operations of Rapid PVST+ Spanning Tree Protocol*. ENCOR 350-401 — 3.1.c *Configure and verify common Spanning Tree Protocols (RSTP, MST) and Spanning Tree enhancements such as root guard and BPDU guard*.

## Cheat sheet

| | |
|---|---|
| **The problem** | Ethernet frames have no TTL. A loop at Layer 2 never stops. |
| **The fix** | Block enough ports to leave exactly one active path between any two switches. |
| **Root bridge** | The switch everyone measures distance from. Lowest Bridge ID wins. |
| **Bridge ID** | 4-bit priority + 12-bit extended system ID (the VLAN) + 6-byte MAC. 8 bytes total. |
| **Default priority** | 32768. With VLAN 10, the BID priority field reads 32778. |
| **Root port** | On every non-root switch: the one port with the lowest cost back to the root. Exactly one. |
| **Designated port** | On every segment: the one port permitted to forward onto it. Exactly one. |
| **Blocking port** | Everything left over. Receives BPDUs, forwards nothing. |
| **Cost (long mode)** | 10 Gb = 2000, 1 Gb = 20000, 100 Mb = 200000. Short mode: 2, 4, 19. |
| **STP timers** | Hello 2s, Forward Delay 15s, Max Age 20s. 30–50 seconds to converge. |
| **RSTP** | 802.1w. Sub-second on point-to-point links. Proposal/agreement instead of timers. |
| **PortFast** | Skip listening and learning on an access port. Never on a switch link. |
| **BPDU Guard** | Receive a BPDU on a PortFast port → err-disable it. |
| **Root Guard** | Receive a *superior* BPDU on this port → root-inconsistent, stop forwarding. |
| **Loop Guard** | Stop receiving BPDUs on a non-designated port → loop-inconsistent, do not unblock. |

---

## Start with the thing that goes wrong

Every explanation of spanning tree should begin with the accident, because the protocol only makes sense once you have watched a network destroy itself.

Three switches, cabled in a triangle for redundancy. That is good design — any one cable can fail and everything still reaches everything. Now a PC sends a single broadcast frame. An ARP request, say. One frame.

A switch floods a broadcast out of every port except the one it arrived on. So SW1 floods to SW2 and SW3. SW2 floods what it received to SW3. SW3 floods what it received to SW2. Those copies arrive and get flooded again.

<figure class="fig">
<svg viewBox="0 0 640 260" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Three switches in a triangle with a broadcast frame multiplying around the loop">
  <style>
    .sw { fill:#17171A }
    .swt { fill:#FAF8F5; font-family:ui-sans-serif,system-ui; font-size:13px; font-weight:700 }
    .lk { stroke:#8A8A93; stroke-width:2 }
    .fr { fill:#D3002D }
    .lbl { fill:#5C5C64; font-family:ui-sans-serif,system-ui; font-size:11px }
    .big { fill:#D3002D; font-family:ui-sans-serif,system-ui; font-size:12px; font-weight:700 }
  </style>
  <line class="lk" x1="320" y1="62" x2="150" y2="190"/>
  <line class="lk" x1="320" y1="62" x2="490" y2="190"/>
  <line class="lk" x1="150" y1="190" x2="490" y2="190"/>
  <rect class="sw" x="270" y="38" width="100" height="34" rx="3"/>
  <text class="swt" x="320" y="60" text-anchor="middle">SW1</text>
  <rect class="sw" x="100" y="176" width="100" height="34" rx="3"/>
  <text class="swt" x="150" y="198" text-anchor="middle">SW2</text>
  <rect class="sw" x="440" y="176" width="100" height="34" rx="3"/>
  <text class="swt" x="490" y="198" text-anchor="middle">SW3</text>
  <circle class="fr" cx="240" cy="118" r="5"/><circle class="fr" cx="205" cy="145" r="5"/>
  <circle class="fr" cx="400" cy="118" r="5"/><circle class="fr" cx="435" cy="145" r="5"/>
  <circle class="fr" cx="270" cy="190" r="5"/><circle class="fr" cx="320" cy="190" r="5"/><circle class="fr" cx="370" cy="190" r="5"/>
  <text class="lbl" x="320" y="232" text-anchor="middle">one broadcast in · copies multiply on every hop · nothing removes them</text>
  <text class="big" x="320" y="24" text-anchor="middle">BROADCAST STORM</text>
</svg>
<figcaption><b>Figure 1.</b> The frame has no hop count. Each lap around the triangle doubles the number of copies, and each copy is flooded again.</figcaption>
</figure>

Three things now happen, fast.

**The broadcast storm.** Copies double on every lap. Within a second the links are saturated. CPU on every switch goes to 100% because broadcasts are punted to the control plane.

**MAC table instability.** The PC's MAC arrives on port Gi0/1, then on Gi0/2, then Gi0/1 again, thousands of times a second. The MAC address table is rewritten constantly. Unicast forwarding stops working because the switch no longer knows where anything is.

**Duplicate frames.** Anything that does get delivered arrives many times. Applications see corrupted streams.

<div class="why">
<b>Why Ethernet cannot fix this itself</b>
An IPv4 header has a TTL field: every router decrements it and a packet that loops is eventually dropped at zero. The Ethernet header has no equivalent. There is no hop count, no age, nothing that lets a switch recognise a frame it has already seen. That single omission is the entire reason spanning tree exists. It is not a performance feature. It is a safety interlock.
</div>

---

## The idea in one sentence

> Build a physical topology with as many redundant links as you like, then have the switches agree on which ports to switch off so that exactly one active path remains between any two points.

The switched network is a graph. Spanning tree reduces that graph to a **tree** — a shape with no cycles by definition — while keeping every switch connected. The blocked links are not wasted: they are standing by, and when an active link fails, spanning tree recalculates and brings one of them up.

<figure class="fig">
<svg viewBox="0 0 640 250" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The same triangle with one port blocked, leaving a loop-free tree">
  <style>
    .sw { fill:#17171A } .rootsw { fill:#D3002D }
    .swt { fill:#FAF8F5; font-family:ui-sans-serif,system-ui; font-size:13px; font-weight:700 }
    .lk { stroke:#1f9d6b; stroke-width:3 }
    .blk { stroke:#B5B5BC; stroke-width:2; stroke-dasharray:6 5 }
    .pt { fill:#232327; font-family:ui-sans-serif,system-ui; font-size:10px; font-weight:700 }
    .lbl { fill:#5C5C64; font-family:ui-sans-serif,system-ui; font-size:11px }
    .x { fill:#D3002D; font-family:ui-sans-serif,system-ui; font-size:15px; font-weight:800 }
  </style>
  <line class="lk" x1="320" y1="62" x2="150" y2="180"/>
  <line class="lk" x1="320" y1="62" x2="490" y2="180"/>
  <line class="blk" x1="200" y1="190" x2="440" y2="190"/>
  <rect class="rootsw" x="262" y="38" width="116" height="34" rx="3"/>
  <text class="swt" x="320" y="60" text-anchor="middle">SW1 · ROOT</text>
  <rect class="sw" x="100" y="173" width="100" height="34" rx="3"/>
  <text class="swt" x="150" y="195" text-anchor="middle">SW2</text>
  <rect class="sw" x="440" y="173" width="100" height="34" rx="3"/>
  <text class="swt" x="490" y="195" text-anchor="middle">SW3</text>
  <text class="pt" x="248" y="100">DP</text><text class="pt" x="378" y="100">DP</text>
  <text class="pt" x="196" y="152">RP</text><text class="pt" x="424" y="152">RP</text>
  <text class="pt" x="212" y="182">DP</text><text class="pt" x="414" y="182">BLK</text>
  <text class="x" x="320" y="196" text-anchor="middle">✕</text>
  <text class="lbl" x="320" y="232" text-anchor="middle">every switch reaches the root · no cycle · the dashed link waits in reserve</text>
</svg>
<figcaption><b>Figure 2.</b> SW3&rsquo;s port toward SW2 is blocked. Physically still a triangle; logically a tree. Break either green link and the blocked port comes up.</figcaption>
</figure>

---

## How the switches agree: the BPDU

Switches vote using **Bridge Protocol Data Units**, sent every 2 seconds to the multicast MAC `01:80:C2:00:00:00`. A BPDU is not user traffic and is never forwarded — each switch consumes it, thinks, and originates its own.

The fields that decide everything:

```text
 Protocol ID   (2 bytes)  always 0x0000
 Version       (1 byte)   0x00 = STP, 0x02 = RSTP, 0x03 = MST
 BPDU Type     (1 byte)   0x00 = Configuration, 0x80 = TCN
 Flags         (1 byte)   TC, Proposal, Port Role, Learning, Forwarding, Agreement, TCA
 Root ID       (8 bytes)  ← who I think the root is      [priority + ext sys ID + MAC]
 Root Path Cost(4 bytes)  ← what it costs ME to reach it
 Bridge ID     (8 bytes)  ← who I am                     [priority + ext sys ID + MAC]
 Port ID       (2 bytes)  ← which of my ports this left  [priority + port number]
 Message Age   (2 bytes)
 Max Age       (2 bytes)  20s
 Hello Time    (2 bytes)  2s
 Forward Delay (2 bytes)  15s
```

Four of those fields — **Root ID, Root Path Cost, Bridge ID, Port ID** — are the entire decision procedure. A switch compares an incoming BPDU against its own, in that order, and the first difference settles it. Cisco documentation calls a BPDU that wins this comparison **superior**.

Here is one off the wire. These are real bytes — the lengths and encodings are correct, so you can paste the hex into Wireshark's *Import from Hex Dump* and it will decode.

<div class="cap">
<div class="cap-head">Capture · trunk port, VLAN 10 <span class="cap-filter">stp</span></div>
<div class="cap-tree"><pre>&#9662; IEEE 802.3 Ethernet
    <span class="f">Destination:</span> <span class="v">Spanning-tree-(for-bridges)_00 (<mark>01:80:c2:00:00:00</mark>)</span>
    <span class="f">Length:</span> <span class="v">38</span>                       &#8592; a length, not an EtherType
&#9662; Logical-Link Control
    <span class="f">DSAP / SSAP:</span> <span class="v">STP (0x42) / STP (0x42)</span>
&#9662; Spanning Tree Protocol
    <span class="f">Protocol Identifier:</span> <span class="v">STP (0x0000)</span>
    <span class="f">Protocol Version:</span> <span class="v"><mark>Rapid STP (2)</mark></span>
    <span class="f">BPDU Type:</span> <span class="v">Rapid/Multiple STP (0x02)</span>
  &#9662; <span class="f">BPDU flags:</span> <span class="v"><mark>0x3c</mark></span>
      <span class="f">..1. ....</span> = <span class="v">Forwarding: Yes</span>
      <span class="f">...1 ....</span> = <span class="v">Learning: Yes</span>
      <span class="f">.... 11..</span> = <span class="v">Port Role: Designated (3)</span>
    <span class="f">Root Identifier:</span> <span class="v"><mark>24586</mark> / 10 / 00:1a:2b:00:00:01</span>
    <span class="f">Root Path Cost:</span> <span class="v"><mark>20000</mark></span>
    <span class="f">Bridge Identifier:</span> <span class="v">32778 / 10 / 00:33:44:55:66:02</span>
    <span class="f">Port identifier:</span> <span class="v">0x8002</span>
    <span class="f">Message Age / Max Age:</span> <span class="v">0 / 20</span>
    <span class="f">Hello Time / Forward Delay:</span> <span class="v">2 / 15</span></pre></div>
<div class="cap-hex"><pre>0000  <mark>01 80 c2 00 00 00</mark> 00 33  44 55 66 02 00 26 <mark>42 42</mark>   .......3DUf..&amp;BB
0010  03 00 00 <mark>02</mark> 00 <mark>3c</mark> <mark>80 0a</mark>  00 1a 2b 00 00 01 00 00   .....&lt;....+.....
0020  <mark>4e 20</mark> 80 0a 00 33 44 55  66 02 80 02 00 00 14 00   N ...3DUf.......
0030  02 00 0f 00 00 00 00 00  00 00 00 00               ............</pre></div>
<div class="cap-note"><b>Everything the article has described so far is in these 60 bytes.</b> <code>42 42</code> — LLC, not an EtherType, because a BPDU is an 802.3 frame. <code>02</code> — protocol version 2, so this is RSTP. <code>3c</code> — the flags: designated, learning, forwarding. <code><mark>80 0a</mark></code> — <b>32778, appearing twice</b>: once in the Root ID and once in this switch's own Bridge ID. <code>4e 20</code> — 20000, one gigabit hop. And the timers at the end, <code>14 00 / 02 00 / 0f 00</code>, are 20, 2 and 15 seconds in units of 1/256 s.
<br><br><b>Read the flags byte and you know the port's role without any CLI access:</b> <code>0x3C</code> designated and forwarding, <code>0x04</code> alternate and blocking, <code>0x3E</code> a proposal, <code>0x78</code> the agreement that answers it, <code>0x3D</code> a topology change.</div>
</div>

### The Bridge ID, and why yours says 32778

The 8-byte Bridge ID used to be a 2-byte priority plus a 6-byte MAC. Per-VLAN spanning tree needed a separate root per VLAN, so the priority field was split:

```text
┌────────────────┬──────────────────────┬──────────────────────────┐
│  Priority      │  Extended System ID  │  MAC address             │
│  4 bits        │  12 bits             │  48 bits                 │
│  0–61440       │  = the VLAN number   │  the switch's own        │
│  steps of 4096 │                      │                          │
└────────────────┴──────────────────────┴──────────────────────────┘
```

Priority is therefore only settable in multiples of 4096: 0, 4096, 8192 … 61440. The VLAN is added on top. Default 32768 in VLAN 10 displays as **32778**. That is not a typo in your output; it is 32768 + 10.

<div class="note">
<b>Read this off a live switch</b>
<code>show spanning-tree vlan 10</code> prints the local Bridge ID and the root&rsquo;s. If the two are identical, this switch <em>is</em> the root for VLAN 10 — the line <code>This bridge is the root</code> appears above it.
</div>

---

## The three elections

Everything spanning tree does reduces to three decisions, made in this order. Get the order right and the rest follows.

<div class="walk">
<div class="walk-head">Three elections, in order <span class="walk-hint">click a step</span></div>
<div class="walk-tabs">
  <input type="radio" name="stpw" id="sw1" checked><label for="sw1"><span class="step-n">1</span>Everyone claims it</label>
  <input type="radio" name="stpw" id="sw2"><label for="sw2"><span class="step-n">2</span>Root elected</label>
  <input type="radio" name="stpw" id="sw3"><label for="sw3"><span class="step-n">3</span>Root ports</label>
  <input type="radio" name="stpw" id="sw4"><label for="sw4"><span class="step-n">4</span>Designated ports</label>
  <input type="radio" name="stpw" id="sw5"><label for="sw5"><span class="step-n">5</span>The rest block</label>
</div>
<div class="walk-panels">
<div class="walk-panel">
<svg viewBox="0 0 640 250" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Every switch boots claiming to be the root bridge and announces it in its own BPDUs">
  <style>.sw{fill:#17171A}.swt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:12px;font-weight:700}.lk{stroke:#8A8A93;stroke-width:2}.s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.claim{font-family:ui-sans-serif,system-ui;font-size:10.5px;font-weight:700;fill:#B26014}.k{font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700;fill:#8A8A93}</style>
  <line class="lk" x1="320" y1="72" x2="160" y2="180"/>
  <line class="lk" x1="320" y1="72" x2="480" y2="180"/>
  <line class="lk" x1="160" y1="190" x2="480" y2="190"/>
  <rect class="sw" x="266" y="38" width="108" height="34" rx="3"/><text class="swt" x="320" y="60" text-anchor="middle">SW1</text>
  <rect class="sw" x="106" y="174" width="108" height="34" rx="3"/><text class="swt" x="160" y="196" text-anchor="middle">SW2</text>
  <rect class="sw" x="426" y="174" width="108" height="34" rx="3"/><text class="swt" x="480" y="196" text-anchor="middle">SW3</text>
  <text class="claim blink" x="320" y="28" text-anchor="middle">&#8220;I am root&#8221;</text>
  <text class="claim" x="160" y="228" text-anchor="middle">&#8220;I am root&#8221;</text>
  <text class="claim" x="480" y="228" text-anchor="middle">&#8220;I am root&#8221;</text>
  <text class="s" x="320" y="92" text-anchor="middle">24576.10 · 001a.2b00.0001</text>
  <text class="s" x="160" y="244" text-anchor="middle">32778 · 0033.4455.6602</text>
  <text class="s" x="480" y="244" text-anchor="middle">32778 · 0077.8899.aa03</text>
  <rect x="108" y="112" width="424" height="20" fill="#fff"/>
  <text class="k" x="320" y="126" text-anchor="middle">every switch sends BPDUs with its own Bridge ID in the Root ID field</text>
</svg>
<p class="walk-say"><span class="walk-title">Everybody starts by claiming the crown</span>
A switch that has just booted has heard nothing, so it believes it is the root and says so — its own Bridge ID goes into both the <b>Root ID</b> and the <b>Bridge ID</b> fields of every BPDU it sends. Then it listens, and the moment it hears a BPDU with a lower Root ID it stops claiming and starts relaying that one instead.
<br><br>Nothing is configured here yet except SW1's priority, which somebody set to 24576 deliberately. That single decision is about to settle the whole topology.</p>
</div>
<div class="walk-panel">
<svg viewBox="0 0 640 250" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The switch with the lowest bridge ID becomes root and the others relay its BPDUs">
  <style>.sw{fill:#17171A}.root{fill:#D3002D}.swt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:12px;font-weight:700}.lk{stroke:#8A8A93;stroke-width:2}.s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.k{font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}</style>
  <line class="lk" x1="320" y1="72" x2="160" y2="180"/>
  <line class="lk" x1="320" y1="72" x2="480" y2="180"/>
  <line class="lk" x1="160" y1="190" x2="480" y2="190"/>
  <rect class="root" x="266" y="38" width="108" height="34" rx="3"/><text class="swt" x="320" y="60" text-anchor="middle">SW1 — ROOT</text>
  <rect class="sw" x="106" y="174" width="108" height="34" rx="3"/><text class="swt" x="160" y="196" text-anchor="middle">SW2</text>
  <rect class="sw" x="426" y="174" width="108" height="34" rx="3"/><text class="swt" x="480" y="196" text-anchor="middle">SW3</text>
  <circle r="4.5" fill="#D3002D"><animateMotion dur="1.9s" repeatCount="indefinite" path="M 314 72 L 160 174"/></circle>
  <circle r="4.5" fill="#D3002D"><animateMotion dur="1.9s" repeatCount="indefinite" path="M 326 72 L 480 174"/></circle>
  <text class="s" x="320" y="92" text-anchor="middle">24576.10 — lowest Bridge ID in the network</text>
  <rect x="132" y="112" width="376" height="20" fill="#fff"/>
  <text class="k" x="320" y="126" text-anchor="middle" fill="#B80027">Priority is compared first. Only on a tie does the MAC address decide.</text>
  <text class="s" x="160" y="228" text-anchor="middle">relays SW1's Root ID</text>
  <text class="s" x="480" y="228" text-anchor="middle">relays SW1's Root ID</text>
  <text class="s" x="320" y="238" text-anchor="middle">Every BPDU in the network now carries Root ID = 24586.001a.2b00.0001.</text>
</svg>
<p class="walk-say"><span class="walk-title">Election one — the root bridge, network-wide</span>
Lowest Bridge ID wins: priority first, MAC address only as a tie-break. SW1 wins on priority and every other switch stops advertising itself as root. From now on <b>every BPDU anywhere in this VLAN carries SW1's ID in the Root field</b> — that shared reference point is what makes the next two elections possible.
<br><br>Leave the priorities at default and the winner is whichever switch has the lowest MAC, which usually means <b>the oldest</b>. That is the argument for setting it by hand.</p>
</div>
<div class="walk-panel">
<svg viewBox="0 0 640 250" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Each non root switch picks its single lowest cost port back to the root as its root port">
  <style>.sw{fill:#17171A}.root{fill:#D3002D}.swt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:12px;font-weight:700}.lk{stroke:#8A8A93;stroke-width:2}.rp{stroke:#1f9d6b;stroke-width:3.5}.s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.k{font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700;fill:#0f6b47}.tag{font-family:ui-sans-serif,system-ui;font-size:10px;font-weight:700;fill:#0f6b47}</style>
  <line class="rp" x1="320" y1="72" x2="160" y2="180"/>
  <line class="rp" x1="320" y1="72" x2="480" y2="180"/>
  <line class="lk" x1="160" y1="190" x2="480" y2="190"/>
  <rect class="root" x="266" y="38" width="108" height="34" rx="3"/><text class="swt" x="320" y="60" text-anchor="middle">SW1 — ROOT</text>
  <rect class="sw" x="106" y="174" width="108" height="34" rx="3"/><text class="swt" x="160" y="196" text-anchor="middle">SW2</text>
  <rect class="sw" x="426" y="174" width="108" height="34" rx="3"/><text class="swt" x="480" y="196" text-anchor="middle">SW3</text>
  <circle cx="186" cy="162" r="11" fill="#1f9d6b"/><text class="swt" x="186" y="166" text-anchor="middle" font-size="9">RP</text>
  <circle cx="454" cy="162" r="11" fill="#1f9d6b"/><text class="swt" x="454" y="166" text-anchor="middle" font-size="9">RP</text>
  <text class="s" x="196" y="112" text-anchor="middle">cost 20000</text>
  <text class="s" x="444" y="112" text-anchor="middle">cost 20000</text>
  <text class="s" x="320" y="182" text-anchor="middle">the long way round: 20000 + 20000 = 40000</text>
  <text class="k" x="320" y="228" text-anchor="middle">Exactly one root port per non-root switch. The root bridge has none.</text>
  <text class="s" x="320" y="244" text-anchor="middle">Tie-break order: lowest cost, then lowest sender Bridge ID, then lowest sender Port ID.</text>
</svg>
<p class="walk-say"><span class="walk-title">Election two — one root port per switch</span>
Every non-root switch picks the <b>single</b> port with the lowest accumulated cost back to the root. For SW2 the direct link costs 20000; the path via SW3 costs 40000. No contest.
<br><br>Cost accumulates on <b>ingress</b>: a switch adds the cost of the port the BPDU arrived on to the Root Path Cost already in it. That is why a slow link anywhere on a path penalises everything behind it, and why <code>spanning-tree cost</code> on one interface is such a precise tool for steering the topology.</p>
</div>
<div class="walk-panel">
<svg viewBox="0 0 640 250" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="On the segment between the two non root switches one port is elected designated and is allowed to forward">
  <style>.sw{fill:#17171A}.root{fill:#D3002D}.swt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:12px;font-weight:700}.lk{stroke:#8A8A93;stroke-width:2}.rp{stroke:#1f9d6b;stroke-width:3.5}.s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.k{font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700;fill:#2b5ab8}</style>
  <line class="rp" x1="320" y1="72" x2="160" y2="180"/>
  <line class="rp" x1="320" y1="72" x2="480" y2="180"/>
  <line class="lk" x1="160" y1="190" x2="480" y2="190" stroke="#4b7bec" stroke-width="3"/>
  <rect class="root" x="266" y="38" width="108" height="34" rx="3"/><text class="swt" x="320" y="60" text-anchor="middle">SW1 — ROOT</text>
  <rect class="sw" x="106" y="174" width="108" height="34" rx="3"/><text class="swt" x="160" y="196" text-anchor="middle">SW2</text>
  <rect class="sw" x="426" y="174" width="108" height="34" rx="3"/><text class="swt" x="480" y="196" text-anchor="middle">SW3</text>
  <circle cx="186" cy="162" r="11" fill="#1f9d6b"/><text class="swt" x="186" y="166" text-anchor="middle" font-size="9">RP</text>
  <circle cx="454" cy="162" r="11" fill="#1f9d6b"/><text class="swt" x="454" y="166" text-anchor="middle" font-size="9">RP</text>
  <circle cx="228" cy="190" r="11" fill="#4b7bec"/><text class="swt" x="228" y="194" text-anchor="middle" font-size="9">DP</text>
  <text class="k" x="320" y="146" text-anchor="middle">Both switches have cost 20000 to the root — a tie.</text>
  <text class="s" x="320" y="164" text-anchor="middle">Tie broken by the lower Bridge ID: 0033.4455.6602 beats 0077.8899.aa03, so SW2 wins the segment.</text>
  <text class="s" x="320" y="230" text-anchor="middle">One designated port per <tspan font-weight="700">segment</tspan> — including every access port, where the switch is</text>
  <text class="s" x="320" y="244" text-anchor="middle">always designated because the PC never competes.</text>
</svg>
<p class="walk-say"><span class="walk-title">Election three — one designated port per segment</span>
Every link in the network needs exactly one port allowed to forward onto it. The winner is the port on the switch with the lowest cost to the root; equal costs are broken by the lower Bridge ID, and then by the lower Port ID.
<br><br>The root bridge is a special case worth remembering: <b>every port on the root is designated</b>, because its cost to the root is zero and nothing can beat that. That is a quick sanity check — if a port on the switch you believe is root shows as anything other than <code>Desg</code>, it is not the root.</p>
</div>
<div class="walk-panel">
<svg viewBox="0 0 640 250" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The one remaining port blocks leaving a loop free tree with traffic flowing">
  <style>.sw{fill:#17171A}.root{fill:#D3002D}.swt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:12px;font-weight:700}.rp{stroke:#1f9d6b;stroke-width:3.5}.blk{stroke:#D3002D;stroke-width:2.5;stroke-dasharray:6 5}.s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.k{font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700;fill:#0f6b47}</style>
  <line class="rp" x1="320" y1="72" x2="160" y2="180"/>
  <line class="rp" x1="320" y1="72" x2="480" y2="180"/>
  <line class="blk" x1="160" y1="190" x2="480" y2="190"/>
  <rect class="root" x="266" y="38" width="108" height="34" rx="3"/><text class="swt" x="320" y="60" text-anchor="middle">SW1 — ROOT</text>
  <rect class="sw" x="106" y="174" width="108" height="34" rx="3"/><text class="swt" x="160" y="196" text-anchor="middle">SW2</text>
  <rect class="sw" x="426" y="174" width="108" height="34" rx="3"/><text class="swt" x="480" y="196" text-anchor="middle">SW3</text>
  <circle cx="412" cy="190" r="11" fill="#D3002D"/><text class="swt" x="412" y="194" text-anchor="middle" font-size="9">ALT</text>
  <circle r="4.5" fill="#1f9d6b"><animateMotion dur="2s" repeatCount="indefinite" path="M 160 174 L 320 72 L 480 174"/></circle>
  <text class="s" x="320" y="216" text-anchor="middle" fill="#D3002D">SW3's port here is Alternate — receiving BPDUs, forwarding nothing</text>
  <text class="k" x="320" y="240" text-anchor="middle">One active path between any two switches. The cable is still there, ready.</text>
</svg>
<p class="walk-say"><span class="walk-title">Everything left over blocks</span>
A port that is neither a root port nor a designated port <b>blocks</b>. It still receives and processes BPDUs — that is how it knows to stay blocked, and how it notices when to stop.
<br><br>In RSTP this port is called <b>Alternate</b> and it has already computed that it is an alternative path to the root. When SW3's root port fails, that port is promoted <b>immediately</b>, with no listening or learning delay, because the decision was made in advance. That pre-computation is most of what makes RSTP fast.</p>
</div>
</div>
</div>

### 1. One root bridge, network-wide

Every switch boots believing it is the root and says so. It listens. The lowest Bridge ID wins — first on priority, and if priority ties, on the lowest MAC address.

<div class="warn">
<b>The default is almost always wrong</b>
Leave every switch at 32768 and the election falls through to MAC address. The lowest MAC belongs to the oldest switch, which is usually the least powerful box in the least appropriate place — often an access switch under somebody&rsquo;s desk. Your entire traffic pattern then bends around it. <b>Always set the root manually.</b>
</div>

### 2. One root port per non-root switch

Each non-root switch picks the single port with the best path back to the root. Tie-breakers, in strict order:

1. **Lowest cumulative root path cost.** Cost is per-link, based on bandwidth, and accumulates as a BPDU travels — each switch adds the cost of the port it *received* on.
2. **Lowest sender Bridge ID.** Two equal-cost paths via different neighbours → prefer the neighbour with the lower BID.
3. **Lowest sender Port ID.** Two links to the *same* neighbour → prefer the one leaving the neighbour's lower port ID (priority, then port number).
4. **Lowest local Port ID.** Practically never reached.

<table>
<thead><tr><th>Link speed</th><th>Cost (short / 16-bit)</th><th>Cost (long / 32-bit)</th></tr></thead>
<tbody>
<tr><td>10 Mb</td><td>100</td><td>2,000,000</td></tr>
<tr><td>100 Mb</td><td>19</td><td>200,000</td></tr>
<tr><td>1 Gb</td><td>4</td><td>20,000</td></tr>
<tr><td>10 Gb</td><td>2</td><td>2,000</td></tr>
<tr><td>100 Gb</td><td>1</td><td>200</td></tr>
</tbody>
</table>

Short mode is the default on most platforms and **cannot tell 10 Gb from 100 Gb apart meaningfully** — 2 versus 1, and everything above 10 Gb clamps toward 1. On a modern network turn on long mode with `spanning-tree pathcost method long`, consistently, everywhere.

### 3. One designated port per segment

Every link segment gets exactly one port allowed to forward onto it — the one on the switch with the lowest cost to the root, tie-broken by BID then Port ID. Every port on the root bridge is designated, always, by definition: its cost to the root is zero.

**Anything that is neither a root port nor a designated port is blocked.** That is the whole algorithm.

<details class="reveal">
<summary>Work one out before you read the answer</summary>

SW1 is root. SW2 and SW3 each have a 1 Gb link to SW1 and a 1 Gb link to each other. Long mode. Which port blocks, and on which switch?

Both SW2 and SW3 reach the root at cost 20000 via their direct link — those become root ports. On the SW2–SW3 segment both have equal cost (20000) to the root, so the tie breaks on **lowest Bridge ID**. If SW2 has the lower MAC, SW2's port is designated and **SW3's port toward SW2 blocks**.

Change one variable — make SW3's direct link 100 Mb — and SW3's cost via SW2 (20000 + 20000 = 40000) beats its direct path (200000). SW3's root port moves to the link facing SW2, and the *direct* link to SW1 blocks instead. Cost beats topology intuition every time.
</details>

---

## Port states, and the 30 seconds everybody complains about

Classic 802.1D moves a port through states on timers:

<figure class="fig">
<svg viewBox="0 0 640 150" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="STP port state progression from blocking to forwarding">
  <style>
    .bx { fill:#fff; stroke:#232327; stroke-width:1.5 }
    .bxf { fill:#1f9d6b; stroke:#1f9d6b }
    .bxb { fill:#D3002D; stroke:#D3002D }
    .t { font-family:ui-sans-serif,system-ui; font-size:12px; font-weight:700; fill:#17171A }
    .tw { font-family:ui-sans-serif,system-ui; font-size:12px; font-weight:700; fill:#fff }
    .s { font-family:ui-sans-serif,system-ui; font-size:10px; fill:#5C5C64 }
    .ar { stroke:#8A8A93; stroke-width:1.5; marker-end:url(#a) }
  </style>
  <defs><marker id="a" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#8A8A93"/></marker></defs>
  <rect class="bx bxb" x="14" y="40" width="108" height="38" rx="3"/>
  <text class="tw" x="68" y="64" text-anchor="middle">Blocking</text>
  <text class="s" x="68" y="96" text-anchor="middle">20s max age</text>
  <text class="s" x="68" y="110" text-anchor="middle">listens only</text>
  <line class="ar" x1="124" y1="59" x2="160" y2="59"/>
  <rect class="bx" x="164" y="40" width="108" height="38" rx="3"/>
  <text class="t" x="218" y="64" text-anchor="middle">Listening</text>
  <text class="s" x="218" y="96" text-anchor="middle">15s fwd delay</text>
  <text class="s" x="218" y="110" text-anchor="middle">elects, no MAC</text>
  <line class="ar" x1="274" y1="59" x2="310" y2="59"/>
  <rect class="bx" x="314" y="40" width="108" height="38" rx="3"/>
  <text class="t" x="368" y="64" text-anchor="middle">Learning</text>
  <text class="s" x="368" y="96" text-anchor="middle">15s fwd delay</text>
  <text class="s" x="368" y="110" text-anchor="middle">builds MAC table</text>
  <line class="ar" x1="424" y1="59" x2="460" y2="59"/>
  <rect class="bx bxf" x="464" y="40" width="120" height="38" rx="3"/>
  <text class="tw" x="524" y="64" text-anchor="middle">Forwarding</text>
  <text class="s" x="524" y="96" text-anchor="middle">passes traffic</text>
  <text class="s" x="524" y="18" text-anchor="middle">30–50 seconds total</text>
</svg>
<figcaption><b>Figure 3.</b> Listening and learning each burn a full forward delay. This is why a PC that boots faster than 30 seconds used to fail DHCP on a freshly-linked port.</figcaption>
</figure>

The delay exists because 802.1D had no way to *ask* a neighbour whether it was safe to forward. It waited long enough for news to propagate and hoped. RSTP fixed exactly that.

---

## What RSTP actually changed

802.1w — Rapid Spanning Tree, and on Cisco gear **Rapid PVST+** — keeps the same three elections and the same BPDU fields. What changed is how quickly a port can be trusted.

**Port states collapse to three.** Discarding, Learning, Forwarding. Blocking and listening were both "not forwarding, not learning", so they merged.

**Roles became explicit and are carried in the BPDU flags.** Root, Designated, and two new backup roles:

- **Alternate port** — an alternative path to the root. Blocked, but ready. If the root port fails it is promoted *immediately*, no timers.
- **Backup port** — a second connection to the same segment, usually via a hub. Rare.

**Proposal and agreement replaces waiting.** On a point-to-point link, a switch wanting to forward sends a BPDU with the Proposal flag. The neighbour blocks all its non-edge designated ports (the "sync"), replies with Agreement, and both sides go forwarding. This is a handshake, not a timer, and it completes in milliseconds.

**Every switch originates BPDUs.** In 802.1D only the root generated them and others relayed. In RSTP each switch sends its own every hello, so losing three in a row (6 seconds) declares the neighbour gone — far faster than a 20-second max age.

<div class="note">
<b>Link type matters more than people realise</b>
The proposal/agreement handshake only runs on <code>point-to-point</code> links, which RSTP infers from <b>full duplex</b>. A link forced to half duplex is treated as <code>shared</code> and falls back to the slow 802.1D timer behaviour. A duplex mismatch therefore causes slow convergence as well as errors — and the two symptoms are easy to blame on each other.
</div>

### The flavours you will meet

| | Instances | Notes |
|---|---|---|
| **PVST+** | One per VLAN | Cisco. Classic timers. Per-VLAN root tuning, heavy CPU at scale. |
| **Rapid PVST+** | One per VLAN | Cisco default on Catalyst. Fast, but 500 VLANs = 500 instances. |
| **MST (802.1s)** | One per *group* of VLANs | Map many VLANs to a handful of instances. ENCOR 3.1.c. Region name, revision and VLAN-to-instance map must match **exactly** on every switch or the region splits. |

---

## Configuration

Set the root deliberately. Never let the election pick for you.

```cisco
! --- Distribution switch A: root for the odd VLANs, backup for the even ---
spanning-tree mode rapid-pvst
spanning-tree pathcost method long
spanning-tree vlan 10,30 root primary
spanning-tree vlan 20,40 root secondary

! --- Distribution switch B: the mirror image ---
spanning-tree mode rapid-pvst
spanning-tree pathcost method long
spanning-tree vlan 20,40 root primary
spanning-tree vlan 10,30 root secondary
```

<div class="cmd">
<div class="cmd-line"><span class="t">spanning-tree mode</span> <span class="opt">rapid-pvst</span>
<span class="t">spanning-tree pathcost method long</span>
<span class="t">spanning-tree vlan</span> <span class="opt">10,30</span> <span class="t">priority</span> <span class="opt">24576</span>
<span class="t">spanning-tree vlan</span> <span class="opt">20,40</span> <span class="t">priority</span> <span class="opt">28672</span></div>
<dl class="cmd-parts">
<div class="is-key"><dt>mode rapid-pvst</dt><dd>802.1w per VLAN, and the default on Catalyst. The alternative <code>pvst</code> is classic 802.1D timers — <b>30 to 50 seconds of convergence instead of under a second</b>. If <code>show spanning-tree</code> prints <code>protocol ieee</code>, you are on the slow one.</dd></div>
<div><dt>pathcost method long</dt><dd>Switches cost from the old 16-bit scale to the 32-bit one. Short mode gives 10 Gb and 100 Gb <b>the same cost of 2</b>, so it cannot tell your fastest links apart. Set it, and set it <b>everywhere</b> — a network with both methods in use computes inconsistent trees.</dd></div>
<div class="is-key"><dt>vlan 10,30<br>priority 24576</dt><dd>Lower wins, and it must be a multiple of <b>4096</b> because only the top four bits belong to you. The VLAN number is added by the extended system ID, which is why this displays as <b>24586</b> for VLAN 10 rather than 24576.</dd></div>
<div><dt>vlan 20,40<br>priority 28672</dt><dd>The same switch is deliberately <em>second</em> choice for the other half of the VLANs. Configure the mirror image on the peer and both uplinks carry traffic instead of one sitting idle — the standard campus pattern, and the reason per-VLAN spanning tree exists.</dd></div>
<div><dt>root primary<br><span class="opt">(the alternative)</span></dt><dd><code>spanning-tree vlan 10 root primary</code> is a <b>macro, not a feature</b>. It reads the current root's priority once and picks a number low enough to win. It does not keep watching — bring in a lower-priority switch tomorrow and it takes over. Use it to discover a sensible value, then write that number down explicitly.</dd></div>
</dl>
</div>

Splitting odd and even VLANs across two distribution switches means both uplinks carry traffic instead of one sitting idle. That is the standard campus pattern, and it is the reason per-VLAN spanning tree exists at all.

### The edge, and the guards

<div class="cmd">
<div class="cmd-line">interface range GigabitEthernet1/0/1 - 46
 <span class="t">spanning-tree portfast</span>
 <span class="t">spanning-tree bpduguard enable</span>
!
interface range TenGigabitEthernet1/1/1 - 8
 <span class="t">spanning-tree guard root</span>
!
<span class="t">spanning-tree loopguard default</span>
<span class="t">udld enable</span></div>
<dl class="cmd-parts">
<div class="is-key"><dt>portfast</dt><dd>Skips listening and learning so the port forwards <b>immediately</b>. Purely a convenience for end devices — a PC that boots in 10 seconds used to miss DHCP entirely while the port sat in listening. <b>Never on a link to another switch</b>: the port forwards before any election has happened, and if that link closes a loop you get a storm.</dd></div>
<div class="is-key"><dt>bpduguard enable</dt><dd>The safety catch that makes PortFast survivable. A BPDU should never arrive on an access port, so if one does, <b>err-disable the port instantly</b>. This is what stops somebody's desk switch winning the root election. Always pair it with PortFast; the pair is a single idea.</dd></div>
<div><dt>guard root</dt><dd>On a port where the root must never be, <b>a superior BPDU is refused</b> rather than obeyed — the port goes <code>root-inconsistent</code> and stops forwarding until the superior BPDUs stop. Put it on distribution ports facing the access layer. Root guard protects the <em>topology</em>; BPDU guard protects the <em>port</em>.</dd></div>
<div class="is-key"><dt>loopguard default</dt><dd>For the nastiest failure there is. A blocked port that <b>stops receiving</b> BPDUs normally assumes the path is gone and starts forwarding — creating the loop STP exists to prevent. Loop guard puts it into <code>loop-inconsistent</code> instead. The classic cause is a fibre pair with one broken strand, where the link stays up.</dd></div>
<div><dt>udld enable</dt><dd>Attacks the same unidirectional failure one layer down, by checking that a neighbour echoes back what it hears. <b>Run both</b> — loop guard catches the STP consequence, UDLD catches the physical cause, and neither covers every case alone.</dd></div>
<div><dt><span class="opt">portfast default</span></dt><dd>The global forms <code>spanning-tree portfast default</code> and <code>spanning-tree portfast bpduguard default</code> apply to every access port on the box, so a new port is safe before anyone configures it. This is the setting worth putting in your build template.</dd></div>
</dl>
</div>

### Reading the output

<div class="term">
<div class="term-bar"><span class="term-dots"><i></i><i></i><i></i></span>SW2 — a healthy access switch, read top to bottom</div>
<pre><span class="p">SW2#</span> <span class="c">show spanning-tree vlan 10</span>

VLAN0010
  Spanning tree enabled protocol <span class="g">rstp</span>              <span class="o">&lt;- the mode actually running</span>
  Root ID    Priority    <span class="y">24586</span>
             Address     0062.ec9d.c580
             Cost        <span class="y">20000</span>                       <span class="o">&lt;- one gigabit hop from the root</span>
             Port        1 (GigabitEthernet1/0/1)
             Hello Time  2 sec  Max Age 20 sec  Forward Delay 15 sec

  Bridge ID  Priority    <span class="y">32778</span>  (priority 32768 sys-id-ext 10)
             Address     70df.2f3c.1a00           <span class="o">&lt;- different from Root ID, so this is not the root</span>

Interface        Role Sts Cost      Prio.Nbr Type
---------------- ---- --- --------- -------- ----------------
Gi1/0/1          <span class="g">Root FWD</span> 20000     128.1    P2p
Gi1/0/2          <span class="y">Altn BLK</span> 20000     128.2    P2p
Gi1/0/10         <span class="g">Desg FWD</span> 20000     128.10   P2p <span class="g">Edge</span><span class="cur"></span></pre>
</div>
<p class="term-cap"><b>One Root, one Altn, the rest Desg.</b> That shape is what a healthy access switch looks like, and you can check it in two seconds. <code>Altn BLK</code> is not a fault — it is the redundant path, correctly held in reserve and ready to promote without a timer.</p>

Read it in this order, every time:

1. **`protocol rstp`** — the mode actually running. If this says `ieee` you are on classic PVST+ and convergence will be slow.
2. **Root ID vs Bridge ID** — different numbers, so this is not the root. Root priority 24586 = 24576 + VLAN 10, so somebody set it deliberately. Good.
3. **`Cost 20000`** — one gigabit hop from the root.
4. **Roles** — one `Root`, one `Altn` (the redundant path, correctly blocked), one `Desg Edge` (a PortFast access port). Exactly what a healthy access switch looks like.
5. **`Type P2p`** — full duplex, so rapid convergence is available. `Shr` here would mean half duplex and slow behaviour.

---

## What breaks in real networks

**Somebody plugs a cheap switch into a wall port.** It has a factory MAC lower than anything in your data centre, wins the root election, and the campus reroutes through a desk. BPDU Guard on every access port prevents this absolutely — the port err-disables the instant a BPDU arrives.

**Unidirectional fibre failure.** A fibre pair where one strand breaks: the link stays up, but one side stops receiving BPDUs. A blocked port that stops hearing BPDUs assumes the path is gone and unblocks — creating the loop STP existed to prevent. Loop Guard covers this by putting the port into `loop-inconsistent` instead of forwarding. UDLD attacks the same problem at Layer 1. Run both.

**PortFast on a switch-to-switch link.** The port forwards instantly, before any election. If that link closes a loop you get a storm. PortFast belongs on ports where an end device lives, and nowhere else.

**MST region mismatch.** Region name, revision number and the VLAN-to-instance map must be byte-identical. One switch with a different revision number silently forms its own region and the boundary behaves as a single instance — traffic engineering you designed quietly stops applying.

**Constant topology changes.** `show spanning-tree detail | include changes` counts them. A flapping access port without PortFast generates a TC on every transition; each TC ages the MAC table down to 15 seconds and forces relearning. Symptom: unexplained unicast flooding and intermittent slowness.

<div class="real">
<b>In the real world</b>
The topology-change counter is the most under-used command in switching. <code>show spanning-tree detail | include occurred|changes</code> gives you a count and a timestamp per VLAN. On a healthy campus that number moves a handful of times a week. If it is climbing every few minutes, something is flapping — and the symptom users report is never &#8220;spanning tree&#8221;. It is <b>intermittent slowness</b>, because each topology change flushes MAC tables and the network spends the next few seconds flooding unicast to every port. Find the port with <code>show spanning-tree detail | include from</code>, which names the interface that caused the last change, and the odds are very high it is an access port without PortFast where somebody is switching a laptop on and off.
</div>

---

<div class="lab">
<div class="lab-head">Lab — elect a root, steer it with cost, and trip every guard</div>
<div class="lab-body">

<div class="lab-target"><b>Target</b>
Watch the default election pick the wrong switch and understand exactly why; take control with priority and then steer the topology a second way with cost; measure the difference between PVST+ and Rapid PVST+ with a stopwatch rather than taking it on faith; read a BPDU off the wire and find the four fields that decided everything; and trip BPDU guard, root guard and loop guard deliberately so you recognise each from its log message.</div>

**Topology.** Three switches cabled in a triangle — SW1&ndash;SW2, SW2&ndash;SW3, SW3&ndash;SW1. One PC on SW2 and one on SW3. Any of CML, EVE-NG, GNS3 or Packet Tracer will do. A capture machine on a SPAN destination if you have one.

<p class="lab-step"><span class="n">1</span>Let the default election embarrass you</p>

Leave every priority at default.

```cisco
SW1# show spanning-tree vlan 1
SW2# show spanning-tree vlan 1
SW3# show spanning-tree vlan 1
```

<div class="lab-watch"><b>Things to notice</b>
Write down all three MAC addresses and confirm the lowest won. Then ask the question that matters: <b>is that switch a sensible root?</b> Almost certainly not — it is simply the one with the lowest MAC, which in a real network usually means the oldest box, often an access switch in a cupboard. Every packet between VLANs is now routed through it. Nobody chose this.</div>

<p class="lab-step"><span class="n">2</span>Take control, and predict before you look</p>

```cisco
! SW1
spanning-tree vlan 1 priority 24576
```

Before running any show command, <b>draw the tree on paper</b>: mark the root port on SW2 and SW3, then work out which end of the SW2&ndash;SW3 link blocks and why.

```cisco
SW2# show spanning-tree vlan 1
SW3# show spanning-tree vlan 1
```

<div class="lab-watch"><b>Things to notice</b>
The blocked port is on the switch with the <b>higher Bridge ID</b>, because the costs tie at one hop each. If your drawing said otherwise, work out which tie-break you skipped — this is the exact reasoning the exam tests and the exact reasoning you need at 2am. Also note the displayed priority: <b>24577</b> for VLAN 1, not 24576, because the extended system ID adds the VLAN.</div>

<p class="lab-step"><span class="n">3</span>Steer it a different way, with cost</p>

```cisco
! SW3, on the interface facing SW1
interface <link-to-SW1>
 spanning-tree cost 200000
```

<div class="lab-watch"><b>Things to notice</b>
SW3's root port moves to the SW2-facing link, and SW3 now reaches the root <em>through</em> SW2. You have changed the topology without touching a single priority. This is the tool for the situation where the root is right but the path is not — a backup link that should never be preferred, or a slow WAN circuit that the cost table rates too generously.
<br><br>Check <code>show spanning-tree vlan 1</code> on SW3 and confirm the Root Path Cost is now 40000, not 20000: it added its own ingress cost to what SW2 advertised.</div>

<p class="lab-step"><span class="n">4</span>Time the difference, do not assume it</p>

Start a continuous ping between the two PCs, then shut the active link and count lost packets. Restore, then:

```cisco
! All three switches
spanning-tree mode pvst
```

Repeat exactly the same failure.

<div class="lab-watch"><b>Things to notice</b>
Rapid PVST+ should cost you a handful of pings. Classic PVST+ will cost you <b>roughly thirty seconds</b> — listening and learning, one forward delay each. Write both numbers down; they are the justification you will give somebody for changing a production switch's mode, and a measurement is far more persuasive than a specification.
<br><br>Then force one link to <code>duplex half</code> and repeat on rapid-pvst. Convergence collapses back to the slow behaviour, because RSTP infers <code>point-to-point</code> from full duplex and a half-duplex link is treated as shared. A duplex mismatch is a convergence bug as well as an error-counter bug.</div>

<p class="lab-step"><span class="n">5</span>Read a BPDU yourself</p>

Mirror a trunk to a capture machine and filter on `stp`. Open one frame and find, by eye: Root ID, Root Path Cost, Bridge ID, Port ID.

<div class="lab-watch"><b>Things to notice</b>
Confirm the Root ID priority has the VLAN added to it, and that <b>every switch in the network advertises the same Root ID</b> — that is the shared reference the whole protocol depends on. Then compare the Root Path Cost in BPDUs leaving SW2 and SW3 and you can read the tree straight off the wire.
<br><br>Now look at the <b>flags byte</b>. Change a port's role and watch it change: <code>0x3C</code> designated and forwarding, <code>0x04</code> alternate. Shut a link and catch the <code>0x3E</code> proposal and the <code>0x78</code> agreement that answer each other in milliseconds — that handshake is the whole of RSTP's speed advantage, visible in two packets.</div>

<p class="lab-step"><span class="n">6</span>Trip all three guards</p>

Do each, read the exact log line, then recover.

1. **BPDU guard.** Put `spanning-tree portfast` and `spanning-tree bpduguard enable` on SW2's PC port, then move that cable to SW3. Expect `%SPANTREE-2-BLOCK_BPDUGUARD` and an err-disabled port within a second. Recover with `shutdown` / `no shutdown`.
2. **Root guard.** Put `spanning-tree guard root` on SW2's port toward SW3, then set SW3's priority to 0 so it sends superior BPDUs. Expect `%SPANTREE-2-ROOTGUARD_BLOCK` and `root-inconsistent`. Recover by raising SW3's priority again — the port clears itself.
3. **Loop guard.** Enable `spanning-tree loopguard default`, then filter BPDUs into SW3's alternate port with `spanning-tree bpdufilter enable` on the far end to simulate a one-way failure. Expect `loop-inconsistent` rather than the port unblocking.

<div class="lab-issues"><b>Possible issues</b>
<ul>
<li><b>BPDU guard does not fire</b> — the port is not actually PortFast. Confirm with <code>show spanning-tree interface &lt;x&gt; detail</code>; the word <code>edge</code> must appear.</li>
<li><b>Root guard does nothing</b> — the BPDU has to be genuinely <em>superior</em>. Priority 0 on SW3 guarantees it; a small change may not.</li>
<li><b>The port recovers on its own and you miss it</b> — <code>errdisable recovery</code> may be enabled. Check <code>show errdisable recovery</code> and disable it for this test so the port stays down while you look at it.</li>
<li><b>Loop guard will not trigger</b> — it only acts on a port that <em>was</em> receiving BPDUs and then stopped. Let the topology settle fully before filtering.</li>
</ul>
Read all three log messages side by side. They name the feature and the interface, and knowing which of the three you are looking at is most of the diagnosis.</div>

<p class="lab-step"><span class="n">7</span>Cause a storm, once, where it cannot hurt anyone</p>

In a simulator only, with no connection to anything real:

```cisco
! All three switches
no spanning-tree vlan 1
```

Send a single broadcast ping, then watch `show processes cpu sorted` and the interface counters.

<div class="lab-watch"><b>Things to notice</b>
One frame. CPU to 100%, interface counters climbing without limit, and the switches stop responding to the console. Nothing stops it because <b>an Ethernet frame has no TTL</b> — the single fact the entire protocol exists to work around. Re-enable spanning tree to recover.
<br><br>Do this once, deliberately, in a lab. It is the difference between knowing that a Layer 2 loop is bad and understanding why a broadcast storm takes out a building in seconds rather than degrading gracefully.</div>

<div class="lab-earned"><b>What you earned</b>
You can predict a topology on paper from Bridge IDs and costs and be right, which means you can also spot when a live network disagrees with what it should be. You have two measured convergence numbers of your own rather than a specification, and you know a duplex mismatch silently costs you the fast one. You can read a port's role off a BPDU's flags byte without CLI access to the switch. And you have seen all three guards fire with your own log messages, so the next time one appears in somebody's syslog you will know within seconds whether it is protecting a port, a topology, or a fibre with one broken strand.</div>

</div>
</div>

---

## Test yourself

<div class="qz">
<p class="qz-q"><span class="qz-num">Q1</span>A switch shows <code>Bridge ID Priority 32778</code> for VLAN 10. What is the configured priority?</p>
<label class="qz-opt"><input type="radio" name="stpq1"><span>32778 — that is the value that was set</span><em class="qz-fb qz-bad">The displayed value includes the VLAN. The configured priority is a multiple of 4096.</em></label>
<label class="qz-opt"><input type="radio" name="stpq1"><span>32768, with the VLAN ID of 10 added by the extended system ID</span><em class="qz-fb qz-good">Right. 32768 + 10. Priority is settable only in steps of 4096; the 12-bit extended system ID carries the VLAN.</em></label>
<label class="qz-opt"><input type="radio" name="stpq1"><span>10 — the VLAN number is the priority</span><em class="qz-fb qz-bad">The VLAN is added to the priority, not used as it.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q2</span>Two switches both reach the root at cost 20000 over the segment between them. What decides which port is designated?</p>
<label class="qz-opt"><input type="radio" name="stpq2"><span>The lower sender Port ID</span><em class="qz-fb qz-bad">Port ID is checked, but only after Bridge ID.</em></label>
<label class="qz-opt"><input type="radio" name="stpq2"><span>The lower Bridge ID of the two switches</span><em class="qz-fb qz-good">Correct. Cost first, then sender Bridge ID, then sender Port ID, then local Port ID.</em></label>
<label class="qz-opt"><input type="radio" name="stpq2"><span>Whichever port came up first</span><em class="qz-fb qz-bad">Spanning tree is deterministic — nothing depends on ordering or timing.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q3</span>A blocked port on a fibre link stops receiving BPDUs because one strand broke. Which feature stops the loop?</p>
<label class="qz-opt"><input type="radio" name="stpq3"><span>BPDU Guard</span><em class="qz-fb qz-bad">BPDU Guard acts when a BPDU <em>arrives</em> on a PortFast port. Here the problem is BPDUs stopping.</em></label>
<label class="qz-opt"><input type="radio" name="stpq3"><span>Root Guard</span><em class="qz-fb qz-bad">Root Guard acts on a <em>superior</em> BPDU arriving, to protect root placement.</em></label>
<label class="qz-opt"><input type="radio" name="stpq3"><span>Loop Guard</span><em class="qz-fb qz-good">Yes. Loop Guard puts a non-designated port that stops hearing BPDUs into loop-inconsistent rather than letting it unblock. UDLD solves the same failure at Layer 1.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q4</span><code>show spanning-tree</code> reports a port as <code>Type Shr</code> on a switch-to-switch link. What should you check?</p>
<label class="qz-opt"><input type="radio" name="stpq4"><span>Duplex — RSTP infers point-to-point from full duplex</span><em class="qz-fb qz-good">Exactly. Half duplex means shared, which disables proposal/agreement and falls back to timers. Check for a duplex mismatch.</em></label>
<label class="qz-opt"><input type="radio" name="stpq4"><span>The VLAN allowed list on the trunk</span><em class="qz-fb qz-bad">Allowed VLANs do not affect link type.</em></label>
<label class="qz-opt"><input type="radio" name="stpq4"><span>Nothing — Shr is normal between switches</span><em class="qz-fb qz-bad">It is not. A modern switch-to-switch link should read P2p.</em></label>
</div>

---

## References

- **IEEE 802.1D-2004** — Media Access Control (MAC) Bridges. The base standard; 802.1w was folded into it.
- **IEEE 802.1w** — Rapid Reconfiguration of Spanning Tree.
- **IEEE 802.1s** — Multiple Spanning Trees, now part of 802.1Q.
- Cisco — [Understanding Rapid Spanning Tree Protocol (802.1w)](https://www.cisco.com/c/en/us/support/docs/lan-switching/spanning-tree-protocol/24062-146.html)
- Cisco — [Understanding and Configuring Spanning Tree Protocol (STP) on Catalyst Switches](https://www.cisco.com/c/en/us/support/docs/lan-switching/spanning-tree-protocol/5234-5.html)
- Cisco — [Spanning Tree PortFast, BPDU Guard, Root Guard, Loop Guard and UDLD](https://www.cisco.com/c/en/us/support/docs/lan-switching/spanning-tree-protocol/10556-16.html)

---

*Part of the [CCNA, ENCOR and ENARSI topic-by-topic study guide](/blog/ccna-ccnp-study-guide) — every blueprint topic, with a lab for each.*
