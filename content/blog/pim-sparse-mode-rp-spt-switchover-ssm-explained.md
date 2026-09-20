---
title: "Multicast, Part 2: PIM Sparse Mode, the RP, SPT Switchover, SSM and Bidir"
excerpt: "IGMP gets a host onto the local router. PIM is how the rest of the network finds the source — and it does it with a rendezvous point that every receiver knows about, a unicast tunnel that lasts a few milliseconds, and a hand-off onto the shortest path that most engineers never actually watch happen. Step through the whole sequence packet by packet, then take the RP apart: static, Auto-RP, BSR, anycast with MSDP, and the two designs that delete it entirely."
date: "2026-09-20"
tags: ["Multicast", "PIM", "SSM", "MSDP", "Rendezvous Point", "Routing", "ENCOR", "CCNP"]
draft: false
---

> **Blueprint:** ENCOR 350-401 — 3.3.d *Describe multicast protocols, such as RPF check, PIM SM, IGMP v2/v3, SSM, bidir, and MSDP*. Part two of two. [Part one](/blog/multicast-explained-addressing-igmp-and-rpf) covers addressing, IGMP and the RPF check, and assumes nothing.

## Cheat sheet

| | |
|---|---|
| **IP protocol** | 103 · all PIM routers `224.0.0.13` · TTL 1 |
| **Hello** | Type 0 — every **30 s**, holdtime **105 s** (3.5 ×) |
| **Register** | Type 1 — **unicast**, first-hop DR → RP, carries the whole data packet |
| **Register-Stop** | Type 2 — **unicast**, RP → DR, "stop tunnelling, I have it natively" |
| **Join/Prune** | Type 3 — hop by hop, holdtime **210 s**, refreshed every **60 s** |
| **Bootstrap** | Type 4 — BSR, RFC 5059 |
| **Assert** | Type 5 — two routers forwarding onto one LAN. Lowest AD, then lowest metric, then **highest IP** |
| **DR election** | **Highest priority** (default 1), tie broken by **highest IP** |
| **Auto-RP** | Announce `224.0.1.39` · Discovery `224.0.1.40` — **Cisco only** |
| **SSM range** | `232.0.0.0/8` — no RP at all, requires IGMPv3 |
| **MSDP** | **TCP 639**, SA messages between RPs |
| **`ip pim spt-threshold`** | Default **0 kbps** — move to the source tree on the first packet |

**The one idea.** A receiver's router has no idea where the source is. So everybody agrees in advance on a meeting place — the **rendezvous point** — and joins towards *that*. The source registers with the same RP. The two halves meet, traffic flows, and then almost immediately the network **abandons the RP** and rebuilds the path directly between source and receiver. The RP is an introduction service, not a transit device.

---

## Why an RP has to exist

Part one ended with a router that knows a host wants `239.1.1.1`. Now what? It has to send a join somewhere, and "somewhere" is a problem: **the group address tells it nothing about where the traffic will come from**. `239.1.1.1` is not routable to a place. There is no entry for it in any routing table.

Dense mode solved this by flooding the traffic everywhere and waiting for routers to prune themselves off — which works, wastes the entire network for the first few seconds of every stream, and is rightly extinct.

Sparse mode solves it with a prior agreement: **one router in the domain is the rendezvous point for a group, and every router is told which one.** Receivers join toward the RP. Sources register with the RP. Neither needs to know anything about the other.

<figure class="fig">
<svg viewBox="0 0 640 250" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Receivers build a shared tree towards the rendezvous point while the source registers with it, and the two halves meet at the RP">
  <style>
    .n{fill:#17171A}.nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}
    .rp{fill:#8256d0}
    .j{stroke:#4b7bec;stroke-width:2.5;fill:none}.d{stroke:#1f9d6b;stroke-width:2.5;fill:none}
    .reg{stroke:#D3002D;stroke-width:2.5;fill:none;stroke-dasharray:5 4}
    .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}
    .k{font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}
  </style>
  <rect class="rp" x="272" y="18" width="96" height="34" rx="3"/><text class="nt" x="320" y="40" text-anchor="middle">RP</text>
  <text class="s" x="320" y="66" text-anchor="middle">10.255.255.1 — the agreed meeting place</text>
  <rect class="n" x="14" y="160" width="86" height="32" rx="3"/><text class="nt" x="57" y="181" text-anchor="middle">SOURCE</text>
  <rect class="n" x="150" y="160" width="60" height="32" rx="3"/><text class="nt" x="180" y="181" text-anchor="middle">DR</text>
  <rect class="n" x="430" y="160" width="66" height="32" rx="3"/><text class="nt" x="463" y="181" text-anchor="middle">R4</text>
  <rect class="n" x="546" y="160" width="80" height="32" rx="3"/><text class="nt" x="586" y="181" text-anchor="middle">RECEIVER</text>
  <line x1="100" y1="176" x2="150" y2="176" stroke="#8A8A93" stroke-width="1.5"/>
  <line x1="496" y1="176" x2="546" y2="176" stroke="#8A8A93" stroke-width="1.5"/>
  <path class="reg" d="M 180 160 C 180 100 240 60 272 44"/>
  <path class="j" d="M 463 160 C 463 100 400 60 368 44"/>
  <circle r="4.5" fill="#D3002D"><animateMotion dur="2.2s" repeatCount="indefinite" path="M 180 160 C 180 100 240 60 272 44"/></circle>
  <circle r="4.5" fill="#4b7bec"><animateMotion dur="2.2s" begin="0.4s" repeatCount="indefinite" path="M 463 160 C 463 100 400 60 368 44"/></circle>
  <text class="k" x="112" y="112" fill="#B80027">Register</text>
  <text class="s" x="112" y="126">unicast, to the RP</text>
  <text class="s" x="112" y="139">&#8220;a source exists&#8221;</text>
  <text class="k" x="470" y="112" fill="#2b5ab8">(*, G) Join</text>
  <text class="s" x="470" y="126">hop by hop, to the RP</text>
  <text class="s" x="470" y="139">&#8220;a receiver exists&#8221;</text>
  <text class="s" x="320" y="216" text-anchor="middle">Neither end knows the other exists. Both know the RP.</text>
  <text class="k" x="320" y="236" text-anchor="middle" fill="#0f6b47">That is the whole design — and the RP stops being used moments later.</text>
</svg>
<figcaption><b>Figure 1.</b> Two independent halves. Each is built by a device that knows only its own local fact and the address of the RP.</figcaption>
</figure>

<div class="why">
<b>Read the tree notation properly</b>
<code>(*, G)</code> — "any source, this group" — is the <b>shared tree</b>, rooted at the RP. It is built by <em>receivers</em>. <code>(S, G)</code> — "this exact source, this group" — is the <b>source tree</b> or <b>shortest path tree</b>, rooted at the source. It is built once somebody knows the source's address. A router holding both for the same group is not confused; it is mid-hand-off, and the flags tell you which one traffic is actually using.
</div>

---

## PIM neighbours first

Before any of it, PIM routers have to find each other. Hellos to `224.0.0.13`, every 30 seconds, holdtime 105.

<div class="term">
<div class="term-bar"><span class="term-dots"><i></i><i></i><i></i></span>R1 — who am I adjacent to, and who is in charge</div>
<pre><span class="p">R1#</span> <span class="c">show ip pim neighbor</span>
PIM Neighbor Table
Mode: B - Bidir Capable, DR - Designated Router, N - Default DR Priority,
      S - State Refresh Capable
Neighbor          Interface     Uptime/Expires    Ver   DR
Address                                                 Prio/Mode
10.0.12.2         Gi0/1         02:14:55/<span class="g">00:01:33</span>  v2    1 / S P G
10.1.10.3         Vlan10        02:14:51/00:01:41  v2    1 / <span class="y">DR</span> S P G

<span class="o">! Expires counts down from 105s. If it sits above 90 it was just refreshed;</span>
<span class="o">! if you catch it low and climbing back, hellos are being lost.</span>

<span class="p">R1#</span> <span class="c">show ip pim interface Vlan10</span>
Address          Interface    Ver/Mode    Nbr Count  Query Intvl  DR
10.1.10.1        Vlan10       v2/S        1          30           <span class="y">10.1.10.3</span><span class="cur"></span></pre>
</div>
<p class="term-cap"><b>Two elections on one wire, running opposite rules.</b> The PIM <b>DR</b> here is <code>10.1.10.3</code> — the <b>highest</b> IP address, because both have the default priority of 1. The IGMP <b>querier</b> on the same VLAN is the <b>lowest</b>. On a segment with two routers they land on different boxes by default, so "which router is doing the work?" has two answers depending on which protocol you mean.</p>

<div class="warn">
<b>What the DR actually does</b>
On the <b>source</b> side, the DR is the router that sends the PIM Register — so if it cannot reach the RP, the source never registers, no matter how healthy the other router on the segment is. On the <b>receiver</b> side, the DR is the router that acts on IGMP and sends the join upstream. Both are single points of failure you elected by accident. Set <code>ip pim dr-priority</code> deliberately rather than letting the highest IP address decide.
</div>

---

## The whole sequence, step by step

This is the part that is genuinely hard to hold in your head, because the path the traffic takes **changes twice** in the first second. Step through it.

<div class="walk">
<div class="walk-head">PIM sparse mode — source to receiver, start to finish <span class="walk-hint">click a step</span></div>
<div class="walk-tabs">
  <input type="radio" name="pimwalk" id="pw1" checked><label for="pw1"><span class="step-n">1</span>Idle</label>
  <input type="radio" name="pimwalk" id="pw2"><label for="pw2"><span class="step-n">2</span>Shared tree</label>
  <input type="radio" name="pimwalk" id="pw3"><label for="pw3"><span class="step-n">3</span>Register</label>
  <input type="radio" name="pimwalk" id="pw4"><label for="pw4"><span class="step-n">4</span>RP joins source</label>
  <input type="radio" name="pimwalk" id="pw5"><label for="pw5"><span class="step-n">5</span>Register-Stop</label>
  <input type="radio" name="pimwalk" id="pw6"><label for="pw6"><span class="step-n">6</span>SPT switchover</label>
  <input type="radio" name="pimwalk" id="pw7"><label for="pw7"><span class="step-n">7</span>Prune the RP off</label>
</div>
<div class="walk-panels">
<div class="walk-panel">
<svg viewBox="0 0 640 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="All routers know the RP address but no state exists for the group">
  <style>.n{fill:#17171A}.rp{fill:#8256d0}.nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.l{stroke:#8A8A93;stroke-width:1.5}.s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.k{font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700;fill:#8A8A93}</style>
  <rect class="rp" x="278" y="20" width="84" height="30" rx="3"/><text class="nt" x="320" y="40" text-anchor="middle">RP</text>
  <rect class="n" x="14" y="120" width="80" height="30" rx="3"/><text class="nt" x="54" y="140" text-anchor="middle">SOURCE</text>
  <rect class="n" x="140" y="120" width="56" height="30" rx="3"/><text class="nt" x="168" y="140" text-anchor="middle">R1</text>
  <rect class="n" x="440" y="120" width="56" height="30" rx="3"/><text class="nt" x="468" y="140" text-anchor="middle">R4</text>
  <rect class="n" x="548" y="120" width="78" height="30" rx="3"/><text class="nt" x="587" y="140" text-anchor="middle">RECEIVER</text>
  <line class="l" x1="94" y1="135" x2="140" y2="135"/>
  <line class="l" x1="196" y1="135" x2="440" y2="135" stroke-dasharray="3 4"/>
  <line class="l" x1="496" y1="135" x2="548" y2="135"/>
  <line class="l" x1="168" y1="120" x2="290" y2="50" stroke-dasharray="3 4"/>
  <line class="l" x1="468" y1="120" x2="352" y2="50" stroke-dasharray="3 4"/>
  <text class="k" x="320" y="88" text-anchor="middle">every router knows: rp-address 10.255.255.1</text>
  <text class="s" x="320" y="176" text-anchor="middle">No mroute state anywhere. The source is not sending, or is sending into a void. Nobody has asked.</text>
</svg>
<p class="walk-say"><span class="walk-title">Agreement, and nothing else</span>
Every PIM router in the domain has been told the same RP address — by hand, by Auto-RP or by BSR. That is the only shared knowledge in the system. <code>show ip mroute</code> is empty on all of them.</p>
</div>
<div class="walk-panel">
<svg viewBox="0 0 640 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The receiver's router sends a star comma G join hop by hop towards the RP, building the shared tree">
  <style>.n{fill:#17171A}.rp{fill:#8256d0}.nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.l{stroke:#8A8A93;stroke-width:1.5}.j{stroke:#4b7bec;stroke-width:3;fill:none}.s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.k{font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700;fill:#2b5ab8}</style>
  <rect class="rp" x="278" y="20" width="84" height="30" rx="3"/><text class="nt" x="320" y="40" text-anchor="middle">RP</text>
  <rect class="n" x="14" y="120" width="80" height="30" rx="3"/><text class="nt" x="54" y="140" text-anchor="middle">SOURCE</text>
  <rect class="n" x="140" y="120" width="56" height="30" rx="3"/><text class="nt" x="168" y="140" text-anchor="middle">R1</text>
  <rect class="n" x="440" y="120" width="56" height="30" rx="3"/><text class="nt" x="468" y="140" text-anchor="middle">R4</text>
  <rect class="n" x="548" y="120" width="78" height="30" rx="3"/><text class="nt" x="587" y="140" text-anchor="middle">RECEIVER</text>
  <line class="l" x1="496" y1="135" x2="548" y2="135"/>
  <path class="j" d="M 468 120 L 352 50"/>
  <circle r="5" fill="#4b7bec"><animateMotion dur="1.8s" repeatCount="indefinite" path="M 468 120 L 352 50"/></circle>
  <text class="k" x="390" y="100">(*, 239.1.1.1) Join</text>
  <text class="s" x="390" y="114">to 224.0.0.13, hop by hop</text>
  <text class="s" x="520" y="168" text-anchor="middle">IGMP report</text>
  <text class="s" x="320" y="192" text-anchor="middle">Each hop toward the RP creates (*, G) with the interface it heard the join on in its outgoing list.</text>
</svg>
<p class="walk-say"><span class="walk-title">The receiver half — a shared tree grows toward the RP</span>
R4 heard an IGMP report. It looks up the RP, finds the RPF interface toward it, and sends a <code>(*, G)</code> join out of that interface — <b>to <code>224.0.0.13</code>, not to the RP's address</b>. PIM is hop by hop: each router processes the join, creates state, and sends its own join further up. The branch stops growing the moment it reaches a router that already has state for that group.</p>
<div class="walk-wire">IPv4      10.0.24.4 → <b>224.0.0.13</b>  proto 103 (PIM)  TTL 1
PIM       type <b>3</b> (Join/Prune)  upstream-nbr 10.0.24.2  holdtime <b>210</b>
  group   239.1.1.1/32   joins 1  prunes 0
  source  10.255.255.1   flags <b>S W R</b>  ← the RP, flagged as a wildcard = (*,G)</div>
</div>
<div class="walk-panel">
<svg viewBox="0 0 640 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The source starts sending and its designated router encapsulates each packet in a unicast PIM register to the RP">
  <style>.n{fill:#17171A}.rp{fill:#8256d0}.nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.l{stroke:#8A8A93;stroke-width:1.5}.j{stroke:#4b7bec;stroke-width:3;fill:none}.reg{stroke:#D3002D;stroke-width:3;fill:none;stroke-dasharray:6 4}.g{stroke:#1f9d6b;stroke-width:3;fill:none}.s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.k{font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700;fill:#B80027}</style>
  <rect class="rp" x="278" y="20" width="84" height="30" rx="3"/><text class="nt" x="320" y="40" text-anchor="middle">RP</text>
  <rect class="n" x="14" y="120" width="80" height="30" rx="3"/><text class="nt" x="54" y="140" text-anchor="middle">SOURCE</text>
  <rect class="n" x="140" y="120" width="56" height="30" rx="3"/><text class="nt" x="168" y="140" text-anchor="middle">R1</text>
  <rect class="n" x="440" y="120" width="56" height="30" rx="3"/><text class="nt" x="468" y="140" text-anchor="middle">R4</text>
  <rect class="n" x="548" y="120" width="78" height="30" rx="3"/><text class="nt" x="587" y="140" text-anchor="middle">RECEIVER</text>
  <path class="g" d="M 94 135 L 140 135"/>
  <path class="reg" d="M 168 120 L 290 50"/>
  <path class="g" d="M 352 50 L 468 120"/>
  <path class="g" d="M 496 135 L 548 135"/>
  <circle r="4.5" fill="#D3002D"><animateMotion dur="1.9s" repeatCount="indefinite" path="M 94 135 L 140 135 L 168 120 L 290 50"/></circle>
  <circle r="4.5" fill="#1f9d6b"><animateMotion dur="1.9s" begin="0.9s" repeatCount="indefinite" path="M 352 50 L 468 120 L 548 135"/></circle>
  <text class="k" x="60" y="80">PIM Register</text>
  <text class="s" x="60" y="94">UNICAST R1 → RP</text>
  <text class="s" x="60" y="107">the data packet, wrapped</text>
  <text class="s" x="400" y="86" fill="#0f6b47">down the shared tree, natively</text>
  <text class="s" x="320" y="192" text-anchor="middle">Traffic is reaching the receiver — but every packet is being hand-carried by the DR's CPU.</text>
</svg>
<p class="walk-say"><span class="walk-title">The source half — a unicast tunnel, briefly</span>
The source just starts sending. It performs no signalling of any kind. Its DR sees multicast traffic from a directly connected subnet, and has a problem: there is no tree yet. So it <b>encapsulates each data packet whole inside a unicast PIM Register</b> addressed to the RP. The RP unwraps it and forwards it down the shared tree it already built in step 2.
<br><br>This works, and it is <b>expensive</b>. Register packets are built and consumed in software on both ends. It has to stop, and step 5 is how.</p>
</div>
<div class="walk-panel">
<svg viewBox="0 0 640 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Now knowing the source address the RP sends an S comma G join back towards it, building a native path">
  <style>.n{fill:#17171A}.rp{fill:#8256d0}.nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.l{stroke:#8A8A93;stroke-width:1.5}.j{stroke:#4b7bec;stroke-width:3;fill:none}.reg{stroke:#D3002D;stroke-width:2;fill:none;stroke-dasharray:6 4;opacity:.45}.g{stroke:#1f9d6b;stroke-width:3;fill:none}.s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.k{font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700;fill:#2b5ab8}</style>
  <rect class="rp" x="278" y="20" width="84" height="30" rx="3"/><text class="nt" x="320" y="40" text-anchor="middle">RP</text>
  <rect class="n" x="14" y="120" width="80" height="30" rx="3"/><text class="nt" x="54" y="140" text-anchor="middle">SOURCE</text>
  <rect class="n" x="140" y="120" width="56" height="30" rx="3"/><text class="nt" x="168" y="140" text-anchor="middle">R1</text>
  <rect class="n" x="440" y="120" width="56" height="30" rx="3"/><text class="nt" x="468" y="140" text-anchor="middle">R4</text>
  <rect class="n" x="548" y="120" width="78" height="30" rx="3"/><text class="nt" x="587" y="140" text-anchor="middle">RECEIVER</text>
  <path class="reg" d="M 168 120 L 290 50"/>
  <path class="j" d="M 290 50 L 168 120"/>
  <path class="g" d="M 352 50 L 468 120 L 548 135"/>
  <circle r="5" fill="#4b7bec"><animateMotion dur="1.8s" repeatCount="indefinite" path="M 290 50 L 168 120"/></circle>
  <text class="k" x="196" y="76">(10.10.10.10, 239.1.1.1) Join</text>
  <text class="s" x="196" y="90">the RP now knows the source address —</text>
  <text class="s" x="196" y="103">it read it off the Register</text>
  <text class="s" x="320" y="192" text-anchor="middle">A native (S, G) path is being built from the RP back toward the source, alongside the tunnel.</text>
</svg>
<p class="walk-say"><span class="walk-title">The RP learns the source and joins it properly</span>
The Register told the RP something it could not have known: <b>the source's unicast address</b>. With that, the RP can do what any router does — send an <code>(S, G)</code> join back toward <code>10.10.10.10</code>, hop by hop, RPF-checked at every step. For a few tens of milliseconds both paths exist: the unicast tunnel still carrying traffic, and a native tree being built underneath it.</p>
</div>
<div class="walk-panel">
<svg viewBox="0 0 640 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Once native traffic arrives the RP sends a register stop and the tunnel is torn down">
  <style>.n{fill:#17171A}.rp{fill:#8256d0}.nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.l{stroke:#8A8A93;stroke-width:1.5}.stop{stroke:#F2994A;stroke-width:3;fill:none}.g{stroke:#1f9d6b;stroke-width:3;fill:none}.s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.k{font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700;fill:#B26014}.x{stroke:#D3002D;stroke-width:2.5}</style>
  <rect class="rp" x="278" y="20" width="84" height="30" rx="3"/><text class="nt" x="320" y="40" text-anchor="middle">RP</text>
  <rect class="n" x="14" y="120" width="80" height="30" rx="3"/><text class="nt" x="54" y="140" text-anchor="middle">SOURCE</text>
  <rect class="n" x="140" y="120" width="56" height="30" rx="3"/><text class="nt" x="168" y="140" text-anchor="middle">R1</text>
  <rect class="n" x="440" y="120" width="56" height="30" rx="3"/><text class="nt" x="468" y="140" text-anchor="middle">R4</text>
  <rect class="n" x="548" y="120" width="78" height="30" rx="3"/><text class="nt" x="587" y="140" text-anchor="middle">RECEIVER</text>
  <path class="g" d="M 94 135 L 140 135"/>
  <path class="g" d="M 168 120 L 290 50"/>
  <path class="g" d="M 352 50 L 468 120 L 548 135"/>
  <path class="stop" d="M 284 56 L 174 126"/>
  <circle r="5" fill="#F2994A"><animateMotion dur="1.6s" repeatCount="indefinite" path="M 284 56 L 174 126"/></circle>
  <line class="x" x1="120" y1="72" x2="138" y2="90"/><line class="x" x1="138" y1="72" x2="120" y2="90"/>
  <text class="s" x="146" y="86" fill="#D3002D">tunnel torn down</text>
  <text class="k" x="196" y="110">Register-Stop (unicast)</text>
  <text class="s" x="320" y="192" text-anchor="middle">Everything is now native multicast, forwarded in hardware. Path: SOURCE → R1 → RP → R4 → RECEIVER.</text>
</svg>
<p class="walk-say"><span class="walk-title">The tunnel closes</span>
Native traffic reaches the RP over the tree built in step 4. The RP now has the same packets arriving twice — once encapsulated, once for real — so it sends a <b>Register-Stop</b> back to the DR and the DR stops encapsulating. Total time in the tunnel: typically well under a second.
<br><br>The DR does not forget. It sends a <b>Null Register</b> — a Register with no data in it — roughly once a minute to confirm the source is still there, and the RP answers each with another Register-Stop. That keep-alive is why <code>show ip mroute</code> on the RP keeps an <code>(S, G)</code> alive for a source nobody is currently watching.</p>
</div>
<div class="walk-panel">
<svg viewBox="0 0 640 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The last hop router joins the shortest path tree directly towards the source, bypassing the RP">
  <style>.n{fill:#17171A}.rp{fill:#8256d0}.nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.l{stroke:#8A8A93;stroke-width:1.5}.j{stroke:#4b7bec;stroke-width:3;fill:none}.g{stroke:#1f9d6b;stroke-width:3;fill:none;opacity:.35}.s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.k{font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700;fill:#2b5ab8}</style>
  <rect class="rp" x="278" y="20" width="84" height="30" rx="3"/><text class="nt" x="320" y="40" text-anchor="middle">RP</text>
  <rect class="n" x="14" y="130" width="80" height="30" rx="3"/><text class="nt" x="54" y="150" text-anchor="middle">SOURCE</text>
  <rect class="n" x="140" y="130" width="56" height="30" rx="3"/><text class="nt" x="168" y="150" text-anchor="middle">R1</text>
  <rect class="n" x="290" y="130" width="56" height="30" rx="3"/><text class="nt" x="318" y="150" text-anchor="middle">R3</text>
  <rect class="n" x="440" y="130" width="56" height="30" rx="3"/><text class="nt" x="468" y="150" text-anchor="middle">R4</text>
  <rect class="n" x="548" y="130" width="78" height="30" rx="3"/><text class="nt" x="587" y="150" text-anchor="middle">RECEIVER</text>
  <path class="g" d="M 168 130 L 290 50"/>
  <path class="g" d="M 352 50 L 468 130"/>
  <path class="j" d="M 440 145 L 346 145"/>
  <path class="j" d="M 290 145 L 196 145"/>
  <circle r="5" fill="#4b7bec"><animateMotion dur="2.2s" repeatCount="indefinite" path="M 440 145 L 346 145"/></circle>
  <circle r="5" fill="#4b7bec"><animateMotion dur="2.2s" begin="0.6s" repeatCount="indefinite" path="M 290 145 L 196 145"/></circle>
  <text class="k" x="230" y="122">(10.10.10.10, 239.1.1.1) Join — straight at the source</text>
  <text class="s" x="320" y="186" text-anchor="middle">R4 saw the first packet, read the source address off it, and stopped caring about the RP.</text>
  <text class="s" x="320" y="202" text-anchor="middle">Cisco default: <tspan font-weight="700">ip pim spt-threshold 0</tspan> — this happens on the very first packet.</text>
</svg>
<p class="walk-say"><span class="walk-title">The receiver's router abandons the RP</span>
The moment the first packet arrives, R4 knows the source address — it is in the IP header. The route through the RP is almost always longer than the direct one, so R4 sends an <code>(S, G)</code> join <b>straight toward the source</b>, building a shortest path tree that does not involve the RP at all.
<br><br>On Cisco this is the default and it happens immediately: <code>ip pim spt-threshold</code> defaults to <b>0 kbps</b>. Other vendors and the RFC allow a rate threshold so that low-rate groups stay on the shared tree and save state.</p>
</div>
<div class="walk-panel">
<svg viewBox="0 0 640 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="With traffic arriving on the shortest path the router prunes itself off the shared tree and the RP is no longer in the path">
  <style>.n{fill:#17171A}.rp{fill:#8256d0;opacity:.4}.nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.l{stroke:#8A8A93;stroke-width:1.5}.g{stroke:#1f9d6b;stroke-width:3.5;fill:none}.pr{stroke:#D3002D;stroke-width:2.5;fill:none;stroke-dasharray:5 4}.s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.k{font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700;fill:#0f6b47}</style>
  <rect class="rp" x="278" y="20" width="84" height="30" rx="3"/><text class="nt" x="320" y="40" text-anchor="middle">RP</text>
  <text class="s" x="320" y="66" text-anchor="middle" fill="#8256d0">idle — still the meeting place for the next receiver</text>
  <rect class="n" x="14" y="130" width="80" height="30" rx="3"/><text class="nt" x="54" y="150" text-anchor="middle">SOURCE</text>
  <rect class="n" x="140" y="130" width="56" height="30" rx="3"/><text class="nt" x="168" y="150" text-anchor="middle">R1</text>
  <rect class="n" x="290" y="130" width="56" height="30" rx="3"/><text class="nt" x="318" y="150" text-anchor="middle">R3</text>
  <rect class="n" x="440" y="130" width="56" height="30" rx="3"/><text class="nt" x="468" y="150" text-anchor="middle">R4</text>
  <rect class="n" x="548" y="130" width="78" height="30" rx="3"/><text class="nt" x="587" y="150" text-anchor="middle">RECEIVER</text>
  <path class="pr" d="M 468 130 L 352 50"/>
  <path class="g" d="M 94 145 L 140 145"/>
  <path class="g" d="M 196 145 L 290 145"/>
  <path class="g" d="M 346 145 L 440 145"/>
  <path class="g" d="M 496 145 L 548 145"/>
  <circle r="4.5" fill="#1f9d6b"><animateMotion dur="2s" repeatCount="indefinite" path="M 94 145 L 548 145"/></circle>
  <circle r="4.5" fill="#1f9d6b"><animateMotion dur="2s" begin="0.7s" repeatCount="indefinite" path="M 94 145 L 548 145"/></circle>
  <text class="s" x="344" y="96" text-anchor="end" fill="#D3002D">(S, G) RP-bit Prune —</text>
  <text class="s" x="344" y="110" text-anchor="end" fill="#D3002D">&#8220;stop sending me this source&#8221;</text>
  <text class="k" x="320" y="192" text-anchor="middle">Final state: SOURCE → R1 → R3 → R4 → RECEIVER. The shortest path, in hardware, no RP.</text>
</svg>
<p class="walk-say"><span class="walk-title">The clean-up nobody watches</span>
R4 now receives the stream twice — once down the shared tree from the RP, once up the new shortest path tree. So it sends an <code>(S, G)</code> <b>prune with the RP-bit set</b> back up the shared tree, meaning "keep the group, but stop sending me <em>this source</em>". The duplicate stops.
<br><br>Look at <code>show ip mroute</code> now and the <code>(*, G)</code> entry is still there with the RP as its incoming interface, while the <code>(S, G)</code> carries flag <code>T</code> and a different incoming interface. That is not a fault. <b>That is the finished state</b>, and recognising it is most of what reading an mroute table is for.</p>
</div>
</div>
</div>

<div class="real">
<b>In the real world</b>
The RP is in the path for a few hundred milliseconds at the start of each new stream and then nothing flows through it. That is why a badly sized RP usually does not show up as a bandwidth problem — it shows up as <em>slow channel change</em>. On an IPTV network, every time a viewer changes channel a new group is joined, and the RP's control-plane CPU is in that path. If your RP is an old router or a busy core box, the symptom is that the picture takes two seconds to appear, and nobody thinks to blame a device that has almost no traffic going through it.
</div>

### The Register on the wire

The Register is worth seeing, because it is the one PIM message that is unicast and the one that carries a whole packet inside another packet:

<div class="cap">
<div class="cap-head">Capture · first-hop DR toward the RP <span class="cap-filter">pim.type == 1</span></div>
<table class="cap-list">
<thead><tr><th>No.</th><th>Time</th><th>Source</th><th>Destination</th><th>Proto</th><th>Len</th><th>Info</th></tr></thead>
<tbody>
<tr><td class="no">7</td><td>0.000</td><td>10.0.12.1</td><td>224.0.0.13</td><td>PIMv2</td><td>60</td><td>Hello</td></tr>
<tr class="is-sel"><td class="no">8</td><td>4.113</td><td>10.0.11.1</td><td>10.255.255.1</td><td>PIMv2</td><td>90</td><td><b>Register</b></td></tr>
<tr><td class="no">9</td><td>4.118</td><td>10.0.11.1</td><td>10.255.255.1</td><td>PIMv2</td><td>90</td><td>Register</td></tr>
<tr class="ctrl"><td class="no">14</td><td>4.271</td><td>10.255.255.1</td><td>10.0.11.1</td><td>PIMv2</td><td>46</td><td>Register-stop</td></tr>
<tr><td class="no">31</td><td>64.402</td><td>10.0.11.1</td><td>10.255.255.1</td><td>PIMv2</td><td>46</td><td>Register (Null-Register)</td></tr>
</tbody>
</table>
<div class="cap-tree"><pre>▾ Internet Protocol Version 4
    <span class="f">Source:</span> <span class="v">10.0.11.1</span>            ← the DR
    <span class="f">Destination:</span> <span class="v"><mark>10.255.255.1</mark></span>     ← the RP. <mark>Unicast</mark> — the only PIM message that is
    <span class="f">Protocol:</span> <span class="v">PIM (103)</span>
▾ Protocol Independent Multicast
    <span class="f">Version:</span> <span class="v">2</span>   <span class="f">Type:</span> <span class="v"><mark>Register (1)</mark></span>
    <span class="f">Flags:</span> <span class="v">0x00000000</span>
      <span class="f">Border:</span> <span class="v">0</span>    <span class="f">Null-Register:</span> <span class="v">0</span>
  ▾ <span class="f">Internet Protocol Version 4 (the encapsulated packet)</span>
      <span class="f">Source:</span> <span class="v"><mark>10.10.10.10</mark></span>       ← this is how the RP learns the source
      <span class="f">Destination:</span> <span class="v">239.1.1.1</span>
      <span class="f">Protocol:</span> <span class="v">UDP (17)</span>
      <span class="f">Time to Live:</span> <span class="v">10</span>          ← the original TTL, untouched</pre></div>
<div class="cap-hex"><pre>0000  00 aa bb cc dd ee 00 1a  2b 3c 4d 5e 08 00 45 c0   ........+&lt;M^..E.
0010  00 48 00 00 00 00 fa <mark>67</mark>  a0 8d 0a 00 0b 01 <mark>0a ff</mark>   .H.....g........
0020  <mark>ff 01</mark> <mark>21</mark> 00 de ff 00 00  00 00 <mark>45 00 00 2c</mark> 1c 4e   ..!.......E..,.N
0030  00 00 0a 11 90 5d <mark>0a 0a</mark>  <mark>0a 0a</mark> <mark>ef 01 01 01</mark> 04 d2   .....]..........
0040  13 8c 00 18 00 00 00 00  00 00 00 00 00 00 00 00   ................</pre></div>
<div class="cap-note"><b>The nesting is visible in the bytes.</b> <code>67</code> = protocol 103, PIM. <code>0a ff ff 01</code> = 10.255.255.1, the RP, as a plain unicast destination. <code>21</code> = version 2, type 1 — Register. Then at offset 0x2A a <b>second IP header begins</b>: <code>45 00 00 2c</code>, carrying <code>0a 0a 0a 0a</code> → <code>ef 01 01 01</code> — the original multicast packet, complete and unmodified, riding inside. A <b>Null-Register</b> is this same message with the Null bit set and nothing after the header.</div>
</div>

And the Join/Prune, which is multicast and hop-by-hop:

<div class="cap">
<div class="cap-head">Capture · (*,G) join toward the RP <span class="cap-filter">pim.type == 3</span></div>
<div class="cap-hex"><pre>0000  01 00 5e 00 00 0d 00 1a  2b 3c 4d 5e 08 00 45 c0   ..^.....+&lt;M^..E.
0010  00 36 00 00 00 00 <mark>01</mark> 67  c2 93 0a 00 0c 01 <mark>e0 00</mark>   .6.....g........
0020  <mark>00 0d</mark> <mark>23</mark> 00 c1 e5 01 00  <mark>0a 00 0c 02</mark> 00 01 <mark>00 d2</mark>   ..#.............
0030  01 00 00 20 <mark>ef 01 01 01</mark>  00 01 00 00 01 00 <mark>07</mark> 20   ... ...........
0040  <mark>0a ff ff 01</mark>                                        ....</pre></div>
<div class="cap-note"><b>Reading a join by hand.</b> <code>01</code> — TTL 1, it dies at the next router by design. <code>e0 00 00 0d</code> — destination 224.0.0.13. <code>23</code> — version 2, type 3, Join/Prune. <code>0a 00 0c 02</code> — the <b>upstream neighbour</b> this join is addressed to; a router that is not that address ignores it, which is how a multicast join is aimed at one neighbour on a shared LAN. <code>00 d2</code> — holdtime 210 s, and the sender refreshes every 60. <code>ef 01 01 01</code> — the group. Then <code>07</code>: the <b>S, W and R flags together</b>, which is what makes this a <code>(*, G)</code> join, with <code>0a ff ff 01</code> — the RP — standing in for the source. An <code>(S, G)</code> join carries <code>04</code> here and the real source address.</div>
</div>

---

## Where the RP comes from

Every router must agree on the RP. Three mechanisms, and one design that removes the question.

| | **Static** | **Auto-RP** | **BSR** |
|---|---|---|---|
| **Standard** | Universal | **Cisco only** | RFC 5059, open |
| **How it spreads** | You type it everywhere | Dense-mode groups `224.0.1.39` / `.40` | PIM bootstrap messages, hop by hop |
| **Roles** | — | Candidate RP + **Mapping Agent** | Candidate RP + **Bootstrap Router** |
| **Redundancy** | `rp-address` × 2, no failover | Mapping agent picks **highest IP** | BSR hashes group → RP |
| **Chicken and egg** | None | Needs dense/sparse-dense or `autorp listener` | None — bootstrap is hop by hop |
| **Use it when** | **Small or fixed. Most enterprises.** | Legacy Cisco networks | Mixed vendor |

<div class="cmd">
<div class="cmd-line"><span class="t">ip pim rp-address</span> <span class="opt">10.255.255.1</span> <span class="opt">GROUPS</span> <span class="t">override</span></div>
<dl class="cmd-parts">
<div class="is-key"><dt>ip pim rp-address</dt><dd>Static RP. <b>Must be identical on every router in the domain</b> — a single router pointing at a different RP will build a tree that meets nobody, and the symptom is one site that cannot see a stream everyone else can.</dd></div>
<div><dt>10.255.255.1</dt><dd>Use a <b>loopback</b>, always. A physical interface address takes the RP down when that one link fails, and the RP address must be reachable by unicast from every router — advertise the loopback in your IGP.</dd></div>
<div><dt>GROUPS</dt><dd>An optional standard ACL limiting which groups this RP serves. This is how you run different RPs for different applications, and how you keep a video RP from taking on a market-data group.</dd></div>
<div><dt>override</dt><dd>Static wins over anything learned dynamically. Without it, an Auto-RP or BSR announcement beats your static configuration — which is exactly the surprise you do not want during a migration.</dd></div>
</dl>
</div>

### Anycast RP — the redundancy that actually works

Static RP has no failover. Auto-RP and BSR have slow failover and pick one winner for the whole domain. The design that solves it properly is **anycast RP**: configure **the same IP address** on loopbacks of two or more routers, advertise it from all of them, and let unicast routing send each source and receiver to the nearest one.

That leaves one problem — a source registered with RP-east is unknown to RP-west, so a receiver near RP-west never learns about it. **MSDP** fixes exactly that.

<figure class="fig">
<svg viewBox="0 0 640 248" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Two routers share one anycast RP address and exchange source active messages over MSDP so each knows about the other's sources">
  <style>
    .n{fill:#17171A}.rp{fill:#8256d0}.nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}
    .l{stroke:#8A8A93;stroke-width:1.5}.msdp{stroke:#8256d0;stroke-width:2.5;fill:none;stroke-dasharray:6 4}
    .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}
    .k{font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}
  </style>
  <rect class="rp" x="120" y="36" width="130" height="34" rx="3"/><text class="nt" x="185" y="58" text-anchor="middle">RP-EAST</text>
  <rect class="rp" x="390" y="36" width="130" height="34" rx="3"/><text class="nt" x="455" y="58" text-anchor="middle">RP-WEST</text>
  <text class="s" x="185" y="88" text-anchor="middle">Lo0 10.255.255.1/32</text>
  <text class="s" x="455" y="88" text-anchor="middle">Lo0 10.255.255.1/32</text>
  <text class="k" x="320" y="26" text-anchor="middle" fill="#5b35a0">the same address on both — unicast routing decides who you reach</text>
  <path class="msdp" d="M 250 53 L 390 53"/>
  <circle r="4.5" fill="#8256d0"><animateMotion dur="2s" repeatCount="indefinite" path="M 250 53 L 390 53"/></circle>
  <circle r="4.5" fill="#8256d0"><animateMotion dur="2s" begin="1s" repeatCount="indefinite" path="M 390 53 L 250 53"/></circle>
  <text class="k" x="320" y="112" text-anchor="middle" fill="#5b35a0">MSDP · TCP 639 · Source-Active messages</text>
  <text class="s" x="320" y="128" text-anchor="middle">&#8220;I have (10.10.10.10, 239.1.1.1)&#8221; — peered on a second, unique loopback</text>
  <rect class="n" x="60" y="176" width="96" height="32" rx="3"/><text class="nt" x="108" y="197" text-anchor="middle">SOURCE</text>
  <rect class="n" x="484" y="176" width="106" height="32" rx="3"/><text class="nt" x="537" y="197" text-anchor="middle">RECEIVER</text>
  <line class="l" x1="120" y1="176" x2="170" y2="76"/>
  <line class="l" x1="510" y1="176" x2="466" y2="76"/>
  <text class="s" x="132" y="146">registers with whichever</text>
  <text class="s" x="132" y="160">RP is nearer</text>
  <text class="s" x="606" y="146" text-anchor="end">joins whichever</text>
  <text class="s" x="606" y="160" text-anchor="end">RP is nearer</text>
  <text class="s" x="320" y="238" text-anchor="middle">Lose one RP and unicast reconverges onto the other. No PIM reconfiguration, no election, no timer.</text>
</svg>
<figcaption><b>Figure 2.</b> Failover becomes a unicast routing event, which is the fastest and best-understood convergence you have. MSDP is the glue that stops the two RPs having separate views of the world.</figcaption>
</figure>

<div class="note">
<b>MSDP does two different jobs</b>
Inside one domain it is the glue for anycast RP, as above. Between domains it is how the internet did interdomain multicast: my RP tells your RP which sources I have, your receivers join across the boundary, and neither of us has to share an RP. Same protocol, same <b>Source-Active</b> message, same TCP 639 — very different reason for running it. The peering must use a <b>second, unique loopback</b> on each router, never the anycast address, or the TCP session has no stable endpoint.
</div>

---

## SPT switchover, and when to stop it

Step 6 of the walk is a decision, not a law. `ip pim spt-threshold` controls it.

<div class="cmd">
<div class="cmd-line"><span class="t">ip pim spt-threshold</span> <span class="opt">{ kbps | infinity }</span> <span class="opt">[group-list ACL]</span></div>
<dl class="cmd-parts">
<div class="is-key"><dt>0 (the default)</dt><dd>Switch to the source tree <b>on the first packet</b>. Shortest path, lowest latency, and an <code>(S, G)</code> entry on every router in the path <b>for every source</b>.</dd></div>
<div><dt>kbps</dt><dd>Only switch once the source exceeds this rate. Low-rate groups stay on the shared tree and cost one <code>(*, G)</code> instead of many <code>(S, G)</code>. Cisco's implementation measures this crudely — treat it as "eventually" rather than a precise trigger.</dd></div>
<div><dt>infinity</dt><dd><b>Never switch.</b> Everything stays on the shared tree through the RP for ever. Use it where state matters more than path length — a router with thousands of low-rate groups, or a hub-and-spoke WAN where the RP is at the hub and the direct path does not exist anyway.</dd></div>
<div><dt>group-list</dt><dd>Apply the threshold to some groups only. The usual shape: <code>infinity</code> for a chatty many-to-many application, default for everything else.</dd></div>
</dl>
</div>

<div class="term">
<div class="term-bar"><span class="term-dots"><i></i><i></i><i></i></span>R4 — the same group, before and after the switchover</div>
<pre><span class="o">! Immediately after the receiver joins — shared tree only</span>
(*, 239.1.1.1), 00:00:03/00:02:56, RP <span class="y">10.255.255.1</span>, flags: <span class="y">SJC</span>
  Incoming interface: <span class="y">GigabitEthernet0/2</span>, RPF nbr 10.0.24.2   <span class="o">&lt;- toward the RP</span>
  Outgoing interface list:
    Vlan10, Forward/Sparse, 00:00:03/00:02:56

<span class="o">! One second later — the source tree has taken over</span>
(*, 239.1.1.1), 00:00:09/stopped, RP 10.255.255.1, flags: SJC
  Incoming interface: GigabitEthernet0/2, RPF nbr 10.0.24.2
  Outgoing interface list:
    Vlan10, Forward/Sparse, 00:00:09/00:02:50

(<span class="y">10.10.10.10</span>, 239.1.1.1), 00:00:06/00:02:53, flags: <span class="g">JT</span>
  Incoming interface: <span class="g">GigabitEthernet0/1</span>, RPF nbr 10.0.34.3   <span class="o">&lt;- toward the SOURCE. Different interface.</span>
  Outgoing interface list:
    Vlan10, Forward/Sparse, 00:00:06/00:02:53<span class="cur"></span></pre>
</div>
<p class="term-cap"><b>The whole switchover is in two characters.</b> Flag <code>J</code> on the <code>(*, G)</code> means "I have joined the SPT". Flag <code>T</code> on the <code>(S, G)</code> means "traffic is arriving on it". And the two entries have <b>different incoming interfaces</b> — one pointing at the RP, one at the source. If you only ever remember one thing about reading an mroute table, make it that.</p>

---

## Assert — when two routers duplicate onto one LAN

Two PIM routers on the same segment, both with a path to the source, both forwarding the same group onto that segment. Receivers get every packet twice.

PIM detects it because each router sees the other's copy arriving on its own **outgoing** interface. They then send **Assert** messages and settle it:

1. **Lowest administrative distance** to the source wins.
2. Tie → **lowest metric** wins.
3. Still tied → **highest IP address** wins.

The loser prunes its outgoing interface. The winner becomes the **assert winner** and keeps forwarding.

<div class="warn">
<b>Why asserts matter to you</b>
The tie-break is the <b>highest IP</b>, which is the same rule as the DR election — so on a segment where both routers have equal routing, <b>the assert winner and the DR are the same box</b>, and everything looks tidy. Introduce asymmetry (one router learns the source via OSPF, the other via a static route with better AD) and the assert winner is suddenly <em>not</em> the DR. Traffic forwards from one router while IGMP is handled by another. It works, it is legal, and it is bewildering at 2am unless you know the two elections have different inputs.
</div>

---

## SSM — deleting the RP

Everything above exists to solve one problem: **the receiver does not know the source's address.** Source-Specific Multicast observes that in most real applications, it does.

You know your market data feed comes from `10.10.10.10`. You know your IPTV channel comes from a specific encoder. If the receiver states the source when it joins, then:

- No RP. No shared tree. No Register. No MSDP. **The entire control plane above disappears.**
- The last-hop router sends an `(S, G)` join straight at the source and it is done.
- Channel change is one round trip, not a rendezvous.
- **Nobody else can inject traffic into your group**, because a join names the source and traffic from any other source is not forwarded.

The price: the receiver must know the source, and **the host must speak IGMPv3**, since only v3 can carry a source in a join.

<div class="cmd">
<div class="cmd-line"><span class="t">ip pim ssm</span> <span class="opt">{ default | range ACL }</span>
interface Vlan10
 <span class="t">ip igmp version 3</span></div>
<dl class="cmd-parts">
<div class="is-key"><dt>ip pim ssm default</dt><dd>Turns on SSM for <b>232.0.0.0/8</b>, the IANA range. In that range the router will not build a shared tree or look for an RP at all — an <code>(*, G)</code> join for a 232 group is simply refused.</dd></div>
<div><dt>range ACL</dt><dd>Run SSM semantics over your own groups instead of, or as well as, 232/8. Useful when an application's group is fixed in code and you cannot move it into the standard range.</dd></div>
<div class="is-key"><dt>ip igmp version 3</dt><dd><b>Not optional.</b> IGMPv2 has no field for a source. On a v2 segment an SSM join cannot be expressed, the router never gets an <code>(S, G)</code>, and the symptom is a group in the 232 range that simply never delivers anything — with no error message anywhere.</dd></div>
</dl>
</div>

<div class="real">
<b>In the real world</b>
If you are designing multicast today and the application can be told its source address, <b>use SSM</b>. It removes the RP, the Register, the MSDP mesh and most of the failure modes in this article, and it closes a genuine security hole: in ASM, anyone who can route to your group can send to it. Financial exchanges and large IPTV deployments have moved to SSM almost universally for exactly those two reasons. ASM survives where applications cannot name their source, and in discovery protocols where by definition you do not know who will answer.
</div>

---

## Bidir — for many-to-many

One more mode, and it exists for a shape of traffic the others handle badly: **many sources, many receivers, all in the same group** — trading floors, some financial multicast, distributed simulation.

With PIM-SM, N sources means N `(S, G)` entries on every router in the path. With a thousand hosts that are all both source and receiver, the state explodes.

**Bidirectional PIM (RFC 5015)** keeps everything on the shared tree, permanently, and allows traffic to flow *up* it toward the RP as well as down. There is **no `(S, G)` state at all**, no Register, and no SPT switchover. The cost is that every packet goes via the RP even when the source and receiver are next to each other.

Because traffic now travels upstream, RPF cannot be used to prevent loops — so bidir elects a **Designated Forwarder** on every link: the one router permitted to move traffic toward the RP on that segment. DF election is per-RP per-link, and won by the best unicast metric to the RP.

| | **PIM-SM (ASM)** | **SSM** | **Bidir** |
|---|---|---|---|
| **RP needed** | Yes | **No** | Yes, always in path |
| **State per source** | `(S, G)` everywhere | `(S, G)` on the path | **None** |
| **Register** | Yes | No | **No** |
| **SPT switchover** | Yes, default immediate | n/a — always SPT | **Never** |
| **Loop prevention** | RPF | RPF | **Designated Forwarder** |
| **Good for** | General purpose | One source, many receivers | **Many to many** |
| **Receiver must know source** | No | **Yes** | No |

---

## What goes wrong

**`show ip pim neighbor` is empty.** PIM is not on one side, or an ACL is blocking IP protocol 103, or the two ends are in different subnets. PIM will not form over a subnet mismatch.

**Receivers on one site work, another site sees nothing.** Different RP address configured on that site's routers. Compare `show ip pim rp mapping` everywhere — not the configuration, the mapping.

**`(*, G)` exists but `(S, G)` never appears.** The receiver half is fine and the source half never registered. Check the source's DR can reach the RP by unicast, and that it *is* the DR.

**The RP shows the source but receivers get nothing.** The shared tree is not built past some hop. Walk `show ip mroute` router by router from the receiver toward the RP; the break is at the first router with an empty outgoing interface list.

**Everything duplicates on one segment.** Assert is not resolving, or you have two routers with `ip pim` on a segment with no PIM adjacency between them — check they see each other as neighbours.

**Works, then breaks every 3 minutes, then works.** Join refresh is failing. Joins are resent every 60 s against a 210 s holdtime, so losing them intermittently produces exactly that rhythm.

**232-range groups never deliver.** SSM with IGMPv2 on the segment. `show ip igmp interface` shows the version actually negotiated.

---

<div class="lab">
<div class="lab-head">Lab — watch the tree change shape twice, then take the RP away</div>
<div class="lab-body">

<div class="lab-target"><b>Target</b>
Capture the full sparse-mode sequence in order — join, Register, Register-Stop, SPT join, RP-bit prune — and see each one change the mroute table in front of you. Then force the behaviour both ways with <code>spt-threshold</code>, kill the RP and watch what survives, rebuild it as anycast with MSDP, and finally delete the RP entirely by converting the same application to SSM.</div>

**Topology.** `SOURCE (10.10.10.10)` — `R1` — `R3` — `R4` — `RECEIVER`, with `R2` off to the side as the RP on `Lo0 10.255.255.1`. R1 also has a direct link to R2, and R4 has a direct link to R2, so the path through the RP and the direct path are genuinely different. OSPF everywhere; `ip multicast-routing` and `ip pim sparse-mode` on every interface.

<p class="lab-step"><span class="n">1</span>Set a trap before you start</p>

On R4, so you see the state changes rather than inferring them:

```cisco
R4# debug ip pim
R4# terminal monitor
```

And on R1 (the source DR), start a capture of the R1–R2 link filtered on `pim`.

<p class="lab-step"><span class="n">2</span>Join first, with no source</p>

Join `239.1.1.1` from the receiver **while the source is silent**.

```cisco
R4# show ip mroute 239.1.1.1
R2# show ip mroute 239.1.1.1
```

<div class="lab-watch"><b>Things to notice</b>
You have a <code>(*, G)</code> on R4, on every router between R4 and the RP, and on the RP itself — and <b>no <code>(S, G)</code> anywhere</b>, because no source exists. The incoming interface on each points toward the RP. This is the shared tree, alone and complete, and it is the clearest view of it you will ever get. Note the uptime: it will keep refreshing every 60 s for as long as the receiver stays joined.</div>

<p class="lab-step"><span class="n">3</span>Start the source and catch the Register</p>

Start the stream. Immediately:

```cisco
R1# show ip mroute 239.1.1.1
R2# show ip mroute 239.1.1.1
R4# show ip mroute 239.1.1.1
```

In the capture you should have: a burst of **Register** packets from R1 to R2, then a **Register-Stop** from R2 to R1, and nothing more until the **Null-Register** about a minute later.

<div class="lab-watch"><b>Things to notice</b>
Open one Register in Wireshark and expand it until you find <b>a second IP header inside</b>, with source 10.10.10.10 and destination 239.1.1.1. That is the actual data packet being carried by the control plane. Count how many Registers were sent before the Stop arrived — that number is how long your network spent forwarding video through a CPU. Then look at R1's mroute: the <code>(S, G)</code> has flag <b>F</b> (Register) while the tunnel is up, and loses it afterwards.</div>

<p class="lab-step"><span class="n">4</span>Catch the switchover</p>

On R4, the `(S, G)` should already exist with flag `T`. Compare its incoming interface with the `(*, G)`'s.

```cisco
R4# show ip mroute 239.1.1.1
R4# show ip rpf 10.10.10.10
R4# show ip rpf 10.255.255.1
```

<div class="lab-watch"><b>Things to notice</b>
Two RPF answers, two different interfaces — one toward the source, one toward the RP — and each mroute entry uses the matching one. Now run <code>mtrace 10.10.10.10 &lt;receiver&gt; 239.1.1.1</code> and confirm the path no longer includes R2 at all. The RP was in the path for a fraction of a second and is now a bystander.</div>

<p class="lab-step"><span class="n">5</span>Turn the switchover off and watch the path get worse</p>

```cisco
! On R4
ip pim spt-threshold infinity
```

Clear the state (`clear ip mroute *`) and re-join.

<div class="lab-watch"><b>Things to notice</b>
Now there is no <code>(S, G)</code> on R4 at all, and every packet travels SOURCE → R1 → R2 (the RP) → R4. Run <code>mtrace</code> again and compare hop counts with step 4. You have just measured the cost of staying on the shared tree — and simultaneously measured what you save, because R4's mroute table is now one entry instead of two. That trade is the entire argument, and now you have both numbers for your own topology.</div>

<p class="lab-step"><span class="n">6</span>Kill the RP while traffic is flowing</p>

Set `spt-threshold` back to default, get the stream running, then `shutdown` R2's loopback.

<div class="lab-watch"><b>Things to notice</b>
<b>The existing stream keeps working.</b> It is on the SPT and the RP is not in the path. Now join the same group from a <em>second</em> receiver, and that one fails completely — it cannot build a shared tree to an RP that does not exist. This is the single most valuable thing in this lab: <b>losing the RP does not break what is running, it breaks everything that starts afterwards</b>. It is why RP failure gets reported as "some users can't get the channel" rather than as an outage, and why it is often found hours late.</div>

<p class="lab-step"><span class="n">7</span>Build anycast RP with MSDP</p>

Put `10.255.255.1/32` on loopback 0 of **both** R2 and R5, advertise both into OSPF, and peer them with MSDP on a *different* loopback each:

```cisco
! R2
interface Loopback0
 ip address 10.255.255.1 255.255.255.255
interface Loopback1
 ip address 10.255.255.2 255.255.255.255
!
ip msdp peer 10.255.255.3 connect-source Loopback1
ip msdp originator-id Loopback1

! R5 — mirror image, Lo1 = 10.255.255.3, peer 10.255.255.2
```

```cisco
R2# show ip msdp peer
R2# show ip msdp sa-cache
```

<div class="lab-watch"><b>Things to notice</b>
Register a source at the R5 end and watch the SA appear in R2's cache within seconds — that is the entire point of MSDP in one command. Then shut R2's Lo0 with traffic running and time the failover: it is a unicast reconvergence, so it is as fast as your IGP and nothing else. Try the peering on Lo0 instead of Lo1 to see why it must not be the anycast address — both ends try to talk to an address that resolves to themselves.</div>

<p class="lab-step"><span class="n">8</span>Delete the RP entirely — convert to SSM</p>

```cisco
! Every router
ip pim ssm default
! Every receiver-facing interface
interface Vlan10
 ip igmp version 3
```

Move the application to `232.1.1.1` and have the receiver join `(10.10.10.10, 232.1.1.1)` — on Linux, `socat UDP4-RECV:5004,ip-add-source-membership=232.1.1.1:10.10.10.10:eth0 -`.

<div class="lab-issues"><b>Possible issues</b>
<ul>
<li><b>Nothing arrives and no state appears</b> — the segment is still on IGMPv2. Confirm with <code>show ip igmp interface Vlan10</code>; the configured version and the running version are different fields.</li>
<li><b>&#8220;Group range is SSM, (*,G) join rejected&#8221; in the logs</b> — an application or a host is trying a normal join into 232/8. That message is the router working correctly.</li>
<li><b>The join names the wrong source</b> — <code>show ip igmp groups 232.1.1.1 detail</code> lists the source list the host actually asked for. Compare it with the source's real address; a NAT or a secondary interface address catches people here.</li>
<li><b>Works from one host, not another</b> — Windows and Linux differ in which API a given application uses to request source-specific membership. Capture and check the record type is 3 or 5, not 4.</li>
</ul></div>

<p class="lab-step"><span class="n">9</span>Prove SSM's security property</p>

With the SSM stream running, start a **second** source sending to `232.1.1.1` from a different address.

<div class="lab-watch"><b>Things to notice</b>
Nothing happens. The receiver does not see it, and no router builds any state for it, because no join names that source. Repeat the same test on the ASM group <code>239.1.1.1</code> and the rogue traffic is delivered to every receiver. You have just demonstrated, in two commands, the reason exchanges and broadcasters moved to SSM — and you have an argument you can make to somebody who does not care about state tables.</div>

<div class="lab-earned"><b>What you earned</b>
You can describe the sparse-mode sequence in order without hesitating, because you watched each message arrive and change something. You can read an mroute table and say which tree traffic is actually on, from the <code>J</code> and <code>T</code> flags and the incoming interfaces, rather than guessing. You know that losing the RP breaks new joins and not existing streams — which is the difference between finding that fault in ten minutes and in a day. You have built the only RP redundancy design that fails over at unicast speed. And you can make the case for SSM on both of its merits, having measured one and demonstrated the other.</div>

</div>
</div>

---

## Test yourself

<div class="qz">
<p class="qz-q"><span class="qz-num">Q1</span>A source begins sending. Its DR has no tree for the group. What does it do with the first data packet?</p>
<label class="qz-opt"><input type="radio" name="pim1"><span>Drops it — there is no outgoing interface</span><em class="qz-fb qz-bad">That is dense mode's opposite instinct. Sparse mode has a mechanism for exactly this moment.</em></label>
<label class="qz-opt"><input type="radio" name="pim1"><span>Encapsulates it in a unicast PIM Register addressed to the RP</span><em class="qz-fb qz-good">Correct — and it is how the RP learns the source's address, since the original IP header travels intact inside.</em></label>
<label class="qz-opt"><input type="radio" name="pim1"><span>Floods it out every PIM interface</span><em class="qz-fb qz-bad">That is dense mode. Sparse mode never floods data.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q2</span>On a last-hop router you see <code>(*, G)</code> with incoming Gi0/2 and <code>(S, G)</code> with flag <code>T</code> and incoming Gi0/1. What is happening?</p>
<label class="qz-opt"><input type="radio" name="pim2"><span>A fault — the two entries disagree</span><em class="qz-fb qz-bad">They are supposed to disagree. Each points at a different root.</em></label>
<label class="qz-opt"><input type="radio" name="pim2"><span>Normal: the shared tree points at the RP, the source tree points at the source, and T says traffic is on the source tree</span><em class="qz-fb qz-good">Exactly. This is the finished state after SPT switchover, and it is what a healthy sparse-mode network looks like.</em></label>
<label class="qz-opt"><input type="radio" name="pim2"><span>The RP has failed over</span><em class="qz-fb qz-bad">Nothing here indicates that — the <code>(*, G)</code> is still happily pointed at an RP.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q3</span>The RP is lost while a stream is running. What happens?</p>
<label class="qz-opt"><input type="radio" name="pim3"><span>Every stream drops immediately</span><em class="qz-fb qz-bad">Not if the switchover has happened — and by default it happens on the first packet.</em></label>
<label class="qz-opt"><input type="radio" name="pim3"><span>Running streams on the SPT continue; new joins fail</span><em class="qz-fb qz-good">Right, and it is why this fault gets reported as "some people can't get it" hours after the RP actually died.</em></label>
<label class="qz-opt"><input type="radio" name="pim3"><span>Nothing — the RP is only used at startup and is never needed again</span><em class="qz-fb qz-bad">Half true. Every <em>new</em> receiver and every <em>new</em> source needs it.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q4</span>Why does SSM not need a rendezvous point?</p>
<label class="qz-opt"><input type="radio" name="pim4"><span>Because the receiver already knows the source address and puts it in the join</span><em class="qz-fb qz-good">Correct — the RP exists only to introduce a receiver to a source it cannot name. Name it and the introduction is unnecessary.</em></label>
<label class="qz-opt"><input type="radio" name="pim4"><span>Because SSM floods to everyone</span><em class="qz-fb qz-bad">SSM is the most precise mode of the three. Nothing is flooded.</em></label>
<label class="qz-opt"><input type="radio" name="pim4"><span>Because 232/8 is a special range routers handle in hardware</span><em class="qz-fb qz-bad">The range is a convention that tells routers to apply SSM rules. It is not a forwarding shortcut.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q5</span>Two PIM routers forward the same group onto one LAN, duplicating it. Which wins the Assert?</p>
<label class="qz-opt"><input type="radio" name="pim5"><span>Lowest AD to the source, then lowest metric, then highest IP</span><em class="qz-fb qz-good">Correct. The last tie-break is the same as the DR election, so with symmetric routing the assert winner and the DR are the same router — and with asymmetric routing they are not, which is the confusing case.</em></label>
<label class="qz-opt"><input type="radio" name="pim5"><span>Highest IP address, always</span><em class="qz-fb qz-bad">That is only the final tie-break. Routing quality is considered first.</em></label>
<label class="qz-opt"><input type="radio" name="pim5"><span>The PIM DR always wins</span><em class="qz-fb qz-bad">Often true by coincidence, but the two elections take different inputs and can land on different routers.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q6</span>Which design gives the fastest RP failover?</p>
<label class="qz-opt"><input type="radio" name="pim6"><span>Anycast RP with MSDP</span><em class="qz-fb qz-good">Correct — failover becomes a unicast routing convergence, with no PIM timer involved at all. MSDP keeps both RPs aware of every source.</em></label>
<label class="qz-opt"><input type="radio" name="pim6"><span>Two static <code>ip pim rp-address</code> lines</span><em class="qz-fb qz-bad">That does not fail over. The lower address is used and the second line is effectively decoration.</em></label>
<label class="qz-opt"><input type="radio" name="pim6"><span>Auto-RP with two candidate RPs</span><em class="qz-fb qz-bad">It does fail over, but on Auto-RP's own timers — far slower than a routing reconvergence.</em></label>
</div>

---

## References

- **RFC 7761** — PIM-SM Protocol Specification (Revised). **Internet Standard, STD 83**; obsoletes RFC 4601. The message types, timers and the Assert rules here come from it.
- **RFC 5015** — Bidirectional PIM.
- **RFC 5059** — Bootstrap Router (BSR) Mechanism for PIM.
- **RFC 3618** — Multicast Source Discovery Protocol (MSDP).
- **RFC 4610** — Anycast-RP Using PIM.
- **RFC 4607** — Source-Specific Multicast for IP.
- Cisco — [Configuring a Rendezvous Point](https://www.cisco.com/c/en/us/td/docs/ios/solutions_docs/ip_multicast/White_papers/rps.html) — the white paper that explains Auto-RP and BSR properly.
- Cisco — [Configuring Basic IP Multicast](https://www.cisco.com/c/en/us/td/docs/routers/ios/config/17-x/ip-multicast/b-ip-multicast/m_imc_basic_cfg-0.html)
- Cisco — [Optimizing PIM Sparse Mode in a Large IP Multicast Deployment](https://www.cisco.com/c/en/us/td/docs/routers/ios-xe/ip-multicast/ip-multicast/m_imc_pim_sparse-0.html) — where the `spt-threshold` behaviour is documented.

---

*Back to [Part 1: addressing, IGMP and the RPF check](/blog/multicast-explained-addressing-igmp-and-rpf).*

*Part of the [CCNA, ENCOR and ENARSI topic-by-topic study guide](/blog/ccna-ccnp-study-guide).*
