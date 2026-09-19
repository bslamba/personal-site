---
title: "BGP Best Path Selection: The Tie-Breakers in Order, and Which Two You Should Actually Use"
excerpt: "BGP installs exactly one path and ignores the rest. Eleven tests decide which, in a fixed order, and the first difference wins. Here is every step, what each one is really for, and the direction problem that catches everybody: the knob that controls your outbound traffic does nothing to your inbound."
date: "2026-09-20"
tags: ["BGP", "Routing", "Path Selection", "CCNP", "ENCOR", "ENARSI"]
draft: false
---

> **Blueprint:** ENCOR 350-401 — 3.2.c *Configure and verify eBGP between directly connected neighbors (**best path selection algorithm** and neighbor relationships)*. ENARSI 300-410 — 1.11.c *Path preference (attributes and best-path)*, 1.11.e *Policies (inbound/outbound filtering, path manipulation)*.
>
> **Part 2 of 2.** [Part 1 is the session itself](/blog/bgp-neighbors-states-and-why-the-session-wont-come-up).

## Cheat sheet

The order. The first test that produces a difference ends the comparison — nothing below it is ever consulted.

| # | Test | Prefer | Set where | Scope |
|---|---|---|---|---|
| 0 | Next hop reachable? | Otherwise the path is not a candidate at all | — | — |
| 1 | **Weight** | **Highest** | Inbound, local router | This router only |
| 2 | **Local Preference** | **Highest** | Inbound | Whole AS |
| 3 | Locally originated | `network` / `aggregate` / redistributed | — | Local |
| 4 | **AS_PATH length** | **Shortest** | Outbound (prepend) | Propagates |
| 5 | Origin code | IGP `i` < EGP `e` < Incomplete `?` | — | Propagates |
| 6 | **MED** | **Lowest** | Outbound | Neighbour AS only |
| 7 | eBGP over iBGP | eBGP | — | Local |
| 8 | IGP metric to next hop | Lowest | IGP cost | Local |
| 9 | Oldest eBGP path | Oldest | — | Stability |
| 10 | Router ID | Lowest | `bgp router-id` | Tie-break |
| 11 | Cluster list length | Shortest | — | RR designs |
| 12 | Neighbour IP address | Lowest | — | Final |

**The four that matter in practice: Weight, Local Preference, AS_PATH prepending, MED.** The rest are either automatic or tie-breakers you will never deliberately use.

---

## One path in, one path out

Every other protocol you have met will load balance across equal-cost paths without being asked. OSPF installs four by default. EIGRP does the same, and will do unequal-cost with `variance`.

BGP does not. **BGP selects exactly one best path per prefix, installs that, and advertises only that to its neighbours.** Everything else is held in the BGP table, marked as valid, and otherwise ignored until the best path disappears.

```text
R1# show ip bgp
     Network          Next Hop       Metric LocPrf Weight Path
 *   203.0.113.0/24   10.0.0.2            0    100      0 64500 64502 i
 *>  203.0.113.0/24   192.0.2.9           0    100      0 64501 i
 *                    172.16.0.5          0     80      0 64500 i
```

Three paths to the same prefix. The `*` means valid — usable. The `>` means best — installed and advertised. Only the middle one gets either.

<div class="why">
<b>Why only one</b>
BGP is a policy protocol between organisations. If it advertised every path it knew, the internet's routing table would multiply by the number of available paths at every hop, and the propagation of a single change would be unbounded. Announcing only your chosen path keeps the table proportional to the number of prefixes, not to the number of ways to reach them. It also means your neighbours cannot see, and therefore cannot route around, your internal policy — which is the point.
</div>

To install more than one, you must ask explicitly, and the paths must be identical on every attribute down to step 8:

```cisco
router bgp 65001
 address-family ipv4 unicast
  maximum-paths 4              ! eBGP
  maximum-paths ibgp 4         ! iBGP
```

---

## The comparison, step by step

### 0. Is the next hop reachable?

Not a tie-breaker — an entry requirement. If the router has no route to the next hop, the path is not valid and never enters the comparison. This is where most "BGP knows the route but won't use it" cases die, and it is covered in [part 1](/blog/bgp-neighbors-states-and-why-the-session-wont-come-up).

### 1. Weight — highest wins

Cisco proprietary. 0–65535. **Never leaves the router it is set on.**

```cisco
neighbor 203.0.113.9 weight 200
```

Because it is first and purely local, weight is the bluntest instrument available. Set it and nothing below matters. That makes it useful for a quick fix on one router and dangerous as a policy tool — the router next to it has no idea you did it, so two routers in the same AS can disagree about the best path and send traffic in circles.

Locally originated routes get weight **32768** automatically. Everything learned from a peer gets **0**.

### 2. Local Preference — highest wins

The proper AS-wide version of weight. Default **100**. Carried in iBGP updates, so every router in your AS agrees.

```cisco
route-map PREFER-ISP-A permit 10
 set local-preference 200
!
router bgp 65001
 neighbor 203.0.113.9 route-map PREFER-ISP-A in
```

<div class="note">
<b>Local Preference is the outbound control</b>
This is how you choose which provider <em>your traffic leaves through</em>. Higher local pref on ISP-A's routes means your AS prefers to send traffic that way. It says nothing about which way return traffic arrives.
</div>

### 3. Locally originated beats learned

A route you originated with `network`, `aggregate-address` or redistribution beats the same prefix learned from a neighbour. You know your own prefixes better than anybody else does.

### 4. AS_PATH — shortest wins

The number of autonomous systems the route crossed. This is the internet's rough approximation of distance, and the only step that behaves like a routing metric.

You cannot shorten your AS_PATH. You can lengthen it, which makes a path *less* attractive:

```cisco
route-map MAKE-ISP-B-UGLY permit 10
 set as-path prepend 65001 65001 65001
!
router bgp 65001
 neighbor 192.0.2.9 route-map MAKE-ISP-B-UGLY out
```

<div class="warn">
<b>Prepending is the inbound control, and it is a request, not an instruction</b>
Applied <b>outbound</b>, prepending makes your prefix look further away to the AS you send it to, so they are less likely to choose it — which influences the traffic that comes <em>back</em> to you. But it only works if the far side gets as far as step 4. If they set local preference on their side, your prepending is evaluated two steps too late and has no effect whatsoever. You are asking politely. You have no authority over another AS's policy.
</div>

An `AS_SET` from an aggregate counts as **1** regardless of how many AS numbers it contains. Private AS numbers removed with `remove-private-as` shorten the path, which changes the result.

### 5. Origin code — IGP beats EGP beats Incomplete

| Code | Shown | Means |
|---|---|---|
| IGP | `i` | Originated by a `network` statement |
| EGP | `e` | Learned via the obsolete EGP. You will never see this. |
| Incomplete | `?` | **Redistributed** from somewhere else |

The practical consequence: a prefix you advertise with `network` beats the same prefix somebody redistributed. Redistributing into BGP when you meant to use `network` can quietly lose you a path selection you expected to win.

### 6. MED — lowest wins

Multi-Exit Discriminator. A hint to a neighbouring AS about **which of several links into your AS to prefer**. Default 0. Lower is better — it is a metric, not a preference.

```cisco
route-map PREFER-THIS-LINK permit 10
 set metric 50
!
neighbor 203.0.113.9 route-map PREFER-THIS-LINK out
```

Two rules that surprise people:

- **MED is only compared between paths from the same neighbouring AS.** Two links to ISP-A: compared. One to ISP-A and one to ISP-B: not compared, and step 6 is skipped. Override with `bgp always-compare-med` — carefully, since it can cause route oscillation.
- **MED does not propagate past the AS that receives it.** It is a message to your direct neighbour only.

### 7. eBGP over iBGP

An externally learned path beats an internally learned one. External means closer to the exit.

### 8. Lowest IGP metric to the next hop

Now your interior protocol finally gets a say. Two iBGP paths that are equal on everything above are decided by which next hop your OSPF or EIGRP considers closer. This is **hot-potato routing** — hand the traffic off at the nearest exit.

### 9–12. The tie-breakers

**Oldest eBGP path.** Deliberately prefers the established path over a newcomer, because flapping is worse than suboptimal. This is also the step that makes best path *non-deterministic across reboots* — which path is oldest depends on boot order. `bgp bestpath compare-routerid` skips it for predictability.

**Lowest router ID**, then **shortest cluster list**, then **lowest neighbour address**. Deterministic, arbitrary, and reached only when everything real has tied.

---

## The direction problem

This is the single most useful thing to understand about BGP policy, and it is the thing most people get wrong first.

<figure class="fig">
<svg viewBox="0 0 640 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Local preference controls outbound traffic, AS path prepending influences inbound traffic">
  <style>
    .n { fill:#17171A } .me { fill:#D3002D }
    .nt { fill:#FAF8F5; font-family:ui-sans-serif,system-ui; font-size:12px; font-weight:700 }
    .l { stroke:#8A8A93; stroke-width:1.5 }
    .out { stroke:#1f9d6b; stroke-width:3; fill:none; marker-end:url(#g) }
    .in { stroke:#D3002D; stroke-width:3; fill:none; marker-end:url(#r); stroke-dasharray:6 4 }
    .lb { font-family:ui-sans-serif,system-ui; font-size:11px; fill:#5C5C64 }
    .k { font-family:ui-sans-serif,system-ui; font-size:11.5px; font-weight:700 }
  </style>
  <defs>
    <marker id="g" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 z" fill="#1f9d6b"/></marker>
    <marker id="r" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 z" fill="#D3002D"/></marker>
  </defs>
  <rect class="me" x="30" y="86" width="120" height="40" rx="3"/>
  <text class="nt" x="90" y="111" text-anchor="middle">YOUR AS 65001</text>
  <rect class="n" x="470" y="26" width="140" height="38" rx="3"/>
  <text class="nt" x="540" y="50" text-anchor="middle">ISP-A · 64500</text>
  <rect class="n" x="470" y="150" width="140" height="38" rx="3"/>
  <text class="nt" x="540" y="174" text-anchor="middle">ISP-B · 64501</text>
  <line class="l" x1="150" y1="96" x2="470" y2="48"/>
  <line class="l" x1="150" y1="116" x2="470" y2="166"/>
  <path class="out" d="M170,90 L450,46"/>
  <text class="k" x="300" y="58" fill="#1f9d6b">OUT — you decide</text>
  <text class="lb" x="300" y="74">set local-preference 200 (inbound route-map)</text>
  <path class="in" d="M450,172 L172,122"/>
  <text class="k" x="300" y="150" fill="#D3002D">IN — you can only ask</text>
  <text class="lb" x="300" y="166">set as-path prepend (outbound route-map)</text>
  <text class="lb" x="320" y="208" text-anchor="middle">the two directions are controlled by different knobs, applied in opposite directions</text>
</svg>
<figcaption><b>Figure 1.</b> Local preference is applied to routes coming <em>in</em> and steers traffic going <em>out</em>. Prepending is applied to advertisements going <em>out</em> and influences traffic coming <em>in</em> — if the far AS lets it.</figcaption>
</figure>

| You want to control | Use | Applied | Reliable? |
|---|---|---|---|
| Which link **your** traffic leaves by | Local Preference (or Weight) | Inbound route-map | **Yes** — your AS, your rules |
| Which link **their** traffic arrives by | AS_PATH prepend, MED, communities | Outbound route-map | **No** — a request the far AS may ignore |

Inbound traffic engineering is fundamentally harder than outbound, because the decision is being made by somebody else's router under somebody else's policy. Prepending three times usually works. Sometimes nothing works, and the answer is to ask the provider to set a community that their policy honours.

---

## Reading the decision

```text
R1# show ip bgp 203.0.113.0/24
BGP routing table entry for 203.0.113.0/24, version 42
Paths: (3 available, best #2, table default)
  Advertised to update-groups: 1 2

  64500 64502
    10.0.0.2 from 10.0.0.2 (10.0.0.2)
      Origin IGP, metric 0, localpref 100, valid, internal
      rx pathid: 0, tx pathid: 0

  64501
    192.0.2.9 from 192.0.2.9 (192.0.2.9)
      Origin IGP, metric 0, localpref 100, valid, external, best
      rx pathid: 0, tx pathid: 0x0

  64500
    172.16.0.5 from 172.16.0.5 (172.16.0.5)
      Origin IGP, metric 0, localpref 80, valid, external
```

Work the algorithm by hand:

- **Weight** — all 0. Tie.
- **Local preference** — 100, 100, **80**. Path three is eliminated here and nothing else about it is ever examined.
- **Locally originated** — none. Tie.
- **AS_PATH** — path one is `64500 64502` (length 2), path two is `64501` (length **1**). **Path two wins at step 4.**

Everything below step 4 is irrelevant. Note that path two is `external` and path one is `internal`, which would also have favoured path two at step 7 — but the comparison never got that far. Knowing *which step* decided is what lets you change the outcome with the right knob instead of guessing.

<details class="reveal">
<summary>Work one out yourself</summary>

Two paths. A: weight 0, localpref 150, AS_PATH `64500 64500 64777`, origin `i`, MED 10, eBGP. B: weight 0, localpref 150, AS_PATH `64501 64888`, origin `?`, MED 5, eBGP.

Step 1 weight — tie at 0. Step 2 local pref — tie at 150. Step 3 — neither is local. **Step 4 AS_PATH — A is 3, B is 2. B wins.**

Origin and MED would both have mattered had the path lengths tied — and note they point in *opposite* directions here: origin favours A (`i` beats `?`), MED favours B (5 beats 10). Neither is consulted. The order is everything.
</details>

---

## What goes wrong

**You set MED and nothing happened.** The two paths came from different neighbouring autonomous systems, so step 6 was skipped. Or something above step 6 already decided.

**You prepended five times and traffic still arrives the same way.** The far AS is setting local preference, which is step 2. Your prepending at step 4 is never reached. Ask them for a community instead.

**Two routers in your AS disagree.** Somebody set `weight` on one of them. Weight does not propagate. Use local preference for anything AS-wide.

**Best path changes after a reload with no config change.** Step 9 prefers the oldest path, and "oldest" depends on which session came up first. Add `bgp bestpath compare-routerid` for deterministic behaviour.

**A redistributed prefix keeps losing.** Origin `?` loses to origin `i` at step 5. Use a `network` statement instead.

**`maximum-paths` is set but only one path installs.** The paths must be equal on every attribute through step 8 — same weight, same local pref, same AS_PATH *length*, same origin, same MED. Check with `show ip bgp <prefix>` and compare them line by line.

---

<div class="lab">
<div class="lab-head">Lab — walk the algorithm, one step at a time</div>
<div class="lab-body">

**Build:** your AS 65001 with one router R1, dual-homed to two providers — R2 (AS 64500) and R3 (AS 64501). Both providers originate the same prefix 203.0.113.0/24 so there are two competing paths.

**Task 1 — baseline.**
Bring up both eBGP sessions. `show ip bgp 203.0.113.0/24`. Record which path is best and **work out which step decided it**. Write the step number down before continuing.

**Task 2 — step 4.**
On R2, prepend its own AS twice outbound. Confirm on R1 that best path moves to R3, and that `show ip bgp` shows the longer AS_PATH.

**Task 3 — step 2 beats step 4.**
Leaving the prepending in place, on R1 apply an inbound route-map from R2 setting local preference 200. Best path should move **back** to R2 despite the longer AS_PATH. This is the single most important observation in the lab: a higher step overrides a lower one completely.

**Task 4 — step 1 beats everything.**
Leave everything. Add `neighbor <R3> weight 500` on R1. Best path moves to R3. Now remove the weight and confirm it moves back.

**Task 5 — MED, and why it usually does nothing.**
Remove the local preference and weight. Set MED on R2 outbound to 50 and on R3 to 10. Observe that best path does **not** follow MED. Explain why — then add `bgp always-compare-med` on R1 and watch it start to matter.

**Task 6 — origin code.**
On R2, advertise the prefix by redistributing a static instead of with `network`. Confirm the origin changes from `i` to `?` in `show ip bgp`, and that with all else equal R3 now wins at step 5.

**Task 7 — install both.**
Make the two paths identical on every attribute through step 8, add `maximum-paths 2`, and confirm two next hops appear in `show ip route 203.0.113.0`.

**Record:** for each task, the output of `show ip bgp 203.0.113.0/24` and the step number that decided. Seven outputs, seven step numbers — that table is the revision material.

</div>
</div>

---

## Test yourself

<div class="qz">
<p class="qz-q"><span class="qz-num">Q1</span>Path A has local preference 150 and an AS_PATH of 4 hops. Path B has local preference 100 and an AS_PATH of 1 hop. Which wins?</p>
<label class="qz-opt"><input type="radio" name="bp1"><span>B — the AS_PATH is much shorter</span><em class="qz-fb qz-bad">AS_PATH is step 4. Local preference is step 2, and the comparison stops at the first difference.</em></label>
<label class="qz-opt"><input type="radio" name="bp1"><span>A — local preference is higher, and it is checked first</span><em class="qz-fb qz-good">Correct. Step 2 decides and step 4 is never reached. A higher step always overrides a lower one completely.</em></label>
<label class="qz-opt"><input type="radio" name="bp1"><span>Both — BGP load balances across them</span><em class="qz-fb qz-bad">BGP installs one path unless maximum-paths is configured <em>and</em> the attributes are equal.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q2</span>You want return traffic from the internet to arrive over ISP-A instead of ISP-B. Which is the right tool?</p>
<label class="qz-opt"><input type="radio" name="bp2"><span>Set local preference higher on ISP-A's routes inbound</span><em class="qz-fb qz-bad">Local preference controls which way <em>your</em> traffic leaves. It has no effect on inbound.</em></label>
<label class="qz-opt"><input type="radio" name="bp2"><span>Prepend your AS on advertisements sent outbound to ISP-B</span><em class="qz-fb qz-good">Right — make the ISP-B path look longer so others avoid it. But it is a request: if the far AS sets local preference, your prepend at step 4 is never reached.</em></label>
<label class="qz-opt"><input type="radio" name="bp2"><span>Set weight higher on ISP-A</span><em class="qz-fb qz-bad">Weight is local to one router and never leaves it.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q3</span>You set MED on two providers and best path ignores it. Most likely why?</p>
<label class="qz-opt"><input type="radio" name="bp3"><span>MED is only compared between paths from the same neighbouring AS</span><em class="qz-fb qz-good">Yes. Different neighbour ASes means step 6 is skipped entirely, unless you add bgp always-compare-med.</em></label>
<label class="qz-opt"><input type="radio" name="bp3"><span>MED prefers the highest value, so you set it backwards</span><em class="qz-fb qz-bad">Lowest MED wins — but that is not what is happening here.</em></label>
<label class="qz-opt"><input type="radio" name="bp3"><span>MED only applies to iBGP</span><em class="qz-fb qz-bad">MED is sent to eBGP neighbours; it just does not propagate beyond them.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q4</span>After a reload, best path for a prefix changed with no configuration change. Which step explains it?</p>
<label class="qz-opt"><input type="radio" name="bp4"><span>Step 5, origin code</span><em class="qz-fb qz-bad">Origin does not change across a reload.</em></label>
<label class="qz-opt"><input type="radio" name="bp4"><span>Step 9, prefer the oldest eBGP path</span><em class="qz-fb qz-good">Correct. "Oldest" depends on which session established first, which depends on boot order. Add bgp bestpath compare-routerid to make it deterministic.</em></label>
<label class="qz-opt"><input type="radio" name="bp4"><span>Step 1, weight — it resets to 0 on reload</span><em class="qz-fb qz-bad">Configured weight survives a reload.</em></label>
</div>

---

## References

- **RFC 4271 §9.1** — Decision Process. The standard's version of the order.
- **RFC 4451** — BGP MULTI_EXIT_DISC (MED) Considerations.
- **RFC 1997** — BGP Communities Attribute.
- **RFC 7454** — BGP Operations and Security.
- Cisco — [BGP Best Path Selection Algorithm](https://www.cisco.com/c/en/us/support/docs/ip/border-gateway-protocol-bgp/13753-25.html)
- Cisco — [Load Sharing with BGP](https://www.cisco.com/c/en/us/support/docs/ip/border-gateway-protocol-bgp/13762-40.html)

---

**Previous:** [BGP neighbours — the six states and why your session says Active](/blog/bgp-neighbors-states-and-why-the-session-wont-come-up).

*Part of the [CCNA, ENCOR and ENARSI topic-by-topic study guide](/blog/ccna-ccnp-study-guide).*
