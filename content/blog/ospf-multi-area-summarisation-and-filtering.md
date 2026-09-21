---
title: "OSPF Beyond One Area: ABRs, LSA Types, Summarisation and What You Can Actually Filter"
excerpt: "One area works until it doesn't. Areas exist to stop a link flap in one corner recomputing the whole network — but only if you summarise at the boundary, and summarisation is the one thing you can only do in two specific places. Here is why, and what each area type hides."
date: "2026-09-14"
tags: ["OSPF", "Routing", "LSA", "Summarisation", "CCNP", "ENCOR", "ENARSI"]
draft: false
---

> **Blueprint:** ENCOR 350-401 — 3.2.b *Configure simple OSPFv2/v3 environments, including multiple normal areas, summarization, and filtering (neighbor adjacency, point-to-point and broadcast network types, and passive-interface)*. ENARSI 300-410 — 1.10.c *Network types, area types, and router types*, 1.5 *Troubleshoot manual and auto-summarization*.
>
> Assumes you have the single-area picture. If not, start with [OSPF explained: areas, LSAs and adjacency](/blog/ospf-explained-areas-lsas-and-adjacency).

## Cheat sheet

| | |
|---|---|
| **Why areas** | Limit the scope of SPF. A flap in area 2 must not recompute area 1. |
| **Area 0** | The backbone. Every other area must touch it. |
| **ABR** | Sits in two or more areas, one of them area 0. Generates Type 3. |
| **ASBR** | Redistributes external routes in. Generates Type 5. |
| **Type 1 Router LSA** | Every router, within its area. Never crosses an ABR. |
| **Type 2 Network LSA** | The DR, per multi-access segment. Within the area. |
| **Type 3 Summary LSA** | ABR. A prefix from another area. **Not** automatically summarised. |
| **Type 4 ASBR Summary** | ABR. How to reach the ASBR. |
| **Type 5 External** | ASBR. Flooded everywhere except stub areas. |
| **Type 7 NSSA External** | ASBR inside an NSSA. Converted to Type 5 by the ABR. |
| **Summarise inter-area** | `area X range` — **on the ABR only** |
| **Summarise external** | `summary-address` — **on the ASBR only** |
| **Stub** | No Type 5. Default route instead. |
| **Totally stubby** | No Type 5 **and** no Type 3. Cisco proprietary. |
| **NSSA** | Stub that may still have its own ASBR. Type 7 instead of Type 5. |

---

## What a single area actually costs you

In one area, every router holds an identical link-state database and runs Dijkstra over all of it. That is the design's strength — everybody has the same map, so there are no routing loops by construction.

It is also the cost. **Every topology change floods to every router, and every router reruns SPF over the entire network.** One flapping interface in a branch office recomputes the shortest path tree on the core. At fifty routers that is noticeable. At five hundred it is a problem.

Areas fix it by putting a wall in the way.

<figure class="fig">
<svg class="sv1" viewBox="0 0 640 250" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Three OSPF areas joined through area 0 with ABRs at the boundaries">
  <style>.sv1 .ar{ fill:#F1EEE9; stroke:#B5B5BC; stroke-width:1.5 }.sv1 .bb{ fill:#FFE0E5; stroke:#D3002D; stroke-width:1.5 }.sv1 .r{ fill:#17171A }.sv1 .abr{ fill:#D3002D }.sv1 .asbr{ fill:#1f9d6b }.sv1 .rt{ fill:#FAF8F5; font-family:ui-sans-serif,system-ui; font-size:10px; font-weight:700 }.sv1 .at{ font-family:ui-sans-serif,system-ui; font-size:12px; font-weight:800; fill:#5C5C64 }.sv1 .abt{ font-family:ui-sans-serif,system-ui; font-size:12px; font-weight:800; fill:#D3002D }.sv1 .l{ stroke:#8A8A93; stroke-width:1.5 }.sv1 .s{ font-family:ui-sans-serif,system-ui; font-size:9.5px; fill:#5C5C64 }
  </style>
  <rect class="bb" x="210" y="20" width="220" height="86" rx="4"/>
  <text class="abt" x="320" y="40" text-anchor="middle">AREA 0 · BACKBONE</text>
  <rect class="ar" x="20" y="140" width="180" height="86" rx="4"/>
  <text class="at" x="110" y="218" text-anchor="middle">AREA 1 · normal</text>
  <rect class="ar" x="440" y="140" width="180" height="86" rx="4"/>
  <text class="at" x="530" y="218" text-anchor="middle">AREA 2 · totally stubby</text>
  <line class="l" x1="150" y1="160" x2="255" y2="86"/>
  <line class="l" x1="490" y1="160" x2="385" y2="86"/>
  <rect class="r" x="290" y="58" width="60" height="26" rx="3"/><text class="rt" x="320" y="75" text-anchor="middle">R-core</text>
  <rect class="abr" x="225" y="58" width="52" height="26" rx="3"/><text class="rt" x="251" y="75" text-anchor="middle">ABR1</text>
  <rect class="abr" x="363" y="58" width="52" height="26" rx="3"/><text class="rt" x="389" y="75" text-anchor="middle">ABR2</text>
  <rect class="asbr" x="34" y="152" width="56" height="26" rx="3"/><text class="rt" x="62" y="169" text-anchor="middle">ASBR</text>
  <rect class="r" x="110" y="152" width="52" height="26" rx="3"/><text class="rt" x="136" y="169" text-anchor="middle">R2</text>
  <rect class="r" x="455" y="152" width="52" height="26" rx="3"/><text class="rt" x="481" y="169" text-anchor="middle">R5</text>
  <rect class="r" x="530" y="152" width="52" height="26" rx="3"/><text class="rt" x="556" y="169" text-anchor="middle">R6</text>
  <text class="s" x="110" y="192" text-anchor="middle">Type 1, 2 stay here</text>
  <text class="s" x="530" y="192" text-anchor="middle">only a default route</text>
  <text class="s" x="320" y="126" text-anchor="middle">ABRs turn Type 1/2 into Type 3 · SPF stops at the boundary</text>
</svg>
<figcaption><b>Figure 1.</b> Type 1 and Type 2 never cross an ABR. What crosses is a Type 3 — a prefix and a cost, with the topology behind it discarded. That discarding is the entire point.</figcaption>
</figure>

<div class="why">
<b>The mechanism, in one sentence</b>
An ABR does not forward the link-state database between areas — it <em>summarises the result</em>. Routers in area 1 learn "10.2.0.0/24 is reachable, cost 30, via the ABR" and know nothing about the links behind it. A flap inside area 2 therefore produces, at most, a changed cost in a Type 3. If the cost does not change, area 1 never hears about it at all, and no router in area 1 reruns SPF.
</div>

---

## The LSA types, and which wall each one stops at

This is the table that makes OSPF make sense. Read it as "who makes it, and how far does it get".

| Type | Name | Originated by | Scope | Carries |
|---|---|---|---|---|
| **1** | Router | Every router | Its own area only | This router's links, their costs, their neighbours |
| **2** | Network | The DR | Its own area only | Which routers are on this multi-access segment |
| **3** | Summary | ABR | Flooded into other areas | A prefix + cost from another area. **Topology removed.** |
| **4** | ASBR Summary | ABR | Flooded into other areas | How to reach the ASBR (not the external routes) |
| **5** | AS External | ASBR | Everywhere except stub/NSSA | A route redistributed from outside OSPF |
| **7** | NSSA External | ASBR in an NSSA | That NSSA only | An external route, converted to Type 5 at the ABR |

Two commonly confused points:

**Type 3 is not summarised.** The name is a historical accident. By default an ABR generates one Type 3 *per prefix* — ten subnets in area 2 means ten Type 3 LSAs in area 0. Summarisation is a separate thing you must configure.

**Type 4 exists because Type 5 does not say where the ASBR is.** A Type 5 says "10.9.0.0/24 is external, via ASBR router-id 1.1.1.1". A router in another area has no idea how to reach 1.1.1.1 — Type 1 LSAs did not cross the boundary. The ABR therefore also emits a Type 4 saying "1.1.1.1 is this way, cost N". No Type 4, no usable Type 5.

---

## Watch one prefix cross two boundaries

The same subnet exists in every router's database, but **it is carried by a different LSA type depending on where you look from** — and each type stops at a wall. Step it through.

<div class="walk">
<div class="walk-head">10.2.0.0/24, from its own area to the far side of the network <span class="walk-hint">click a step</span></div>
<div class="walk-tabs">
  <input type="radio" name="ospfw" id="ow1" checked><label for="ow1"><span class="step-n">1</span>Inside area 2</label>
  <input type="radio" name="ospfw" id="ow2"><label for="ow2"><span class="step-n">2</span>Into the backbone</label>
  <input type="radio" name="ospfw" id="ow3"><label for="ow3"><span class="step-n">3</span>Into area 1</label>
  <input type="radio" name="ospfw" id="ow4"><label for="ow4"><span class="step-n">4</span>Summarised</label>
</div>
<div class="walk-panels">
<div class="walk-panel">
<svg class="sv2" viewBox="0 0 640 215" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A Type 1 never leaves its area. Not summarised, not filtered, not negotiable.">
  <style>.sv2 .n{fill:#17171A}.sv2 .nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:10.5px;font-weight:700}.sv2 .s{font-family:ui-sans-serif,system-ui;font-size:10px;fill:#5C5C64}.sv2 .k{font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.sv2 .ar{font-family:ui-sans-serif,system-ui;font-size:10px;font-weight:700;fill:#8A8A93;letter-spacing:.06em}.sv2 .l{stroke:#8A8A93;stroke-width:1.5}</style>
  <rect x="14" y="40" width="180" height="80" fill="rgba(75,123,236,.07)" stroke="#4b7bec" stroke-dasharray="4 3"/>
  <text class="ar" x="24" y="58" fill="#2b5ab8">AREA 2</text>
  <rect x="230" y="40" width="180" height="80" fill="rgba(31,157,107,.07)" stroke="#1f9d6b" stroke-dasharray="4 3"/>
  <text class="ar" x="240" y="58" fill="#0f6b47">AREA 0 — BACKBONE</text>
  <rect x="446" y="40" width="180" height="80" fill="rgba(242,153,74,.07)" stroke="#F2994A" stroke-dasharray="4 3"/>
  <text class="ar" x="456" y="58" fill="#B26014">AREA 1</text>
  <rect class="n" x="30" y="72" width="66" height="30" rx="3" opacity="1"/><text class="nt" x="63" y="92" text-anchor="middle" opacity="1">R1</text>
  <rect class="n" x="180" y="72" width="66" height="30" rx="3" opacity="1" fill="#D3002D"/><text class="nt" x="213" y="92" text-anchor="middle" opacity="1">ABR1</text>
  <rect class="n" x="300" y="72" width="66" height="30" rx="3" opacity="0.28"/><text class="nt" x="333" y="92" text-anchor="middle" opacity="0.28">R5</text>
  <rect class="n" x="396" y="72" width="66" height="30" rx="3" opacity="0.28" fill="#D3002D"/><text class="nt" x="429" y="92" text-anchor="middle" opacity="0.28">ABR2</text>
  <rect class="n" x="540" y="72" width="66" height="30" rx="3" opacity="0.28"/><text class="nt" x="573" y="92" text-anchor="middle" opacity="0.28">R9</text>
  <line class="l" x1="96" y1="87" x2="180" y2="87"/>
  <line class="l" x1="246" y1="87" x2="300" y2="87"/>
  <line class="l" x1="366" y1="87" x2="396" y2="87"/>
  <line class="l" x1="462" y1="87" x2="540" y2="87"/>
  <text class="s" x="63" y="118" text-anchor="middle" fill="#2b5ab8">originates</text>
  <text class="k" x="130" y="150" text-anchor="middle" fill="#2b5ab8">Type 1 Router LSA — flooded within area 2 only</text>
  <text class="s" x="130" y="168" text-anchor="middle">Every router in area 2 holds an identical copy and runs SPF over it.</text>
  <text class="k" x="14" y="200" fill="#2b5ab8">A Type 1 never leaves its area. Not summarised, not filtered, not negotiable.</text>
</svg>
<p class="walk-say"><span class="walk-title">Inside the area — full detail, and it stays here</span>
R1 describes its own links in a <b>Type 1 Router LSA</b>, flooded to every router in area 2 and nowhere else. Type 2 Network LSAs describe multi-access segments alongside it. Together they are the area's map, and <b>every router in the area must hold an identical copy</b> — that is what makes SPF produce consistent, loop-free results.
<br><br>It is also why you cannot summarise or filter inside an area. Two routers with different maps would run Dijkstra over different topologies, and the results would not agree.</p>
</div>
<div class="walk-panel">
<svg class="sv3" viewBox="0 0 640 215" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The ABR is a translator, and this is the only place a Type 3 is born.">
  <style>.sv3 .n{fill:#17171A}.sv3 .nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:10.5px;font-weight:700}.sv3 .s{font-family:ui-sans-serif,system-ui;font-size:10px;fill:#5C5C64}.sv3 .k{font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.sv3 .ar{font-family:ui-sans-serif,system-ui;font-size:10px;font-weight:700;fill:#8A8A93;letter-spacing:.06em}.sv3 .l{stroke:#8A8A93;stroke-width:1.5}</style>
  <rect x="14" y="40" width="180" height="80" fill="rgba(75,123,236,.07)" stroke="#4b7bec" stroke-dasharray="4 3"/>
  <text class="ar" x="24" y="58" fill="#2b5ab8">AREA 2</text>
  <rect x="230" y="40" width="180" height="80" fill="rgba(31,157,107,.07)" stroke="#1f9d6b" stroke-dasharray="4 3"/>
  <text class="ar" x="240" y="58" fill="#0f6b47">AREA 0 — BACKBONE</text>
  <rect x="446" y="40" width="180" height="80" fill="rgba(242,153,74,.07)" stroke="#F2994A" stroke-dasharray="4 3"/>
  <text class="ar" x="456" y="58" fill="#B26014">AREA 1</text>
  <rect class="n" x="30" y="72" width="66" height="30" rx="3" opacity="0.28"/><text class="nt" x="63" y="92" text-anchor="middle" opacity="0.28">R1</text>
  <rect class="n" x="180" y="72" width="66" height="30" rx="3" opacity="1" fill="#D3002D"/><text class="nt" x="213" y="92" text-anchor="middle" opacity="1">ABR1</text>
  <rect class="n" x="300" y="72" width="66" height="30" rx="3" opacity="1"/><text class="nt" x="333" y="92" text-anchor="middle" opacity="1">R5</text>
  <rect class="n" x="396" y="72" width="66" height="30" rx="3" opacity="0.28" fill="#D3002D"/><text class="nt" x="429" y="92" text-anchor="middle" opacity="0.28">ABR2</text>
  <rect class="n" x="540" y="72" width="66" height="30" rx="3" opacity="0.28"/><text class="nt" x="573" y="92" text-anchor="middle" opacity="0.28">R9</text>
  <line class="l" x1="96" y1="87" x2="180" y2="87"/>
  <line class="l" x1="246" y1="87" x2="300" y2="87"/>
  <line class="l" x1="366" y1="87" x2="396" y2="87"/>
  <line class="l" x1="462" y1="87" x2="540" y2="87"/>
  <text class="s" x="213" y="130" text-anchor="middle" fill="#B80027">ABR: translates</text>
  <text class="k" x="330" y="150" text-anchor="middle" fill="#0f6b47">Type 3 Summary LSA — &#8220;10.2.0.0/24 is reachable through me, cost 30&#8221;</text>
  <text class="s" x="330" y="168" text-anchor="middle">The topology of area 2 is gone. Only the prefix and a cost survive.</text>
  <text class="k" x="14" y="200" fill="#0f6b47">The ABR is a translator, and this is the only place a Type 3 is born.</text>
</svg>
<p class="walk-say"><span class="walk-title">At the ABR — detail becomes a distance</span>
The ABR does not forward the Type 1. It <b>originates a new Type 3 Summary LSA</b> that says only "this prefix is reachable via me, at this cost". Everything about area 2's internal topology is discarded at the boundary.
<br><br>That is the real reason multi-area OSPF scales: a router in the backbone runs SPF over the backbone's topology and treats every other area as <b>a list of prefixes with distances</b> — which is distance-vector behaviour, bolted onto a link-state protocol precisely at the boundary. It is also why a flap inside area 2 does not trigger a full SPF everywhere: it only changes a cost in a Type 3.</p>
</div>
<div class="walk-panel">
<svg class="sv4" viewBox="0 0 640 215" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Type 3 LSAs are re-originated at each ABR, never forwarded.">
  <style>.sv4 .n{fill:#17171A}.sv4 .nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:10.5px;font-weight:700}.sv4 .s{font-family:ui-sans-serif,system-ui;font-size:10px;fill:#5C5C64}.sv4 .k{font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.sv4 .ar{font-family:ui-sans-serif,system-ui;font-size:10px;font-weight:700;fill:#8A8A93;letter-spacing:.06em}.sv4 .l{stroke:#8A8A93;stroke-width:1.5}</style>
  <rect x="14" y="40" width="180" height="80" fill="rgba(75,123,236,.07)" stroke="#4b7bec" stroke-dasharray="4 3"/>
  <text class="ar" x="24" y="58" fill="#2b5ab8">AREA 2</text>
  <rect x="230" y="40" width="180" height="80" fill="rgba(31,157,107,.07)" stroke="#1f9d6b" stroke-dasharray="4 3"/>
  <text class="ar" x="240" y="58" fill="#0f6b47">AREA 0 — BACKBONE</text>
  <rect x="446" y="40" width="180" height="80" fill="rgba(242,153,74,.07)" stroke="#F2994A" stroke-dasharray="4 3"/>
  <text class="ar" x="456" y="58" fill="#B26014">AREA 1</text>
  <rect class="n" x="30" y="72" width="66" height="30" rx="3" opacity="0.28"/><text class="nt" x="63" y="92" text-anchor="middle" opacity="0.28">R1</text>
  <rect class="n" x="180" y="72" width="66" height="30" rx="3" opacity="0.28" fill="#D3002D"/><text class="nt" x="213" y="92" text-anchor="middle" opacity="0.28">ABR1</text>
  <rect class="n" x="300" y="72" width="66" height="30" rx="3" opacity="1"/><text class="nt" x="333" y="92" text-anchor="middle" opacity="1">R5</text>
  <rect class="n" x="396" y="72" width="66" height="30" rx="3" opacity="1" fill="#D3002D"/><text class="nt" x="429" y="92" text-anchor="middle" opacity="1">ABR2</text>
  <rect class="n" x="540" y="72" width="66" height="30" rx="3" opacity="1"/><text class="nt" x="573" y="92" text-anchor="middle" opacity="1">R9</text>
  <line class="l" x1="96" y1="87" x2="180" y2="87"/>
  <line class="l" x1="246" y1="87" x2="300" y2="87"/>
  <line class="l" x1="366" y1="87" x2="396" y2="87"/>
  <line class="l" x1="462" y1="87" x2="540" y2="87"/>
  <text class="s" x="429" y="130" text-anchor="middle" fill="#B80027">ABR2: re-originates</text>
  <text class="k" x="380" y="150" text-anchor="middle" fill="#B26014">A <tspan font-style="italic">new</tspan> Type 3 — ABR2 does not relay ABR1's, it creates its own</text>
  <text class="s" x="380" y="168" text-anchor="middle">Which is why every inter-area path must cross area 0, and why a virtual link exists.</text>
  <text class="k" x="14" y="200" fill="#B26014">Type 3 LSAs are re-originated at each ABR, never forwarded.</text>
</svg>
<p class="walk-say"><span class="walk-title">Into area 1 — and why the backbone is mandatory</span>
ABR2 does not pass ABR1's LSA along. It <b>creates its own Type 3</b>, advertising the prefix at its own cost, into area 1. An ABR only accepts Type 3s from <b>area 0</b> for re-origination into a non-backbone area.
<br><br>That single rule is the reason every inter-area path must transit the backbone, the reason two non-backbone areas cannot exchange routes directly, and the reason <b>virtual links</b> exist — a virtual link is a way to say "pretend this path is part of area 0" when a new area cannot be physically attached to it.</p>
</div>
<div class="walk-panel">
<svg class="sv5" viewBox="0 0 640 215" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Summarisation happens at the boundary, or not at all.">
  <style>.sv5 .n{fill:#17171A}.sv5 .nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:10.5px;font-weight:700}.sv5 .s{font-family:ui-sans-serif,system-ui;font-size:10px;fill:#5C5C64}.sv5 .k{font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.sv5 .ar{font-family:ui-sans-serif,system-ui;font-size:10px;font-weight:700;fill:#8A8A93;letter-spacing:.06em}.sv5 .l{stroke:#8A8A93;stroke-width:1.5}</style>
  <rect x="14" y="40" width="180" height="80" fill="rgba(75,123,236,.07)" stroke="#4b7bec" stroke-dasharray="4 3"/>
  <text class="ar" x="24" y="58" fill="#2b5ab8">AREA 2</text>
  <rect x="230" y="40" width="180" height="80" fill="rgba(31,157,107,.07)" stroke="#1f9d6b" stroke-dasharray="4 3"/>
  <text class="ar" x="240" y="58" fill="#0f6b47">AREA 0 — BACKBONE</text>
  <rect x="446" y="40" width="180" height="80" fill="rgba(242,153,74,.07)" stroke="#F2994A" stroke-dasharray="4 3"/>
  <text class="ar" x="456" y="58" fill="#B26014">AREA 1</text>
  <rect class="n" x="30" y="72" width="66" height="30" rx="3" opacity="0.28"/><text class="nt" x="63" y="92" text-anchor="middle" opacity="0.28">R1</text>
  <rect class="n" x="180" y="72" width="66" height="30" rx="3" opacity="1" fill="#D3002D"/><text class="nt" x="213" y="92" text-anchor="middle" opacity="1">ABR1</text>
  <rect class="n" x="300" y="72" width="66" height="30" rx="3" opacity="1"/><text class="nt" x="333" y="92" text-anchor="middle" opacity="1">R5</text>
  <rect class="n" x="396" y="72" width="66" height="30" rx="3" opacity="1" fill="#D3002D"/><text class="nt" x="429" y="92" text-anchor="middle" opacity="1">ABR2</text>
  <rect class="n" x="540" y="72" width="66" height="30" rx="3" opacity="0.28"/><text class="nt" x="573" y="92" text-anchor="middle" opacity="0.28">R9</text>
  <line class="l" x1="96" y1="87" x2="180" y2="87"/>
  <line class="l" x1="246" y1="87" x2="300" y2="87"/>
  <line class="l" x1="366" y1="87" x2="396" y2="87"/>
  <line class="l" x1="462" y1="87" x2="540" y2="87"/>
  <text class="s" x="213" y="130" text-anchor="middle" fill="#B80027">area 2 range</text>
  <text class="k" x="360" y="150" text-anchor="middle" fill="#0f6b47">One Type 3 for 10.2.0.0/22 instead of four /24s</text>
  <text class="s" x="360" y="168" text-anchor="middle">Plus a discard route to Null0 on ABR1, so a packet for a non-existent subnet cannot loop.</text>
  <text class="k" x="14" y="200" fill="#0f6b47">Summarisation happens at the boundary, or not at all.</text>
</svg>
<p class="walk-say"><span class="walk-title">Summarised — four LSAs become one</span>
Because the ABR is already re-originating, it can just as easily originate <b>one</b> LSA covering a range instead of four covering individual subnets. That is <code>area 2 range</code>, and it is configured on the ABR because the ABR is the only device that creates these LSAs in the first place.
<br><br>Two consequences worth knowing. The summary's cost is the <b>lowest</b> of its components by default, so a summary can look better than any real path to some of the subnets inside it. And the ABR installs a <b>discard route to Null0</b> — without it, a packet for a subnet inside the range that does not exist would be forwarded back toward the summary and loop.</p>
</div>
</div>
</div>

## Summarisation: two commands, two places, and no third option

**This is the most commonly examined fact in the topic**, and the most commonly got wrong in production.

<div class="cmd">
<div class="cmd-line">router ospf 1
 <span class="t">area</span> <span class="opt">2</span> <span class="t">range</span> <span class="opt">10.2.0.0 255.255.252.0</span>      <span class="opt">! on the ABR</span>
 <span class="t">summary-address</span> <span class="opt">172.16.0.0 255.255.0.0</span>     <span class="opt">! on the ASBR</span></div>
<dl class="cmd-parts">
<div class="is-key"><dt>area 2 range</dt><dd>Summarises <b>Type 3 inter-area</b> routes, and is configured on the <b>ABR</b> — because the ABR is the only device that originates Type 3 LSAs at all. <b><code>area 2</code> names the area the routes came <em>from</em></b>, not the area you are advertising into. Getting that backwards produces a command that is accepted and does nothing, which is why this is the most-examined fact in the topic.</dd></div>
<div class="is-key"><dt>summary-address</dt><dd>Summarises <b>Type 5 external</b> routes (and Type 7 in an NSSA), and is configured on the <b>ASBR</b> — again, the device that originates them. The two commands are not interchangeable: <code>area range</code> on an ASBR does nothing to redistributed routes, and <code>summary-address</code> on an ABR does nothing to inter-area ones.</dd></div>
<div><dt>(the cost)</dt><dd>The summary inherits the <b>lowest</b> cost among its components by default, so it can advertise a better metric than the real path to some subnets inside the range. Pin it deliberately with <code>area 2 range 10.2.0.0 255.255.252.0 cost 100</code> when that matters.</dd></div>
<div><dt>(not-advertise)</dt><dd>Adding <code>not-advertise</code> to an <code>area range</code> suppresses the range entirely instead of summarising it — which is how you filter Type 3 LSAs at an ABR. It is one of very few places OSPF lets you drop anything at all.</dd></div>
<div><dt>(the discard route)</dt><dd>Both commands install a route to <b>Null0</b> for the summarised range. That is deliberate and not a fault: it stops a packet destined for a subnet <em>inside</em> the range that does not actually exist from being forwarded back toward the summary and looping.</dd></div>
</dl>
</div>

| | `area X range` | `summary-address` |
|---|---|---|
| Configured on | **ABR** | **ASBR** |
| Summarises | Type 3 (inter-area) | Type 5 / 7 (external) |
| `area X` means | the area the routes came **from** | — |

<div class="warn">
<b>OSPF cannot summarise in the middle</b>
Unlike EIGRP, which summarises on any interface you like, OSPF can only summarise at a boundary — because everywhere else, every router must hold an identical database for SPF to be correct. Summarising in the middle of an area would give two routers different maps, and Dijkstra over different maps produces loops. This is a consequence of link state, not a Cisco limitation.
</div>

The ABR also installs a **discard route to Null0** for the summary. That is deliberate: it stops a packet for a subnet inside the range that does not actually exist from being forwarded back out and looping.

<div class="term">
<div class="term-bar"><span class="term-dots"><i></i><i></i><i></i></span>ABR1 — the summary, the discard route, and the database</div>
<pre><span class="p">ABR1#</span> <span class="c">show ip route 10.2.0.0</span>
O    10.2.0.0/22 is a summary, 00:04:12, <span class="y">Null0</span>
<span class="o">! Not a fault. This is the loop guard that comes with every summary.</span>

<span class="p">ABR1#</span> <span class="c">show ip ospf database summary 10.2.0.0</span>
            OSPF Router with ID (10.255.255.1) (Process ID 1)

                Summary Net Link States (Area 0)
  LS age: 412
  Options: (No TOS-capability, DC, Upward)
  LS Type: <span class="y">Summary Links(Network)</span>
  Link State ID: 10.2.0.0 (summary Network Number)
  Advertising Router: <span class="y">10.255.255.1</span>      <span class="o">&lt;- the ABR originates it, not R1</span>
  Network Mask: /22
        TOS: 0  Metric: <span class="g">30</span>                <span class="o">&lt;- lowest of the components, unless pinned</span>

<span class="p">ABR1#</span> <span class="c">show ip ospf database database-summary</span>
            Process 1 database summary
  LSA Type      Count    Delete   Maxage
  Router          14        0        0     <span class="o">&lt;- Type 1, per area</span>
  Network          3        0        0     <span class="o">&lt;- Type 2</span>
  <span class="y">Summary Net      6        0        0</span>     <span class="o">&lt;- Type 3. This is the number summarisation reduces.</span>
  Summary ASBR     1        0        0     <span class="o">&lt;- Type 4</span>
  Type-7 Ext       0        0        0
  Opaque Link      0        0        0
  <span class="y">Type-5 Ext      42        0        0</span>     <span class="o">&lt;- floods everywhere. This is what a stub area removes.</span><span class="cur"></span></pre>
</div>
<p class="term-cap"><b><code>show ip ospf database database-summary</code> is the command that turns this topic into numbers.</b> Before and after a summarisation change, compare the Summary Net count; before and after making an area stub, compare the Type-5 count. Those two numbers are the entire argument for both features, measured on your own network rather than assumed.</p>

Cost of the summary is the **lowest** cost among the component routes by default. `area 2 range 10.2.0.0 255.255.252.0 cost 100` pins it.

---

## The stub family: what each one refuses to carry

Areas can decline LSA types they do not need. Each step up hides more and installs a default route in its place.

| Area type | Type 3 | Type 5 | Type 7 | Gets a default | Can hold an ASBR |
|---|---|---|---|---|---|
| **Normal** | yes | yes | — | no | yes |
| **Stub** | yes | **no** | — | yes | no |
| **Totally stubby** | **no** | **no** | — | yes | no |
| **NSSA** | yes | **no** | **yes** | optional | **yes** |
| **Totally NSSA** | **no** | **no** | **yes** | yes | **yes** |

```cisco
! Stub — every router in the area
router ospf 1
 area 2 stub

! Totally stubby — "no-summary" ONLY on the ABR
router ospf 1
 area 2 stub no-summary

! NSSA — a stub that still needs to redistribute something
router ospf 1
 area 2 nssa

! Totally NSSA — again, no-summary only on the ABR
 area 2 nssa no-summary
```

**The NSSA exists for one situation:** you want a stub area — no external LSAs flooding in — but that area has its own connection to something outside OSPF that must be redistributed. A stub area forbids an ASBR outright. The NSSA permits one, and gives its externals a private LSA type (7) that lives only inside that area. The ABR translates Type 7 to Type 5 on the way out.

<details class="spoiler">
<summary>Which router translates Type 7, when there are two ABRs?</summary>

The ABR with the **highest router ID** in the NSSA performs the translation. The other stands by. This prevents duplicate Type 5 LSAs for the same prefix entering the backbone.

You can force it with `area 2 nssa translate type7 always`, which is occasionally needed when the natural translator is the wrong exit point for traffic. Be careful setting it on both ABRs — that is exactly the duplicate the election exists to avoid.
</details>

---

## Filtering: what OSPF will and will not let you drop

OSPF resists filtering by design, and knowing where it gives way saves a lot of wasted effort.

**Inside an area: you cannot.** Every router must have the same database. There is no supported way to stop a Type 1 reaching a router in its own area. Anything that appears to do this is filtering the *routing table*, not the database.

**At an ABR: you can, three ways.**

```cisco
! 1. Filter Type 3 LSAs entering or leaving an area
router ospf 1
 area 2 filter-list prefix BLOCK-THESE in

! 2. Suppress a summary entirely rather than advertising it
 area 2 range 10.2.8.0 255.255.252.0 not-advertise

! 3. Stop routes entering the local routing table (database untouched)
 distribute-list prefix NO-INSTALL in
```

The third is the one to be careful with. `distribute-list ... in` on OSPF does **not** stop the LSA — the database still holds it, and it is still flooded onward. It only stops the route being installed locally. Use it to fix one router; never rely on it to contain information.

**At an ASBR: filter at redistribution**, which is the cleanest place of all.

```cisco
router ospf 1
 redistribute eigrp 100 subnets route-map ONLY-THESE
```

---

## Passive interfaces, and the mistake that follows

```cisco
router ospf 1
 passive-interface default
 no passive-interface GigabitEthernet0/0
```

A passive interface **still advertises its subnet** into OSPF — it just stops sending hellos, so no adjacency can form over it. That is exactly what you want on a user VLAN: the prefix is reachable, but nobody can plug in a rogue router and peer with you.

The mistake is applying it to a transit link and then wondering why the neighbour never comes up. `show ip ospf interface brief` will not show a passive interface at all, which is a useful diagnostic in itself: **an interface you expect to see in that output but do not is almost always passive.**

---

## What goes wrong

**Area 1 cannot reach area 2.** Every area must touch area 0. Traffic between two non-backbone areas always transits the backbone. If they are joined directly, they do not form a valid topology — the ABRs will not generate the Type 3s you expect. Fix the design, or bridge it with a virtual link as a temporary measure.

**A stub area is not forming adjacencies.** The stub flag is carried in the hello and **must match on every router in the area**. One router without `area 2 stub` sits there with a mismatched E-bit and never reaches FULL. Check `show ip ospf` for the area's flags.

**`no-summary` configured everywhere.** It belongs on the ABR only. On an internal router it is accepted and does nothing useful, which hides the real problem.

**Summarisation configured but nothing summarised.** Check you put `area X range` on the ABR and that `X` is the area the routes came *from*, not the one you are advertising into. This is the single most common slip.

**External routes vanish in another area.** Look for the Type 4. Without it the Type 5 is unusable, and a missing Type 4 usually means the ABR does not have a route to the ASBR's router ID.

**Every router reruns SPF constantly.** `show ip ospf statistics` shows SPF runs and what triggered them. Frequent runs with no config change means a flapping interface somewhere in the same area — and the fact that it is reaching you is the argument for another area boundary.

---

<div class="lab">
<div class="lab-head">Lab — build the boundary and watch what each wall stops</div>
<div class="lab-body">

**Build:** six routers. Area 0 with two ABRs and a core router. Area 1 hanging off ABR1 with two routers, one of which redistributes a few static routes (making it an ASBR). Area 2 hanging off ABR2 with two routers. Use /24s you can summarise — 10.1.0.0/24 through 10.1.3.0/24 in area 1, 10.2.0.0/24 through 10.2.3.0/24 in area 2.

**Task 1 — see the database split.**
With everything as normal areas, run `show ip ospf database` on a router in area 1 and on one in area 2. Confirm that area 1's Type 1 LSAs do **not** appear in area 2. Count the Type 3s in each. Record the numbers.

**Task 2 — prove Type 3 is not summarised.**
Count the Type 3 LSAs in area 0 for area 2's prefixes. There should be one per subnet. Now on ABR2: `area 2 range 10.2.0.0 255.255.252.0`. Re-count. Confirm four became one, and find the Null0 discard route on ABR2.

**Task 3 — summarise externals, in the right place.**
On the ASBR in area 1, `summary-address` the static routes into one prefix. Confirm from area 2 that only the summary appears. Then try the same command on ABR1 and confirm it does nothing — this is the lesson.

**Task 4 — make area 2 stub, and watch Type 5 disappear.**
`area 2 stub` on ABR2 and both area 2 routers. Confirm the external routes vanish from area 2's database and a default route appears. Now deliberately remove it from **one** router and watch the adjacency fail — record what `show ip ospf neighbor` and the log say.

**Task 5 — totally stubby.**
Add `no-summary` on ABR2 only. Confirm area 2's routers now carry a default route and almost nothing else. Compare `show ip route | count` before and after.

**Task 6 — NSSA.**
Move the ASBR into area 2 instead. Confirm you cannot make area 2 stub with an ASBR present. Change it to `nssa`, redistribute, and find the **Type 7** in area 2's database and the corresponding **Type 5** in area 0. Identify which ABR performed the translation and confirm it is the one with the higher router ID.

**Task 7 — passive interface.**
Make a transit link passive on one side. Watch the adjacency drop. Confirm the subnet is still advertised. Confirm the interface disappears from `show ip ospf interface brief`.

**Record:** LSA counts per area before and after each change. That table — four numbers per area type — is the whole topic on one page.

</div>
</div>

---

<div class="real">
<b>In the real world</b>
The argument for multi-area OSPF is almost never made with the right number. People cite router count, when what actually matters is <b>how often the database changes</b>. A single area with 200 stable routers is fine; a single area with 40 routers and one flapping WAN circuit is not, because every flap re-floods an LSA and triggers SPF on all 40. Before redesigning anything, run <code>show ip ospf</code> and look at <b>&#8220;SPF algorithm executed&#8221;</b> — that count, over a week, is the real evidence. If it is in the thousands, area boundaries will help; if it is in the dozens, they will add complexity and fix nothing.
</div>

<div class="lab">
<div class="lab-head">Lab — split one area into three, then measure what you bought</div>
<div class="lab-body">

<div class="lab-target"><b>Target</b>
Start with a single-area OSPF network and measure its database and SPF behaviour; split it into a backbone and two areas and measure again; summarise at one ABR and count the LSAs that disappear; make an area stub, then totally stubby, and watch the external LSAs vanish; and finally produce the three classic multi-area faults — a summarisation command on the wrong device, an area not touching the backbone, and a stub area that cannot reach the internet.</div>

**Topology.** Six routers: R1 and R2 in what will become area 2, R5 and R6 in the backbone, R9 and R10 in what will become area 1. ABR1 sits between area 2 and the backbone, ABR2 between the backbone and area 1. One router redistributes a handful of external routes to act as an ASBR. Loopbacks 10.2.0.0/24 through 10.2.3.0/24 in area 2.

<p class="lab-step"><span class="n">1</span>Measure the single-area baseline</p>

With everything in area 0:

```cisco
R9# show ip ospf database database-summary
R9# show ip ospf | include SPF algorithm
```

Write both numbers down. Then flap a link in area 2 a few times and re-check the SPF count on **R9, at the far end of the network**.

<div class="lab-watch"><b>Things to notice</b>
R9 runs SPF every time a link flaps four hops away in a part of the network it has no interest in. That is the cost of a single area, and it is a number you now own rather than a claim from a design guide. Keep it — you are going to compare against it twice.</div>

<p class="lab-step"><span class="n">2</span>Split into three areas and measure again</p>

Move R1, R2 and ABR1's inward interface into area 2; R9, R10 and ABR2's inward interface into area 1.

Repeat exactly the same flap test and the same two commands.

<div class="lab-watch"><b>Things to notice</b>
R9's SPF count barely moves now. The flap changes a cost inside a Type 3 LSA rather than the topology R9 computes over, so R9 does a <b>partial</b> recalculation instead of a full SPF. Compare the database summary too: R9 now holds Type 3s where it used to hold a copy of area 2's entire Type 1 and Type 2 set.
<br><br>Look at <code>show ip ospf border-routers</code> on R9 and note it now tracks ABRs explicitly — that is the machinery that replaced knowing the topology.</div>

<p class="lab-step"><span class="n">3</span>Summarise, and count what disappears</p>

```cisco
! ABR1
router ospf 1
 area 2 range 10.2.0.0 255.255.252.0
```

<div class="lab-watch"><b>Things to notice</b>
Four Type 3 LSAs become one, everywhere outside area 2. Confirm the count changed with <code>show ip ospf database database-summary</code> on R9, and confirm the <b>Null0 discard route</b> appeared on ABR1.
<br><br>Then test the discard route's purpose directly: ping <code>10.2.2.99</code>, an address inside the summarised range that does not exist anywhere. It is dropped at ABR1 rather than being forwarded back toward the summary. Remove the range and note the summary route and the Null0 entry disappear together.</div>

<p class="lab-step"><span class="n">4</span>Put the command on the wrong device, on purpose</p>

Try `area 2 range` on R1 — an internal router. Then try it on the ASBR for the external routes. Then try `summary-address` on ABR1 for the inter-area routes.

<div class="lab-issues"><b>Possible issues</b>
<ul>
<li><b>The command is accepted and nothing happens</b> — that is the finding, and it is the point of this step. OSPF does not reject these; they are simply inert on a device that does not originate the LSA type in question.</li>
<li><b>You cannot tell whether it worked</b> — check the LSA count on a router in another area, not the one you typed the command on.</li>
<li><b>Summarising area 2 from ABR2 appears to work</b> — check carefully which area the routes came from. <code>area 2 range</code> on ABR2 refers to ABR2's own attachment to area 2, which it does not have.</li>
</ul>
Write down, in your own words, the rule that explains all three results: <b>summarisation happens where the LSA is originated, and nowhere else.</b></div>

<p class="lab-step"><span class="n">5</span>Make area 1 stub, then totally stubby</p>

```cisco
! ABR2 and every router in area 1
router ospf 1
 area 1 stub
! then, on ABR2 only
 area 1 stub no-summary
```

<div class="lab-watch"><b>Things to notice</b>
After <code>stub</code>: the Type-5 count on R9 drops to zero and a default route appears instead. After <code>no-summary</code>: the Type 3 count collapses too, leaving R9 with almost nothing but its own area and a default.
<br><br>Compare R9's full database before and after. On a real campus this is the difference between an access switch holding thousands of LSAs and holding a handful — and unlike summarisation it costs you nothing but the ability to make granular path choices from inside that area, which an access layer never needed.</div>

<p class="lab-step"><span class="n">6</span>Break it in the two classic ways</p>

1. **An area that does not touch the backbone.** Add area 3 hanging off ABR2 with no path to area 0, and try to reach it from area 2.
2. **A stub area that needs an ASBR.** Try to redistribute a route into area 1 while it is stub.

<div class="lab-watch"><b>Things to notice</b>
The first fails because an ABR only re-originates Type 3s <b>from area 0</b> — the prefixes exist in ABR2's database and simply never reach anybody else. Fix it with a virtual link and watch them appear, then note in your own words why a virtual link is a workaround rather than a design.
<br><br>The second is refused outright: a stub area <b>cannot contain an ASBR</b>, because Type 5 LSAs are exactly what stub means to exclude. Convert it to an <b>NSSA</b> and the redistribution succeeds — carried as Type 7 inside the area and translated to Type 5 by the ABR on the way out. Find that translation in <code>show ip ospf database</code> on both sides of ABR2; seeing the same route as a Type 7 on one side and a Type 5 on the other is the clearest possible explanation of what NSSA is for.</div>

<div class="lab-earned"><b>What you earned</b>
You can justify a multi-area design with an SPF count from a real network instead of a rule of thumb. You know that summarisation happens only where the LSA is originated, because you watched the same command do nothing on three different wrong devices. You have measured what stub and totally stubby actually remove rather than trusting the table. And you have seen a route change LSA type as it crosses a boundary — Type 1 to Type 3, Type 7 to Type 5 — which is the single mental model that makes the whole LSA table stop being something to memorise.</div>

</div>
</div>

---

## Test yourself

<div class="qz">
<p class="qz-q"><span class="qz-num">Q1</span>Where do you configure <code>area 2 range 10.2.0.0 255.255.252.0</code>?</p>
<label class="qz-opt"><input type="radio" name="om1"><span>On any router inside area 2</span><em class="qz-fb qz-bad">OSPF can only summarise at a boundary — every router inside an area needs an identical database.</em></label>
<label class="qz-opt"><input type="radio" name="om1"><span>On the ABR between area 2 and the backbone</span><em class="qz-fb qz-good">Correct. area X range goes on the ABR, and X is the area the routes came from. summary-address is the ASBR equivalent for external routes.</em></label>
<label class="qz-opt"><input type="radio" name="om1"><span>On the ASBR that originated the routes</span><em class="qz-fb qz-bad">That is summary-address, and it only applies to Type 5 externals.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q2</span>An area must hold an ASBR but you still want to keep Type 5 LSAs out. Which area type?</p>
<label class="qz-opt"><input type="radio" name="om2"><span>Stub</span><em class="qz-fb qz-bad">A stub area cannot contain an ASBR at all.</em></label>
<label class="qz-opt"><input type="radio" name="om2"><span>NSSA</span><em class="qz-fb qz-good">Exactly what it exists for. The local ASBR generates Type 7, which lives only inside the NSSA, and the ABR with the highest router ID translates it to Type 5 on the way out.</em></label>
<label class="qz-opt"><input type="radio" name="om2"><span>Totally stubby</span><em class="qz-fb qz-bad">That blocks even more — Type 3 as well — and still cannot hold an ASBR.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q3</span>A Type 5 LSA is present in another area but the external route will not install. What is most likely missing?</p>
<label class="qz-opt"><input type="radio" name="om3"><span>The Type 4 ASBR Summary, so the router cannot reach the ASBR</span><em class="qz-fb qz-good">Right. A Type 5 names the ASBR by router ID; without a Type 4 saying how to reach it, the route is unusable.</em></label>
<label class="qz-opt"><input type="radio" name="om3"><span>A Type 2 Network LSA</span><em class="qz-fb qz-bad">Type 2 is per multi-access segment and never leaves its area.</em></label>
<label class="qz-opt"><input type="radio" name="om3"><span>A virtual link</span><em class="qz-fb qz-bad">Only needed when an area cannot touch area 0 directly.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q4</span>You make a user VLAN interface passive. What happens to its subnet?</p>
<label class="qz-opt"><input type="radio" name="om4"><span>It stops being advertised into OSPF</span><em class="qz-fb qz-bad">A common misreading. Passive stops hellos, not advertisement.</em></label>
<label class="qz-opt"><input type="radio" name="om4"><span>It is still advertised, but no adjacency can form over the interface</span><em class="qz-fb qz-good">Correct, and that is exactly what you want on a user VLAN — reachable, but nobody can plug in a router and peer with you.</em></label>
<label class="qz-opt"><input type="radio" name="om4"><span>It becomes an external Type 5 route</span><em class="qz-fb qz-bad">Passive changes nothing about how the prefix is classified.</em></label>
</div>

---

## References

- **RFC 2328** — OSPF Version 2. LSA types are §12.4; areas §3.
- **RFC 3101** — The OSPF Not-So-Stubby Area (NSSA) Option.
- **RFC 5340** — OSPF for IPv6 (OSPFv3).
- Cisco — [OSPF Design Guide](https://www.cisco.com/c/en/us/support/docs/ip/open-shortest-path-first-ospf/7039-1.html)
- Cisco — [What Are OSPF Areas and Virtual Links?](https://www.cisco.com/c/en/us/support/docs/ip/open-shortest-path-first-ospf/13703-8.html)

---

*Part of the [CCNA, ENCOR and ENARSI topic-by-topic study guide](/blog/ccna-ccnp-study-guide).*
