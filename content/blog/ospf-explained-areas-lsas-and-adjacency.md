---
title: "OSPF Explained: Areas, LSA Types, and Why Adjacencies Get Stuck"
excerpt: "How link-state routing actually works, what each LSA type carries, the area types and what they filter, and a diagnostic table for every neighbour state an adjacency can stall in."
date: "2026-03-26"
tags: ["Routing", "OSPF", "Networking", "Troubleshooting", "Fundamentals"]
draft: false
---

## Cheat sheet

| | |
|---|---|
| **Type** | Link-state, open standard (RFC 2328), IP protocol **89** |
| **Metric** | Cost = reference bandwidth ÷ interface bandwidth. Default reference 100 Mbps. |
| **AD** | 110 |
| **Algorithm** | Dijkstra SPF, run against the link-state database |
| **Hello / Dead** | 10s / 40s on broadcast · 30s / 120s on NBMA |
| **Area 0** | The backbone. Every other area must touch it. |
| **Router ID** | Highest loopback IP, else highest active interface IP, else configured explicitly |
| **DR / BDR** | Elected on multi-access segments to reduce adjacency count. Highest priority, then highest RID. Priority 0 = never DR. |
| **Multicast** | 224.0.0.5 (all OSPF routers), 224.0.0.6 (DR/BDR) |

**Neighbour states:** Down → Init → 2-Way → ExStart → Exchange → Loading → **Full**

**LSA types worth knowing:** 1 Router · 2 Network · 3 Summary · 4 ASBR Summary · 5 External · 7 NSSA External

---

OSPF is the routing protocol most enterprises actually run, and the one whose failure modes are most reliably diagnosable — because every neighbour state tells you precisely what to check.

## Single-area OSPF: adjacencies and network types

Before areas and router roles, OSPF has to do one thing: form **adjacencies** with neighbours and agree on who talks to whom. These are the CCNA-level sub-items.

### Neighbor adjacencies

OSPF routers discover each other with **hellos** and form an **adjacency** only when a set of parameters match: **area ID, subnet/mask, hello and dead timers, authentication, and MTU**. A mismatch in any of them stops the adjacency — and the stage it stops at tells you which.

- **Beginner:** two OSPF routers must "become neighbours" before they exchange routes.
- **Working knowledge:** the states run Down → Init (I hear you) → 2-Way (you hear me) → ExStart/Exchange/Loading → **Full**. Stuck in **2-Way** on a LAN is normal for non-DR/BDR pairs; stuck in **ExStart** is the classic **MTU mismatch**.
- **Pro:** `show ip ospf neighbor` plus the stuck state is a fast diagnosis — Init means hellos are one-way (an ACL or unicast/multicast issue), ExStart/Exchange means MTU or an MTU-ignore situation, and never-neighbours means timers, area or subnet. This is worked in [the state machine / troubleshooting](#reading-it) below.

### Point-to-point

On a **point-to-point** network type (a serial link, or an Ethernet link you set to `ip ospf network point-to-point`), there are exactly two routers, so OSPF **skips DR/BDR election** and the two form a full adjacency directly.

- **Beginner:** two routers on a private link — they just pair up, no election.
- **Working knowledge:** setting Ethernet point-to-point links to this type is a common optimisation — it removes the pointless election and speeds convergence.
- **Pro:** point-to-point uses a /30 or /31 and forms adjacency fast; it is the type you *want* wherever there really are only two routers, precisely to avoid the DR machinery of the broadcast type below.

### Broadcast (DR/BDR selection)

On a **broadcast** network (Ethernet by default), many routers share the segment, so OSPF elects a **Designated Router (DR)** and **Backup DR (BDR)** to avoid every router adjacency-ing with every other (which would be n² adjacencies and n² LSAs). All routers form full adjacencies **only with the DR and BDR**; others stay 2-Way with each other.

- **Beginner:** on a shared LAN, OSPF picks a spokesperson (DR) so routers don't all pair up with each other.
- **Working knowledge:** election is by **highest OSPF priority**, then **highest router ID**; priority 0 means "never DR". The election is **non-preemptive** — a better router joining later does **not** take over.
- **Pro:** because it is non-preemptive, DR placement is a design choice you enforce with priority, not something to leave to chance — you want the DR on a stable, well-connected router. Clearing it means bouncing adjacencies, so set priorities before the neighbours come up.

### Router ID

The **Router ID (RID)** is a 32-bit number (written like an IPv4 address) that uniquely identifies an OSPF router. It is chosen, in order: a manual `router-id`, else the highest **loopback** IP, else the highest active interface IP — **fixed at process start**.

- **Beginner:** OSPF's name for the router, looking like an IP address.
- **Working knowledge:** **always set it manually** (`router-id 1.1.1.1`) so it does not change when an interface flaps or is renumbered — a changed RID tears down every adjacency.
- **Pro:** loopbacks make good RIDs because they never go down, but an explicit `router-id` is better still — deterministic, documented, and independent of addressing. Changing it needs `clear ip ospf process`, which is disruptive, so decide it once.

---

## OSPF areas, network types and router roles

At scale OSPF is organised into **areas** to bound the size of the link-state database and the reach of a recalculation. These are the ENARSI-level sub-items.

### Address families (IPv4, IPv6)

OSPF comes in two versions: **OSPFv2** for IPv4 and **OSPFv3** originally for IPv6. Modern OSPFv3 supports **address families**, carrying both IPv4 and IPv6 in one process over IPv6 link-local transport.

- **Beginner:** OSPFv2 = IPv4; OSPFv3 = IPv6 (and now both).
- **Working knowledge:** OSPFv3 runs over **link-local** addresses and is enabled per-interface (`ospfv3` / `ipv6 ospf`), a different configuration model from v2's `network` statements.
- **Pro:** OSPFv3's address-family model lets one process and one set of adjacencies carry both protocols, but each address family keeps its **own SPF and topology** — a v4 problem does not corrupt the v6 table, and vice versa.

### Neighbor relationship and authentication

Adjacency formation (above) plus **authentication**: OSPF can require neighbours to prove themselves before adjacency, so a rogue device cannot inject routes. OSPFv2 supports plain, MD5 and (modern) SHA; OSPFv3 uses IPsec.

- **Beginner:** neighbours can be made to prove who they are before exchanging routes.
- **Working knowledge:** authentication mismatch is a neighbour-formation failure like any parameter mismatch — it shows in the adjacency never reaching Full.
- **Pro:** authenticate OSPF on any segment you do not fully control; the cost is trivial and it closes an easy route-injection vector. Keep the key IDs and modes consistent — a key-ID mismatch fails as surely as a wrong key.

### Network types, area types, and router types

OSPF classifies three things, each covered in its own section below: the **network type** of a link (how adjacency and DR behave), the **area type** (how much external/summary information an area carries), and the **router type** (where a router sits relative to area boundaries). Getting fluent means knowing which of the three a given symptom belongs to.

- **Beginner:** OSPF has categories for links, for areas, and for routers — three separate classifications.
- **Pro:** most "OSPF is behaving oddly" tickets resolve to one of these three being not what you assumed — a wrong network type (no adjacency / needless DR), a wrong area type (missing externals), or a misplaced router role (unexpected LSA types). The next three sections take them in turn.

### Point-to-point, multipoint, broadcast, nonbroadcast

The **network type** on an interface controls adjacency and DR behaviour:

- **Broadcast** — Ethernet default; elects DR/BDR, uses multicast hellos.
- **Point-to-point** — two routers, no DR, fast.
- **Nonbroadcast (NBMA)** — media with no native broadcast (classic Frame Relay); needs a DR but **manually configured neighbours**.
- **Point-to-multipoint** — a hub-and-spoke set treated as many point-to-point links; no DR, works well over [DMVPN](/blog/dmvpn-nhrp-mgre-and-spoke-to-spoke-tunnels).

- **Working knowledge:** both ends must agree on type and on timers (broadcast/NBMA use hello 10/dead 40; point-to-point/multipoint use 30/120 in some defaults) — a type mismatch is a silent no-adjacency.
- **Pro:** on hub-and-spoke overlays, **point-to-multipoint** avoids the DR problems that NBMA causes and the reachability problems that broadcast causes — it is usually the right answer for DMVPN.

### Area type: backbone, normal, transit, stub, NSSA, totally stub

The **area type** controls which LSAs an area carries, trading detail for smaller databases:

- **Backbone (area 0)** — the core every other area must touch.
- **Normal** — carries everything.
- **Stub** — blocks external (Type 5) LSAs; uses a default route out instead.
- **Totally stubby** — blocks externals **and** inter-area (Type 3); only a default gets in. Cisco-specific, very small database.
- **NSSA** — a stub that can still originate its **own** externals (Type 7, translated to Type 5 at the ABR) — for a stub area that has a redistribution point.
- **Transit** — an area carrying traffic between two others via a [virtual link](#virtual-link).

- **Working knowledge:** every router **in** an area must agree on its type, or adjacencies fail.
- **Pro:** stub types are a scaling tool — shrink the database and reduce SPF churn at the edges, keep full detail in the core. Choose the most restrictive type the area can tolerate given whether it needs to originate externals (→ NSSA) or just consume a default (→ totally stubby).

### Internal router, backbone router, ABR, ASBR

The **router type** is defined by where its interfaces sit:

- **Internal router** — all interfaces in one area.
- **Backbone router** — at least one interface in area 0.
- **ABR (Area Border Router)** — interfaces in two or more areas; generates the inter-area (Type 3) summaries and is where area-range summarisation happens.
- **ASBR (Autonomous System Boundary Router)** — redistributes external routes into OSPF; generates Type 5 (or Type 7 in an NSSA) externals.

- **Working knowledge:** a router can be several at once (an ABR that also redistributes is an ABR **and** ASBR).
- **Pro:** the router type tells you which **LSA types** to expect and where **summarisation** must be configured — `area range` on the **ABR**, `summary-address` on the **ASBR**. Getting those two commands the wrong way round silently does nothing. See [route summarisation](/blog/route-maps-loop-prevention-and-summarisation).

### Virtual link

A **virtual link** connects an area that is **not physically touching area 0** back to the backbone through a **transit area**, because OSPF requires every area to attach to area 0. It is a repair, not a design.

- **Beginner:** a logical patch that reconnects a stranded area to the backbone.
- **Working knowledge:** configured between the two ABRs across the transit area with `area X virtual-link <RID>`; the transit area cannot be a stub.
- **Pro:** treat a virtual link as a temporary fix — if you need one permanently, the area design is wrong. It also cannot cross a stub area, and it adds fragility, so re-home the area to area 0 properly when you can.

### Path preference

OSPF chooses paths by **cost** (sum of interface costs, cost = reference-bandwidth ÷ link-bandwidth), but with a **type ordering** first: **intra-area** beats **inter-area** beats **external**, and **E1** (cost accumulates) beats **E2** (cost fixed at the ASBR) regardless of the raw numbers.

- **Beginner:** lower cost wins, but a route learned inside your area is preferred over one from another area or outside OSPF.
- **Working knowledge:** raise the **reference bandwidth** (`auto-cost reference-bandwidth`) consistently everywhere, or all links above 100 Mbps look like cost 1 and OSPF cannot tell 1 Gbps from 100 Gbps.
- **Pro:** the type ordering is applied **before** cost, so a high-cost intra-area route beats a low-cost inter-area one — a frequent "why isn't it using the faster path" surprise. E2 (the default for redistributed routes) ignores internal cost entirely, which is why E1 is often the better choice when the internal path length matters.

---

## Link-state, and why it differs

A distance-vector protocol like RIP tells its neighbours "here are the networks I can reach and how far away they are". Each router trusts its neighbours' summaries.

A link-state protocol does something different: every router floods a description of **its own directly connected links** to every other router in the area. Each router then builds an identical map of the topology and independently runs **Dijkstra's Shortest Path First** algorithm against it.

Three consequences follow:

**Fast convergence.** A change is flooded immediately, and every router recalculates.

**No routing loops within an area.** Everyone has the same map, so nobody can be misled by a neighbour's incorrect summary.

**Higher resource cost.** Every router holds the full topology database and runs SPF against it.

That last point is why areas exist.

## Areas

The link-state database is per-area. Routers within an area share an identical database; routers in different areas exchange only summary information.

**Area 0 is the backbone.** Every other area must connect to it, either physically or through a virtual link. All inter-area traffic transits area 0, which prevents the loops that would otherwise be possible between areas.

**The router roles:**

| Role | Meaning |
|---|---|
| **Internal router** | All interfaces in one area |
| **ABR** — Area Border Router | Interfaces in two or more areas, one of which is area 0 |
| **ASBR** — Autonomous System Boundary Router | Redistributes routes from outside OSPF |
| **Backbone router** | At least one interface in area 0 |

### Area types, and what they filter

| Type | Blocks | Purpose |
|---|---|---|
| **Standard** | Nothing | Normal area |
| **Stub** | Type 5 (external) | Replaced with a default route |
| **Totally Stubby** | Types 3, 4 and 5 | Only a default route in. Cisco-specific. |
| **NSSA** | Type 5, but allows type 7 | For a stub area that has its own ASBR |
| **Totally NSSA** | Types 3, 4, 5; allows 7 | Combination of the two above |

**Why bother:** a branch router with one uplink doesn't need the full external routing table. It needs a default route. Making that area totally stubby removes thousands of LSAs from a device that has nowhere else to send traffic anyway — less memory, less CPU, faster SPF.

**The design rule:** every router in an area must agree on the area type. A mismatch prevents adjacency formation, and it's a common cause of a neighbour that reaches 2-Way and stops.

## LSA types

| Type | Name | Generated by | Scope |
|---|---|---|---|
| **1** | Router LSA | Every router | Within its area |
| **2** | Network LSA | The DR | Within its area |
| **3** | Summary LSA | ABR | Between areas |
| **4** | ASBR Summary | ABR | Location of an ASBR |
| **5** | External LSA | ASBR | Whole domain (except stub areas) |
| **7** | NSSA External | ASBR in an NSSA | Within the NSSA, converted to type 5 at the ABR |

**Type 1** describes a router's own links and their costs. Every router generates one.

**Type 2** describes a multi-access segment and which routers are on it. Only the DR generates these.

**Type 3** is how an ABR advertises the networks in one area into another. Note it's a *summary* of reachability, not a full topology — this is what keeps areas independent.

**Type 4** tells routers in other areas how to reach an ASBR. Needed because the type 5 external LSA says "reachable via this ASBR" without saying where the ASBR is.

**Type 5** carries routes redistributed from outside OSPF. Flooded everywhere except stub areas.

**Type 7** exists solely to solve a contradiction: an NSSA is a stub area (no type 5) that nonetheless contains an ASBR. Type 7 carries the external route within the NSSA, and the ABR converts it to type 5 when it leaves.

## Neighbour states — the diagnostic table

This is the most useful thing to know about OSPF, because a stuck adjacency stalls at a state that identifies the cause.

| State | Meaning | If it's stuck here, check |
|---|---|---|
| **Down** | No hellos received | Interface up? OSPF enabled on it? Is it passive? Layer 2 connectivity? |
| **Init** | Hellos received, but this router isn't listed in them | One-way communication. An ACL blocking one direction, or a unidirectional link. |
| **2-Way** | Bidirectional hellos exchanged | **Normal** between two DROTHERs on a multi-access segment. Otherwise: area type mismatch, or both routers have priority 0. |
| **ExStart** | Negotiating master/slave and sequence numbers | **MTU mismatch** — the classic. Also duplicate router IDs. |
| **Exchange** | Exchanging database descriptors | MTU, or an intermittent link. |
| **Loading** | Requesting missing LSAs | Usually transient. Persistent means a corrupted or very large LSA. |
| **Full** | Adjacency complete | This is the goal. |

**Stuck at ExStart is almost always MTU.** OSPF exchanges database descriptor packets sized to the interface MTU, and if the two ends disagree, one side sends a packet the other can't receive. The adjacency negotiates and then hangs.

```
show ip ospf interface GigabitEthernet0/1 | include MTU
```

If the MTUs genuinely must differ:

```
interface GigabitEthernet0/1
 ip ospf mtu-ignore
```

Use that as a deliberate decision, not a reflex — it's suppressing a real inconsistency.

**Stuck at 2-Way between two routers that should be Full** means neither is willing to become DR, or the area types don't match. On a point-to-point link there's no DR election, so 2-Way there is always wrong.

## Why adjacencies fail to form at all

Hello packets carry parameters that **must match** on both sides:

- **Area ID**
- **Hello and Dead intervals**
- **Authentication** — type and key
- **Stub area flag**
- **Subnet mask** on broadcast networks

Any mismatch and the hello is discarded. `debug ip ospf adj` names which one.

```
debug ip ospf adj
show ip ospf neighbor
show ip ospf interface brief
```

## DR and BDR

On a multi-access segment with *n* routers, full adjacencies between all of them would be *n(n-1)/2* relationships. With ten routers that's 45.

OSPF elects a **Designated Router** and a **Backup DR**. Everyone forms a full adjacency with the DR and BDR only, and remains at 2-Way with each other. Ten routers becomes eighteen adjacencies.

**Election:** highest priority wins; ties broken by highest router ID. **Priority 0 means never become DR.**

**The election is not pre-emptive.** A new router with a higher priority does not take over from an existing DR. To change it, you clear the process — which is disruptive, and worth knowing before you assume adjusting priority will just work.

**Design guidance:** set priority deliberately on the routers you want as DR — typically the most stable, best-connected ones — and set priority 0 on everything that shouldn't be. Leaving it to chance means the DR is whichever router happened to boot first.

## The router ID

Selected in this order:

1. Explicitly configured `router-id`
2. Highest IP address on an active loopback
3. Highest IP address on an active physical interface

**Always configure it explicitly.** Otherwise it changes when an interface goes down, which restarts adjacencies at exactly the moment you least want it. A loopback is the next best thing because it never goes down.

**Duplicate router IDs** cause adjacencies to stall and produce genuinely baffling symptoms, because the database becomes internally inconsistent. Worth checking when something makes no sense.

## Cost, and the reference bandwidth trap

Cost = **reference bandwidth ÷ interface bandwidth**, with a default reference of **100 Mbps**.

That default is from an era when 100 Mbps was fast. Today it means:

| Interface | Cost |
|---|---|
| 100 Mbps | 1 |
| 1 Gbps | 1 |
| 10 Gbps | 1 |
| 100 Gbps | 1 |

Everything at or above 100 Mbps has a cost of 1, so OSPF cannot distinguish a 100 Mbps link from a 100 Gbps one. It will happily load-share across both.

**The fix:**

```
router ospf 1
 auto-cost reference-bandwidth 100000
```

That sets the reference to 100 Gbps and restores meaningful differentiation.

**It must be configured identically on every router in the domain.** An inconsistent reference bandwidth produces asymmetric path selection that is very difficult to diagnose, because each router is computing costs on a different scale.

## A troubleshooting order

1. `show ip ospf neighbor` — what state, and is the neighbour there at all?
2. Match the state against the table above.
3. `show ip ospf interface brief` — is OSPF on the interface, in the right area, with the right timers?
4. `show ip ospf database` — is the LSA you expect present?
5. `show ip route ospf` — did the route make it into the routing table?
6. If a route is in the database but not the table, check for a better route from another protocol — administrative distance.

That sequence separates "adjacency problem" from "LSA problem" from "route selection problem" in about a minute, and they need entirely different fixes.

---

OSPF's great virtue for an operator is that it fails informatively. The neighbour state tells you what to check, the database tells you what was advertised, and the routing table tells you what was chosen. Very few protocols are that cooperative.
