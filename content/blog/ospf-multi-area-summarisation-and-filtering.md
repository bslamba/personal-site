---
title: "OSPF Beyond One Area: ABRs, LSA Types, Summarisation and What You Can Actually Filter"
excerpt: "One area works until it doesn't. Areas exist to stop a link flap in one corner recomputing the whole network — but only if you summarise at the boundary, and summarisation is the one thing you can only do in two specific places. Here is why, and what each area type hides."
date: "2026-09-20"
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
<svg viewBox="0 0 640 250" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Three OSPF areas joined through area 0 with ABRs at the boundaries">
  <style>
    .ar { fill:#F1EEE9; stroke:#B5B5BC; stroke-width:1.5 }
    .bb { fill:#FFE0E5; stroke:#D3002D; stroke-width:1.5 }
    .r { fill:#17171A } .abr { fill:#D3002D } .asbr { fill:#1f9d6b }
    .rt { fill:#FAF8F5; font-family:ui-sans-serif,system-ui; font-size:10px; font-weight:700 }
    .at { font-family:ui-sans-serif,system-ui; font-size:12px; font-weight:800; fill:#5C5C64 }
    .abt { font-family:ui-sans-serif,system-ui; font-size:12px; font-weight:800; fill:#D3002D }
    .l { stroke:#8A8A93; stroke-width:1.5 }
    .s { font-family:ui-sans-serif,system-ui; font-size:9.5px; fill:#5C5C64 }
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

## Summarisation: two commands, two places, and no third option

**This is the most commonly examined fact in the topic**, and the most commonly got wrong in production.

```cisco
! Inter-area summarisation — ON THE ABR ONLY
router ospf 1
 area 2 range 10.2.0.0 255.255.252.0

! External summarisation — ON THE ASBR ONLY
router ospf 1
 summary-address 172.16.0.0 255.255.0.0
```

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

```text
ABR1# show ip route 10.2.0.0
O    10.2.0.0/22 is a summary, 00:04:12, Null0
```

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

<details class="reveal">
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
