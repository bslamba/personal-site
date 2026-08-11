---
title: "EIGRP Explained: DUAL, Feasible Successors and the Stuck-in-Active Problem"
excerpt: "How EIGRP achieves sub-second convergence without recalculating a topology, what the feasibility condition actually guarantees, and why 'stuck in active' is the failure worth understanding."
date: "2026-04-02"
tags: ["Routing", "EIGRP", "Networking", "Troubleshooting", "Fundamentals"]
draft: false
---

## Cheat sheet

| | |
|---|---|
| **Type** | Advanced distance-vector. Cisco-developed, published as RFC 7868. IP protocol **88** |
| **Algorithm** | DUAL — Diffusing Update Algorithm |
| **AD** | 90 internal · 170 external · 5 for summary routes |
| **Metric** | Bandwidth and delay by default. K1=1, K3=1, others 0. |
| **Multicast** | 224.0.0.10 |
| **Hello / Hold** | 5s / 15s on high-speed links · 60s / 180s on low-speed NBMA |
| **FD** | Feasible Distance — the best metric this router has to the destination |
| **RD / AD** | Reported Distance — the metric the neighbour advertised |
| **Successor** | The best next hop. Installed in the routing table. |
| **Feasible Successor** | A backup with **RD < FD** — guaranteed loop-free, usable instantly |
| **Feasibility condition** | RD must be **strictly less than** the current FD |
| **Passive** | Normal state — a successor exists |
| **Active** | No feasible successor; querying neighbours |
| **SIA** | Stuck In Active — a query went unanswered. The failure worth knowing. |

---

EIGRP occupies an unusual position: it behaves like a distance-vector protocol but converges like a link-state one. Understanding how it manages that explains both its strengths and its one characteristic failure mode.

## Distance-vector, done differently

A classic distance-vector protocol like RIP periodically broadcasts its entire routing table and relies on timers to age out bad information. That's why RIP converges in minutes.

EIGRP keeps the distance-vector model — routers exchange metrics rather than topology — but adds three things:

**Reliable, incremental updates.** No periodic full-table broadcasts. Updates are sent only when something changes, and only the change.

**A topology table.** EIGRP retains information about *all* known paths, not just the best one.

**DUAL.** The algorithm that decides, in advance, which alternative paths are provably loop-free.

That third point is the core of it.

## The metric vocabulary

Two terms, and getting them straight makes everything else follow.

**Feasible Distance (FD)** — the best metric *this* router has calculated to reach a destination.

**Reported Distance (RD)**, also called Advertised Distance — the metric a *neighbour* reported for reaching that destination.

So if a neighbour says "I can reach 10.1.1.0/24 with metric 1000" and the link to that neighbour costs 500, then RD is 1000 and FD is 1500.

## Successors and feasible successors

**The successor** is the neighbour offering the lowest total metric. Its route goes in the routing table. Ordinary enough.

**A feasible successor** is a backup path that satisfies the **feasibility condition**:

> The neighbour's Reported Distance must be **strictly less than** the current Feasible Distance.

**Why that specific test guarantees loop freedom:** if a neighbour's own cost to the destination is lower than my best cost, that neighbour cannot be routing through me. Its path is genuinely independent, so using it cannot create a loop.

That's the whole insight, and it's what makes EIGRP fast.

**Because the feasible successor is pre-validated, failover is instantaneous.** When the successor fails, EIGRP promotes the feasible successor immediately — no query, no recomputation, no convergence delay. Sub-second, and often sub-100ms.

### When there is no feasible successor

If no neighbour satisfies the condition, EIGRP cannot promote anything safely. The route goes **Active** and the router sends **queries** to its neighbours asking whether they have a path.

Those neighbours reply, or query their own neighbours in turn. The query diffuses outward — hence "Diffusing Update Algorithm" — until every branch replies.

**This is the slow path**, and it's where EIGRP's problems live.

## Stuck In Active

If a router sends a query and doesn't receive every reply within the SIA timer (three minutes by default), the route becomes **Stuck In Active**.

The router then tears down the adjacency with the unresponsive neighbour, on the assumption something is badly wrong.

**Why it happens:**

**The query range is too large.** Queries propagate until they reach a router that can answer definitively. In a flat network with no summarisation, a single link failure can query hundreds of routers.

**A distant router is slow or overloaded** and doesn't reply in time.

**A link is marginal** — up enough to maintain adjacency, lossy enough to drop query or reply packets.

**Memory or CPU pressure** on a router in the query path.

**Why it's damaging:** the adjacency teardown causes further route recalculation, which generates more queries, which can cascade. A single flapping link in a poorly-summarised network can destabilise a large area.

### Limiting query scope

The fix is architectural, not a timer adjustment.

**Summarisation** is the primary tool. When a router summarises, it can answer queries for anything inside the summary authoritatively — the query stops there.

```
interface GigabitEthernet0/1
 ip summary-address eigrp 100 10.1.0.0 255.255.0.0
```

**Stub routers** are the second tool. A stub router tells its neighbours not to query it, because it has no transit paths to offer.

```
router eigrp 100
 eigrp stub connected summary
```

Every branch or spoke router should be a stub. It's a single line, it removes that router from every query, and there is essentially no downside for a device with one uplink.

**The combination of summarisation at aggregation points and stub configuration at the edges is what makes EIGRP scale.** Without them it works fine until it doesn't, and the failure arrives as a cascade rather than a single event.

## The metric

By default EIGRP uses **bandwidth and delay**:

```
metric = 256 × (10^7 / minimum bandwidth + total delay / 10)
```

K-values weight the components: K1 (bandwidth) and K3 (delay) default to 1, while K2 (load), K4 and K5 (reliability) default to 0.

**Load and reliability are disabled by default for good reason.** They vary continuously with traffic, so enabling them makes the metric unstable and can cause routes to flap. Leave them at zero.

**K-values must match between neighbours** or adjacency won't form. `show ip eigrp neighbors` showing nothing, with `debug eigrp packets` reporting a K-value mismatch, is a fast diagnosis.

**Bandwidth on an interface is a statement, not a measurement.** EIGRP uses whatever the `bandwidth` command says, and that value is frequently wrong — a serial interface defaulting to 1544 kbps when the circuit is 10 Mbps, or a subinterface inheriting a value nobody set deliberately. Since bandwidth drives the metric, wrong bandwidth means wrong path selection.

## Wide metrics

Classic EIGRP metrics use 32 bits, which saturates above about 10 Gbps — the same problem OSPF has with reference bandwidth.

**EIGRP Named Mode** introduces 64-bit wide metrics:

```
router eigrp MYNETWORK
 address-family ipv4 unicast autonomous-system 100
  metric version 64bit
```

Named mode is the modern configuration style generally — it consolidates configuration that was previously scattered across interfaces and the routing process, and it's where new features land.

## Neighbour relationships

Simpler than OSPF: no DR election, no areas, no LSA types.

For adjacency, these must match:

- **Autonomous system number**
- **K-values**
- **Authentication**, if configured
- The routers must be on a **common subnet**

Hello and hold timers do *not* need to match, which differs from OSPF. Mismatched timers work — though a hold timer shorter than the neighbour's hello interval causes flapping, so consistency is still sensible.

## Troubleshooting

```
show ip eigrp neighbors
show ip eigrp topology
show ip eigrp topology all-links
show ip eigrp interfaces
show ip protocols
```

**`show ip eigrp topology`** is the key command. It shows successors and feasible successors with their FD and RD values, so you can verify the feasibility condition yourself.

Look for routes in **Active** state. Anything active for more than a moment is a problem, and it points at query scope.

**`all-links`** shows every path including ones that failed the feasibility condition. Useful when you expect a backup path and EIGRP isn't using it — you'll see the path exists but its RD is too high.

**For SIA:**

```
show ip eigrp topology active
debug eigrp fsm
```

The active topology output names which neighbours haven't replied, which points directly at where in the network the query is stalling.

## EIGRP versus OSPF, briefly

Both are used successfully in large enterprises. The honest comparison:

**EIGRP** converges faster where feasible successors exist, is simpler to configure, and handles unequal-cost load balancing natively via the `variance` command — something OSPF cannot do at all. Its weakness is query scope, which must be managed architecturally.

**OSPF** is an open standard with genuine multi-vendor support, and its area structure enforces a hierarchy that limits blast radius by design rather than by discipline. Its weakness is configuration complexity and the reference-bandwidth trap.

The practical determinant is usually vendor mix. An all-Cisco estate can reasonably choose either; a mixed estate chooses OSPF.

---

EIGRP's elegance is the feasibility condition — a simple arithmetic test that proves a backup path is loop-free without any topology computation. Its weakness is what happens when no such path exists, and that's entirely addressable with summarisation and stub routers. Both are one line of configuration and both are routinely omitted.
