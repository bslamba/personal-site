---
title: "RIP Explained: Why It Still Matters Even Though You Shouldn't Deploy It"
excerpt: "Hop count, the count-to-infinity problem, and the four loop-prevention mechanisms every routing protocol inherited from it. RIP is obsolete in production and essential as a teaching tool."
date: "2026-04-09"
tags: ["Routing", "RIP", "Networking", "Fundamentals"]
draft: false
---

## Cheat sheet

| | |
|---|---|
| **Type** | Distance-vector, open standard |
| **Metric** | **Hop count**, and nothing else |
| **Maximum** | **15 hops.** 16 = unreachable (infinity) |
| **AD** | 120 |
| **Transport** | UDP **520** (RIPv2) · UDP **521** (RIPng for IPv6) |
| **Update interval** | 30 seconds, full table |
| **Invalid timer** | 180s — route marked unreachable |
| **Flush timer** | 240s — route removed |
| **Holddown** | 180s — ignore worse information about this route |
| **RIPv1** | Classful, broadcast, no authentication. Obsolete. |
| **RIPv2** | Classless (VLSM), multicast **224.0.0.9**, supports authentication |
| **RIPng** | IPv6 version |

**The four loop-prevention mechanisms:** Split horizon · Route poisoning · Poison reverse · Holddown timers

---

Nobody should deploy RIP on a new network. It's slow to converge, its metric is nearly meaningless, and its 15-hop limit rules out any network of size.

It's still worth understanding properly, for two reasons. It's the clearest possible illustration of *why* modern routing protocols work the way they do — every loop-prevention mechanism in EIGRP and OSPF exists because RIP demonstrated the problem first. And it still turns up, in old equipment, in small appliances, and in exam syllabuses.

## How it works

Every 30 seconds, each RIP router broadcasts its **entire routing table** to its neighbours. Each neighbour takes those routes, adds one to the hop count, and installs anything better than what it already has.

That's the whole protocol. No neighbour relationship, no topology database, no algorithm beyond "lower hop count wins".

**The metric is hop count and only hop count.** A path over three gigabit links has a metric of 3. A path over one 64 kbps link has a metric of 1. RIP prefers the second one, every time.

That single fact makes RIP unsuitable for any network with varied link speeds, which is every real network.

## The 15-hop limit

**A metric of 16 means unreachable.** Sixteen is infinity.

This looks like an arbitrary restriction. It isn't — it's the fix for RIP's fundamental problem, and understanding why explains the rest of the protocol.

## Count to infinity

Consider three routers in a line: A — B — C, with a network attached to C.

C's network goes down. C removes the route.

But before C can tell B, B's regular update arrives at C saying "I can reach that network in 2 hops" — because B learned it *from C* in the first place.

C believes it, and installs the route via B with metric 3. C then tells B, which updates its metric to 4. B tells C, which becomes 5.

They count upward, forever, each believing the other has a valid path, while packets for that network loop between them.

**This is count-to-infinity**, and it is the defining weakness of naive distance-vector routing.

The 15-hop limit bounds it: once the metric hits 16, the route is declared unreachable and the loop ends. It's a blunt fix — it caps the damage rather than preventing it — and the cost is that no network can be more than 15 hops wide.

## The four mechanisms that actually help

Every one of these was invented for RIP, and every modern routing protocol uses some form of them.

### Split horizon

**Never advertise a route back out the interface you learned it on.**

B learned about C's network from C, so B does not advertise that route back to C. This directly prevents the two-router loop described above.

Simple, effective, and it doesn't prevent loops involving three or more routers — which is why the other three mechanisms exist.

### Route poisoning

When a route fails, **advertise it with metric 16** rather than simply removing it.

The difference matters. Silent removal means neighbours only learn through timeout — up to 180 seconds. An explicit metric-16 advertisement tells them immediately that the route is dead.

Positive information travels fast; negative information needs to be sent deliberately.

### Poison reverse

Split horizon with an override: instead of not advertising the route back, **advertise it back with metric 16**.

Slightly more traffic, but unambiguous. The neighbour is explicitly told "do not use me for this", rather than merely not being told anything.

### Holddown timers

After learning a route is unreachable, **ignore any new information about it for the holddown period** — 180 seconds by default — unless the information comes from the original source or has a better metric.

This stops a stale advertisement, still circulating from a router that hasn't converged yet, from reinstalling a dead route.

**The cost is convergence time.** A route that genuinely comes back must wait out the holddown before it's usable. This is why RIP converges in minutes rather than seconds, and it's the trade-off that link-state protocols avoid entirely by giving every router the full topology.

## The timers

| Timer | Default | Purpose |
|---|---|---|
| Update | 30s | Send the full table |
| Invalid | 180s | No update heard — mark unreachable |
| Holddown | 180s | Ignore worse information |
| Flush | 240s | Remove from the table entirely |

Six missed updates before a route is even suspected. Another period before it's removed. This is why RIP convergence is measured in minutes.

## Version differences

**RIPv1** — classful, so it carries no subnet masks and cannot support VLSM. Broadcasts to 255.255.255.255. No authentication. There is no scenario in which RIPv1 is the right choice.

**RIPv2** — classless, carries subnet masks, supports VLSM and discontiguous networks. Multicasts to **224.0.0.9** rather than broadcasting. Supports authentication, including MD5.

**RIPng** — the IPv6 version, on UDP 521.

If RIP must be used, use v2 with authentication:

```
router rip
 version 2
 no auto-summary
 network 10.0.0.0
```

**`no auto-summary` matters.** Automatic summarisation at classful boundaries breaks discontiguous networks and is a source of confusing behaviour. Turn it off.

## What RIP teaches

The reason to understand RIP is that it makes the design of everything after it legible.

**Why EIGRP has feasible successors.** EIGRP's feasibility condition — a neighbour's reported distance must be less than my feasible distance — is a *proof* that the neighbour isn't routing through me. It's count-to-infinity solved properly rather than bounded arbitrarily.

**Why OSPF floods topology rather than routes.** If every router has an identical map, no router can be misled by a neighbour's incorrect summary. Loops within an area become structurally impossible rather than something to detect after the fact.

**Why metrics beyond hop count exist.** RIP demonstrates exactly how badly hop count performs when link speeds vary.

**Why fast convergence needs event-driven updates.** RIP's 30-second periodic model means information is up to 30 seconds stale before it's even sent. Triggered updates and reliable transport are the response.

Every one of those design decisions reads as an answer to a specific RIP failure.

## If you find it running

RIP in a production network today is almost always accidental — enabled on a device years ago, never removed, quietly redistributing.

**Check what it's carrying:**

```
show ip protocols
show ip route rip
show ip rip database
```

**Check whether it's redistributing.** RIP redistributing into OSPF or EIGRP is a genuine risk, because RIP's 15-hop limit and hop-count metric translate badly, and routes can be injected with nonsensical metrics.

**Removing it** is usually straightforward, but verify nothing depends on it first — occasionally an old appliance or a management network is the only thing still speaking it.

---

RIP is obsolete and worth an hour of your time anyway. It's the clearest available demonstration of what routing protocols are actually protecting against, and understanding count-to-infinity makes every other protocol's design decisions obvious rather than arbitrary.
