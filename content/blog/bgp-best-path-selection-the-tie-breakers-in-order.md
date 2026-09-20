---
title: "BGP Best Path Selection: The Tie-Breakers in Order, and Which Two You Should Actually Use"
excerpt: "BGP installs exactly one path and ignores the rest. Eleven tests decide which, in a fixed order, and the first difference wins. Here is every step, what each one is really for, and the direction problem that catches everybody: the knob that controls your outbound traffic does nothing to your inbound."
date: "2026-09-14"
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

Three real candidates for the same prefix, and the algorithm run over them one step at a time. Watch what gets eliminated, and — more importantly — what never gets examined at all.

<div class="walk">
<div class="walk-head">One prefix, three paths, the algorithm in motion <span class="walk-hint">click a step</span></div>
<div class="walk-tabs">
  <input type="radio" name="bpw" id="bp1" checked><label for="bp1"><span class="step-n">1</span>Weight</label>
  <input type="radio" name="bpw" id="bp2"><label for="bp2"><span class="step-n">2</span>Local pref</label>
  <input type="radio" name="bpw" id="bp3"><label for="bp3"><span class="step-n">3</span>Origin / local</label>
  <input type="radio" name="bpw" id="bp4"><label for="bp4"><span class="step-n">4</span>AS_PATH</label>
  <input type="radio" name="bpw" id="bp5"><label for="bp5"><span class="step-n">5</span>Never reached</label>
</div>
<div class="walk-panels">
<div class="walk-panel">
<svg class="sv1" viewBox="0 0 640 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="STEP 1 — WEIGHT, HIGHEST WINS">
  <style>.sv1 .m{font-family:ui-monospace,Menlo,monospace;font-size:11.5px;fill:#17171A}.sv1 .h{font-family:ui-sans-serif,system-ui;font-size:10px;font-weight:700;fill:#8A8A93;letter-spacing:.06em}.sv1 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv1 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}</style>
  <text class="k" x="14" y="24" fill="#5C5C64">STEP 1 — WEIGHT, HIGHEST WINS</text>
  <text class="s" x="14" y="44">All three are 0, the default for a path not learned locally. Nothing is eliminated.</text>
  <text class="h" x="14" y="76">PATH</text><text class="h" x="86" y="76">WEIGHT</text><text class="h" x="146" y="76">LOCPRF</text>
  <text class="h" x="214" y="76">AS_PATH</text><text class="h" x="366" y="76">ORG</text><text class="h" x="420" y="76">MED</text><text class="h" x="474" y="76">TYPE</text>
  <line x1="10" y1="82" x2="560" y2="82" stroke="#D9D9DE"/>
  <g opacity="1"><text class="m" x="14" y="96">A</text><text class="m" x="86" y="96">0</text><text class="m" x="146" y="96">100</text><text class="m" x="214" y="96">64500 64502</text><text class="m" x="366" y="96">i</text><text class="m" x="420" y="96">0</text><text class="m" x="474" y="96" fill="#5C5C64">iBGP</text></g>
  <g opacity="1"><text class="m" x="14" y="120">B</text><text class="m" x="86" y="120">0</text><text class="m" x="146" y="120">100</text><text class="m" x="214" y="120">64501</text><text class="m" x="366" y="120">i</text><text class="m" x="420" y="120">0</text><text class="m" x="474" y="120" fill="#5C5C64">eBGP</text></g>
  <g opacity="1"><text class="m" x="14" y="144">C</text><text class="m" x="86" y="144">0</text><text class="m" x="146" y="144"> 80</text><text class="m" x="214" y="144">64500</text><text class="m" x="366" y="144">i</text><text class="m" x="420" y="144">0</text><text class="m" x="474" y="144" fill="#5C5C64">eBGP</text></g>
  <text class="k" x="14" y="182" fill="#5C5C64">Tie. Move to step 2.</text>
</svg>
<p class="walk-say"><span class="walk-title">Weight — Cisco-only, and local to one router</span>
Weight is <b>never advertised</b>. It exists only inside the router you set it on, which makes it the bluntest and most local tool in the list: perfect for forcing one router's choice, useless for influencing a network. Default 0 for learned paths, 32768 for locally originated ones.
<br><br>Because it is first, weight overrides everything else. That is convenient and dangerous in equal measure — a weight set during an incident three years ago will still be quietly beating your carefully designed local preference today.</p>
</div>
<div class="walk-panel">
<svg class="sv2" viewBox="0 0 640 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="STEP 2 — LOCAL PREFERENCE, HIGHEST WINS">
  <style>.sv2 .m{font-family:ui-monospace,Menlo,monospace;font-size:11.5px;fill:#17171A}.sv2 .h{font-family:ui-sans-serif,system-ui;font-size:10px;font-weight:700;fill:#8A8A93;letter-spacing:.06em}.sv2 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv2 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}</style>
  <text class="k" x="14" y="24" fill="#B80027">STEP 2 — LOCAL PREFERENCE, HIGHEST WINS</text>
  <text class="s" x="14" y="44">A and B are 100. C is 80 and is eliminated here.</text>
  <text class="h" x="14" y="76">PATH</text><text class="h" x="86" y="76">WEIGHT</text><text class="h" x="146" y="76">LOCPRF</text>
  <text class="h" x="214" y="76">AS_PATH</text><text class="h" x="366" y="76">ORG</text><text class="h" x="420" y="76">MED</text><text class="h" x="474" y="76">TYPE</text>
  <line x1="10" y1="82" x2="560" y2="82" stroke="#D9D9DE"/>
  <g opacity="1"><text class="m" x="14" y="96">A</text><text class="m" x="86" y="96">0</text><text class="m" x="146" y="96">100</text><text class="m" x="214" y="96">64500 64502</text><text class="m" x="366" y="96">i</text><text class="m" x="420" y="96">0</text><text class="m" x="474" y="96" fill="#5C5C64">iBGP</text></g>
  <g opacity="1"><text class="m" x="14" y="120">B</text><text class="m" x="86" y="120">0</text><text class="m" x="146" y="120">100</text><text class="m" x="214" y="120">64501</text><text class="m" x="366" y="120">i</text><text class="m" x="420" y="120">0</text><text class="m" x="474" y="120" fill="#5C5C64">eBGP</text></g>
  <g opacity="0.35"><text class="m" x="14" y="144">C</text><text class="m" x="86" y="144">0</text><text class="m" x="146" y="144"> 80</text><text class="m" x="214" y="144">64500</text><text class="m" x="366" y="144">i</text><text class="m" x="420" y="144">0</text><text class="m" x="474" y="144" fill="#D3002D">eBGP</text></g>
  <text class="k" x="14" y="182" fill="#B80027">C is out. Nothing else about C will ever be looked at.</text>
  <line x1="10" y1="140" x2="520" y2="140" stroke="#D3002D" stroke-width="1.5"/>
</svg>
<p class="walk-say"><span class="walk-title">Local preference — the one you actually design with</span>
Unlike weight, local pref <b>is</b> advertised to iBGP peers, so it lets you make a consistent decision across your whole AS: "everyone prefer the London transit". Default 100, and <b>higher wins</b> — which is the opposite of almost every other metric in networking and catches people constantly.
<br><br>Note what just happened to path C. It is eliminated at step 2, so its AS_PATH, its origin and its MED are <b>never compared</b>. If somebody later asks why C was not chosen despite its shorter AS_PATH, the answer is that the algorithm stopped caring three steps earlier.</p>
</div>
<div class="walk-panel">
<svg class="sv3" viewBox="0 0 640 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="STEP 3 — LOCALLY ORIGINATED WINS">
  <style>.sv3 .m{font-family:ui-monospace,Menlo,monospace;font-size:11.5px;fill:#17171A}.sv3 .h{font-family:ui-sans-serif,system-ui;font-size:10px;font-weight:700;fill:#8A8A93;letter-spacing:.06em}.sv3 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv3 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}</style>
  <text class="k" x="14" y="24" fill="#5C5C64">STEP 3 — LOCALLY ORIGINATED WINS</text>
  <text class="s" x="14" y="44">Neither A nor B was originated on this router. No effect.</text>
  <text class="h" x="14" y="76">PATH</text><text class="h" x="86" y="76">WEIGHT</text><text class="h" x="146" y="76">LOCPRF</text>
  <text class="h" x="214" y="76">AS_PATH</text><text class="h" x="366" y="76">ORG</text><text class="h" x="420" y="76">MED</text><text class="h" x="474" y="76">TYPE</text>
  <line x1="10" y1="82" x2="560" y2="82" stroke="#D9D9DE"/>
  <g opacity="1"><text class="m" x="14" y="96">A</text><text class="m" x="86" y="96">0</text><text class="m" x="146" y="96">100</text><text class="m" x="214" y="96">64500 64502</text><text class="m" x="366" y="96">i</text><text class="m" x="420" y="96">0</text><text class="m" x="474" y="96" fill="#5C5C64">iBGP</text></g>
  <g opacity="1"><text class="m" x="14" y="120">B</text><text class="m" x="86" y="120">0</text><text class="m" x="146" y="120">100</text><text class="m" x="214" y="120">64501</text><text class="m" x="366" y="120">i</text><text class="m" x="420" y="120">0</text><text class="m" x="474" y="120" fill="#5C5C64">eBGP</text></g>
  <g opacity="0.35"><text class="m" x="14" y="144">C</text><text class="m" x="86" y="144">0</text><text class="m" x="146" y="144"> 80</text><text class="m" x="214" y="144">64500</text><text class="m" x="366" y="144">i</text><text class="m" x="420" y="144">0</text><text class="m" x="474" y="144" fill="#D3002D">eBGP</text></g>
  <text class="k" x="14" y="182" fill="#5C5C64">Tie. Move to step 4.</text>
  <line x1="10" y1="140" x2="520" y2="140" stroke="#D3002D" stroke-width="1.5"/>
</svg>
<p class="walk-say"><span class="walk-title">Locally originated — a path you injected yourself</span>
A route this router put into BGP with a <code>network</code> statement, or by redistribution or aggregation, beats one learned from a peer. It is rarely the deciding step in practice, but it explains a behaviour that surprises people: <b>your own advertisement of a prefix always wins locally</b>, even when a peer is offering a better-looking path to the same thing.</p>
</div>
<div class="walk-panel">
<svg class="sv4" viewBox="0 0 640 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="STEP 4 — AS_PATH, SHORTEST WINS">
  <style>.sv4 .m{font-family:ui-monospace,Menlo,monospace;font-size:11.5px;fill:#17171A}.sv4 .h{font-family:ui-sans-serif,system-ui;font-size:10px;font-weight:700;fill:#8A8A93;letter-spacing:.06em}.sv4 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv4 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}</style>
  <text class="k" x="14" y="24" fill="#0f6b47">STEP 4 — AS_PATH, SHORTEST WINS</text>
  <text class="s" x="14" y="44">A is two AS hops. B is one. B wins here, and the comparison stops.</text>
  <text class="h" x="14" y="76">PATH</text><text class="h" x="86" y="76">WEIGHT</text><text class="h" x="146" y="76">LOCPRF</text>
  <text class="h" x="214" y="76">AS_PATH</text><text class="h" x="366" y="76">ORG</text><text class="h" x="420" y="76">MED</text><text class="h" x="474" y="76">TYPE</text>
  <line x1="10" y1="82" x2="560" y2="82" stroke="#D9D9DE"/>
  <g opacity="0.35"><text class="m" x="14" y="96">A</text><text class="m" x="86" y="96">0</text><text class="m" x="146" y="96">100</text><text class="m" x="214" y="96">64500 64502</text><text class="m" x="366" y="96">i</text><text class="m" x="420" y="96">0</text><text class="m" x="474" y="96" fill="#D3002D">iBGP</text></g>
  <g opacity="1"><text class="m" x="14" y="120">B</text><text class="m" x="86" y="120">0</text><text class="m" x="146" y="120">100</text><text class="m" x="214" y="120">64501</text><text class="m" x="366" y="120">i</text><text class="m" x="420" y="120">0</text><text class="m" x="474" y="120" fill="#0f6b47">eBGP</text></g>
  <g opacity="0.35"><text class="m" x="14" y="144">C</text><text class="m" x="86" y="144">0</text><text class="m" x="146" y="144"> 80</text><text class="m" x="214" y="144">64500</text><text class="m" x="366" y="144">i</text><text class="m" x="420" y="144">0</text><text class="m" x="474" y="144" fill="#D3002D">eBGP</text></g>
  <text class="k" x="14" y="182" fill="#0f6b47">B is best. Steps 5 to 12 are not evaluated.</text>
  <line x1="10" y1="92" x2="520" y2="92" stroke="#D3002D" stroke-width="1.5"/><line x1="10" y1="140" x2="520" y2="140" stroke="#D3002D" stroke-width="1.5"/>
</svg>
<p class="walk-say"><span class="walk-title">AS_PATH — where most decisions are actually made</span>
Count the AS numbers, fewest wins. This is the step that settles the majority of real comparisons, which is why <b>AS-path prepending</b> is the standard way to make one of your links less attractive to the outside world.
<br><br>Two things that are not obvious: a confederation sub-AS does <b>not</b> count toward the length, and an <code>AS_SET</code> from an aggregate counts as <b>one</b> however many AS numbers are in it. Both mean the number you count by eye can differ from the number BGP uses.</p>
</div>
<div class="walk-panel">
<svg class="sv5" viewBox="0 0 640 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="STEPS 5–12 — NEVER CONSULTED">
  <style>.sv5 .m{font-family:ui-monospace,Menlo,monospace;font-size:11.5px;fill:#17171A}.sv5 .h{font-family:ui-sans-serif,system-ui;font-size:10px;font-weight:700;fill:#8A8A93;letter-spacing:.06em}.sv5 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv5 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}</style>
  <text class="k" x="14" y="24" fill="#B26014">STEPS 5–12 — NEVER CONSULTED</text>
  <text class="s" x="14" y="44">Origin, MED, eBGP-over-iBGP, IGP metric, age, router ID. All irrelevant here.</text>
  <text class="h" x="14" y="76">PATH</text><text class="h" x="86" y="76">WEIGHT</text><text class="h" x="146" y="76">LOCPRF</text>
  <text class="h" x="214" y="76">AS_PATH</text><text class="h" x="366" y="76">ORG</text><text class="h" x="420" y="76">MED</text><text class="h" x="474" y="76">TYPE</text>
  <line x1="10" y1="82" x2="560" y2="82" stroke="#D9D9DE"/>
  <g opacity="0.35"><text class="m" x="14" y="96">A</text><text class="m" x="86" y="96">0</text><text class="m" x="146" y="96">100</text><text class="m" x="214" y="96">64500 64502</text><text class="m" x="366" y="96">i</text><text class="m" x="420" y="96">0</text><text class="m" x="474" y="96" fill="#D3002D">iBGP</text></g>
  <g opacity="1"><text class="m" x="14" y="120">B</text><text class="m" x="86" y="120">0</text><text class="m" x="146" y="120">100</text><text class="m" x="214" y="120">64501</text><text class="m" x="366" y="120">i</text><text class="m" x="420" y="120">0</text><text class="m" x="474" y="120" fill="#0f6b47">eBGP</text></g>
  <g opacity="0.35"><text class="m" x="14" y="144">C</text><text class="m" x="86" y="144">0</text><text class="m" x="146" y="144"> 80</text><text class="m" x="214" y="144">64500</text><text class="m" x="366" y="144">i</text><text class="m" x="420" y="144">0</text><text class="m" x="474" y="144" fill="#D3002D">eBGP</text></g>
  <text class="k" x="14" y="182" fill="#B26014">The decision was made at step 4. Everything below it is decoration.</text>
  <line x1="10" y1="92" x2="520" y2="92" stroke="#D3002D" stroke-width="1.5"/><line x1="10" y1="140" x2="520" y2="140" stroke="#D3002D" stroke-width="1.5"/>
</svg>
<p class="walk-say"><span class="walk-title">The point of the whole exercise</span>
B is also <code>external</code> where A is <code>internal</code>, so step 7 would have chosen B as well. <b>It never ran.</b> That distinction matters enormously when you try to change the outcome: adjusting MED here would do nothing at all, because MED is step 6 and the decision was taken at step 4.
<br><br>So the practical skill is not memorising twelve steps. It is <b>identifying which step decided</b>, because that tells you the only knob that can change the answer. Everything above it overrides you; everything below it is never reached.</p>
</div>
</div>
</div>


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

### The three knobs, and which direction each one works in

<div class="cmd">
<div class="cmd-line">route-map PREFER-ISP-A permit 10
 <span class="t">set weight</span> <span class="opt">200</span>
 <span class="t">set local-preference</span> <span class="opt">200</span>
!
route-map MAKE-ME-LESS-ATTRACTIVE permit 10
 <span class="t">set as-path prepend</span> <span class="opt">65001 65001 65001</span>
 <span class="t">set metric</span> <span class="opt">50</span>
!
router bgp 65001
 neighbor 192.0.2.9 route-map PREFER-ISP-A <span class="t">in</span>
 neighbor 192.0.2.9 route-map MAKE-ME-LESS-ATTRACTIVE <span class="t">out</span></div>
<dl class="cmd-parts">
<div><dt>set weight</dt><dd><b>Step 1, and this router only.</b> Never advertised, so it influences nothing beyond the box it is typed on. Use it to fix one router's behaviour; never use it to express a network-wide policy, because the other routers will not know about it.</dd></div>
<div class="is-key"><dt>set local-preference</dt><dd><b>Step 2, and AS-wide.</b> Advertised to every iBGP peer, so setting it once on your border router makes the whole AS agree. <b>Higher wins</b> — the opposite of most metrics. This is the correct tool for "all our outbound traffic should prefer this transit".</dd></div>
<div class="is-key"><dt>set as-path prepend</dt><dd><b>Step 4, and outbound.</b> Weight and local pref only affect <em>your</em> choice of exit; they cannot influence how traffic comes <b>in</b>. Prepending makes your advertisement look longer to the outside world so other people's routers pick a different entry point. It is a request, not an instruction — anyone can override it with their own local preference, and large transit providers frequently do.</dd></div>
<div><dt>set metric (MED)</dt><dd><b>Step 6, outbound, and usually ignored.</b> MED suggests to a neighbouring AS which of <em>your</em> links it should use — <b>lowest wins</b>. It is only compared between paths from the <b>same</b> neighbouring AS unless <code>bgp always-compare-med</code> is set, and most providers strip it or override it with local preference long before it is reached. Treat it as a polite request that will probably be ignored.</dd></div>
<div class="is-key"><dt>route-map ... in / out</dt><dd>The direction is the part people reverse. <b><code>in</code></b> changes attributes on routes you <em>receive</em>, which affects where <b>your</b> traffic exits. <b><code>out</code></b> changes what you <em>advertise</em>, which is the only way to influence where other people's traffic enters. Outbound traffic and inbound traffic are two separate problems and they need two different tools.</dd></div>
</dl>
</div>

## The direction problem

This is the single most useful thing to understand about BGP policy, and it is the thing most people get wrong first.

<figure class="fig">
<svg class="sv6" viewBox="0 0 640 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Local preference controls outbound traffic, AS path prepending influences inbound traffic">
  <style>.sv6 .n{ fill:#17171A }.sv6 .me{ fill:#D3002D }.sv6 .nt{ fill:#FAF8F5; font-family:ui-sans-serif,system-ui; font-size:12px; font-weight:700 }.sv6 .l{ stroke:#8A8A93; stroke-width:1.5 }.sv6 .out{ stroke:#1f9d6b; stroke-width:3; fill:none; marker-end:url(#g) }.sv6 .in{ stroke:#D3002D; stroke-width:3; fill:none; marker-end:url(#r); stroke-dasharray:6 4 }.sv6 .lb{ font-family:ui-sans-serif,system-ui; font-size:11px; fill:#5C5C64 }.sv6 .k{ font-family:ui-sans-serif,system-ui; font-size:11.5px; font-weight:700 }
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

<div class="term">
<div class="term-bar"><span class="term-dots"><i></i><i></i><i></i></span>R1 — three paths, and the word that names the winner</div>
<pre><span class="p">R1#</span> <span class="c">show ip bgp 203.0.113.0/24</span>
BGP routing table entry for 203.0.113.0/24, version 42
Paths: (3 available, <span class="y">best #2</span>, table default)
  Advertised to update-groups: 1 2

  <span class="y">64500 64502</span>                                <span class="o">&lt;- two AS hops</span>
    10.0.0.2 from 10.0.0.2 (10.0.0.2)
      Origin IGP, metric 0, <span class="y">localpref 100</span>, valid, <span class="y">internal</span>
      rx pathid: 0, tx pathid: 0

  <span class="g">64501</span>                                      <span class="o">&lt;- one AS hop. This is why it wins.</span>
    192.0.2.9 from 192.0.2.9 (192.0.2.9)
      Origin IGP, metric 0, <span class="y">localpref 100</span>, valid, external, <span class="g">best</span>
      rx pathid: 0, tx pathid: 0x0

  64500
    172.16.0.5 from 172.16.0.5 (172.16.0.5)
      Origin IGP, metric 0, <span class="r">localpref 80</span>, valid, external
                                                 <span class="o">^ eliminated at step 2</span><span class="cur"></span></pre>
</div>
<p class="term-cap"><b>Two words carry the whole answer: <code>best</code>, and the <code>localpref</code> that is not 100.</b> Read the attributes in algorithm order rather than down the page — weight (absent, so 0), then localpref, then path length — and stop at the first column where they differ. That column is your only lever.</p>

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

<div class="real">
<b>In the real world</b>
Almost every "BGP is picking the wrong path" ticket is really one of two things. Either <b>somebody is adjusting a knob below the step that is actually deciding</b> — tuning MED when the AS_PATH already settled it, which changes nothing and looks like BGP is broken — or <b>a weight left behind by a previous incident</b> is silently overriding a carefully designed local preference from step 1. Before changing anything, run <code>show ip bgp &lt;prefix&gt;</code> and find the first attribute where the candidates differ. That column is the only one worth touching, and it is very often not the one in the change request.
</div>

<div class="lab">
<div class="lab-head">Lab — force each step of the algorithm to be the deciding one</div>
<div class="lab-body">

<div class="lab-target"><b>Target</b>
Build a prefix reachable by three different paths and then, one at a time, make <em>each</em> step of the decision process the one that settles it — weight, then local preference, then AS_PATH, then MED — confirming at every stage which attribute changed the answer and which ones became irrelevant. Then demonstrate the direction problem: influence your outbound traffic, fail to influence inbound with the same tool, and fix it with the right one.</div>

**Topology.** R1 in AS 65001 with two eBGP peers — R2 (AS 64500) and R3 (AS 64501) — and one iBGP peer R4. All three can reach 203.0.113.0/24, R2 via a longer AS path than R3.

<p class="lab-step"><span class="n">1</span>Establish the baseline and name the deciding step</p>

```cisco
R1# show ip bgp 203.0.113.0/24
```

Work down the attributes in algorithm order and write down **which step decided**, before changing anything.

<div class="lab-watch"><b>Things to notice</b>
With everything at default, the decision will fall to AS_PATH at step 4. Note the exact attribute values for all three paths — you are going to change them one at a time and this is your control.</div>

<p class="lab-step"><span class="n">2</span>Beat it from above with local preference</p>

```cisco
route-map PREFER-LONG permit 10
 set local-preference 200
!
router bgp 65001
 neighbor <R2> route-map PREFER-LONG in
```

Then `clear ip bgp * soft in`.

<div class="lab-watch"><b>Things to notice</b>
The path with the <b>longer</b> AS_PATH is now best, because step 2 runs before step 4 and never reaches it. This is the single most important thing to internalise: <b>an earlier step beats any later one, however much better the later attribute looks.</b> Confirm with <code>show ip bgp 203.0.113.0/24</code> that the AS_PATH lengths have not changed at all — only the winner has.</div>

<p class="lab-step"><span class="n">3</span>Beat local preference from above with weight</p>

```cisco
router bgp 65001
 neighbor <R3> weight 200
```

<div class="lab-watch"><b>Things to notice</b>
Weight is step 1, so it overrides the local preference you just set. Now check R4: <b>R4's choice has not changed at all</b>, because weight was never advertised. You have created the exact situation where two routers in the same AS disagree about the best path — which is how traffic ends up taking a route nobody designed. Remove the weight and watch R1 fall back to agreeing with R4.</div>

<p class="lab-step"><span class="n">4</span>Make MED the deciding step — which takes effort</p>

Remove the weight and the route-map, then make the two eBGP paths **identical** in every respect above step 6: same local preference, same AS_PATH length, same origin. Only then set different MEDs.

<div class="lab-issues"><b>Possible issues</b>
<ul>
<li><b>MED appears to do nothing</b> — something above it is still deciding. Recheck with <code>show ip bgp</code> that the AS_PATH lengths genuinely match; prepending on one side is the usual culprit.</li>
<li><b>The paths are from different neighbouring AS numbers</b> — MED is only compared between paths from the <b>same</b> AS by default. Either use two links to the same peer AS or set <code>bgp always-compare-med</code>, and note in your own words why that command is considered risky.</li>
<li><b>Lower MED did not win</b> — check you have not reversed it. MED is <b>lowest wins</b>, unlike local preference.</li>
</ul>
The effort this step takes is the lesson. MED is so far down the list that in a real network something almost always decides before it.</div>

<p class="lab-step"><span class="n">5</span>Try to influence inbound traffic with the wrong tool</p>

Set a very high local preference for routes learned from R2, then check, from R2's side, which path **R2** uses to reach your prefix.

<div class="lab-watch"><b>Things to notice</b>
Nothing changed for R2. Local preference is <b>never advertised outside your AS</b>, so it cannot possibly influence what somebody else does — it only chose your own exit. This is the direction problem, and producing it deliberately once is the cheapest way never to confuse the two again.</div>

<p class="lab-step"><span class="n">6</span>Now do it with the right tool</p>

```cisco
route-map LESS-ATTRACTIVE permit 10
 set as-path prepend 65001 65001 65001
!
router bgp 65001
 neighbor <R2> route-map LESS-ATTRACTIVE out
```

<div class="lab-watch"><b>Things to notice</b>
Check on R2 that your prefix now carries a four-AS path instead of one, and that R2 has switched to entering your AS via R3. Then do the thing that shows prepending's real limitation: on R2, set a high local preference for the prepended path. <b>R2 goes back to using it.</b> Your three prepends are step 4; R2's local preference is step 2, and step 2 wins.
<br><br>That is why prepending is a request rather than an instruction, and why a transit provider can ignore it entirely.</div>

<div class="lab-earned"><b>What you earned</b>
You can look at <code>show ip bgp &lt;prefix&gt;</code> and name the step that decided, which tells you the only attribute worth changing — and stops you spending an afternoon adjusting a MED that is never evaluated. You have watched an earlier step override a later one in both directions, and watched weight create a disagreement between two routers in the same AS. And you know from having tried it that outbound and inbound are separate problems: local preference for where your traffic leaves, prepending for where other people's traffic arrives, and even then only as a suggestion the other side may override.</div>

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
