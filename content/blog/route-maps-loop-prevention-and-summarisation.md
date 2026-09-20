---
title: "Route Maps, Tags and Split Horizon: Stopping Routes Going Round in Circles"
excerpt: "A route map is an ordered list with an invisible deny at the end, and that last part causes more outages than anything else in it. Combine it with a tag applied on the way in and matched on the way out, and you have the one redistribution loop prevention that works regardless of topology."
date: "2026-09-21"
tags: ["Route maps", "Redistribution", "Tags", "Split horizon", "Summarisation", "ENARSI"]
draft: false
---

> **Blueprint:** ENARSI 300-410 — 1.2 *Troubleshoot route map for any routing protocol (attributes, tagging, filtering, weight, and limitations)*, 1.3 *Troubleshoot loop prevention mechanisms (filtering, tagging, split horizon, route poisoning)*, 1.5 *Troubleshoot manual and auto-summarization with any routing protocol*.

## Cheat sheet

| Route map fact | Consequence |
|---|---|
| Processed by **sequence number**, lowest first | Order is everything |
| First match wins, **processing stops** | A broad match early hides everything after it |
| **Implicit `deny` at the end** | **Anything unmatched is dropped.** The number one outage cause |
| `match` with no statement | Matches **everything** |
| Multiple `match` on one line | **OR** |
| Multiple `match` lines | **AND** |
| `set` without `match` | Applies to everything the clause reaches |

| Loop prevention | Where |
|---|---|
| **Split horizon** | Do not advertise a route back out the interface it came in |
| **Route poisoning** | Advertise the failed route with infinite metric |
| **Tagging** | Mark on redistribution, **deny on the way back** |
| **AD manipulation** | Make the wrong path less attractive |
| **Filtering** | Prefix lists, distribute lists |

| Summarisation | |
|---|---|
| **EIGRP** | `ip summary-address eigrp AS x.x.x.x mask` — **per interface** |
| **OSPF** | `area X range` on **ABR**; `summary-address` on **ASBR** |
| **BGP** | `aggregate-address … summary-only` |
| **The discard route** | A `Null0` route auto-created to prevent loops. **Do not remove it** |

**The sentence that prevents the outage.** Every route map ends with an invisible **deny any**. Write a map to set one attribute on one prefix and apply it as a distribute list, and **every other route is silently discarded**. You need an explicit empty permit clause at the end — and its absence is the single most common route-map mistake there is.

---

## The implicit deny

<figure class="fig">
<svg class="sv1" viewBox="0 0 640 265" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A route map with two clauses silently drops everything that does not match either">
  <style>.sv1 .m{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;fill:#17171A}.sv1 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv1 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv1 .ok{fill:rgba(31,157,107,.14);stroke:#1f9d6b}.sv1 .bad{fill:rgba(211,0,45,.14);stroke:#D3002D}.sv1 .f{fill:#F1EEE9;stroke:#B5B5BC}
  </style>
  <rect class="ok" x="14" y="30" width="612" height="30"/>
  <text class="m" x="26" y="50">route-map SET-METRIC permit 10     match ip address prefix-list BRANCHES</text>
  <rect class="ok" x="14" y="66" width="612" height="30"/>
  <text class="m" x="26" y="86">route-map SET-METRIC permit 20     match ip address prefix-list DC</text>
  <rect class="bad" x="14" y="102" width="612" height="46"/>
  <text class="m" x="26" y="122" fill="#B80027">route-map SET-METRIC deny 99999    ← YOU DID NOT TYPE THIS</text>
  <text class="s" x="26" y="140">and it drops every prefix that matched neither of the two above</text>
  <rect class="f" x="14" y="166" width="612" height="40"/>
  <text class="k" x="26" y="190">Fix: an explicit empty permit clause at the end.</text>
  <rect class="ok" x="14" y="212" width="612" height="30"/>
  <text class="m" x="26" y="232">route-map SET-METRIC permit 100    ← no match statement = match everything</text>
  <text class="s" x="14" y="258">The same rule applies to prefix lists and ACLs. Every filter in IOS ends with a deny you cannot see.</text>
</svg>
<figcaption><b>Figure 1.</b> Two clauses that look complete, and a third you never wrote doing the damage.</figcaption>
</figure>

<div class="why">
<b>The distinction that trips everyone: filtering versus modifying</b>
The same route map behaves differently depending on where you attach it. As a <b>distribute list</b> or <b>redistribution filter</b>, a clause that does not match means <b>the route is dropped</b>. Used for <b>PBR</b>, an unmatched packet falls through to normal routing instead — it is not discarded.
<br><br>So "route maps end in deny" is not universally fatal; it is fatal <b>wherever the map decides whether a route exists</b>. That is redistribution, distribute lists and BGP neighbour policy — which is most places you will use one.
<br><br>Habit worth forming: <b>write the trailing clause first</b>, before the interesting ones. Then you cannot forget it.
</div>

---

## Loop prevention, four ways

<div class="walk">
<div class="walk-head">How routes come back to bite you <span class="walk-hint">click a step</span></div>
<div class="walk-tabs">
  <input type="radio" name="rmw" id="rm1" checked><label for="rm1"><span class="step-n">1</span>The loop</label>
  <input type="radio" name="rmw" id="rm2"><label for="rm2"><span class="step-n">2</span>Tagging</label>
  <input type="radio" name="rmw" id="rm3"><label for="rm3"><span class="step-n">3</span>Split horizon</label>
  <input type="radio" name="rmw" id="rm4"><label for="rm4"><span class="step-n">4</span>Summary + Null0</label>
</div>
<div class="walk-panels">
<div class="walk-panel">
<svg class="sv2" viewBox="0 0 640 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A route redistributed into one protocol and back into the other creates a loop at two redistribution points">
  <style>.sv2 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv2 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv2 .m{font-family:ui-monospace,Menlo,monospace;font-size:10px;fill:#17171A}.sv2 .n{fill:#17171A}.sv2 .nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:10px;font-weight:700}</style>
  <text class="m" x="120" y="30" text-anchor="middle">OSPF</text>
  <text class="m" x="500" y="30" text-anchor="middle">EIGRP</text>
  <rect class="n" x="70" y="46" width="100" height="28" rx="3"/><text class="nt" x="120" y="64" text-anchor="middle">R1 (ASBR)</text>
  <rect class="n" x="450" y="46" width="100" height="28" rx="3"/><text class="nt" x="500" y="64" text-anchor="middle">R2 (ASBR)</text>
  <path d="M 170 54 L 450 54" stroke="#4b7bec" stroke-width="2" fill="none"/>
  <circle r="4" fill="#4b7bec"><animateMotion dur="1.6s" repeatCount="indefinite" path="M 170 54 L 450 54"/></circle>
  <path d="M 450 68 L 170 68" stroke="#D3002D" stroke-width="2" fill="none"/>
  <circle r="4" fill="#D3002D"><animateMotion dur="1.6s" begin="0.8s" repeatCount="indefinite" path="M 450 68 L 170 68"/></circle>
  <text class="m" x="310" y="44" text-anchor="middle">10.1.0.0/24 into EIGRP</text>
  <text class="m" x="310" y="90" text-anchor="middle" fill="#B80027">…and straight back into OSPF</text>
  <rect x="14" y="110" width="612" height="46" fill="rgba(211,0,45,.08)" stroke="#D3002D"/>
  <text class="k" x="26" y="130" fill="#B80027">The route returns with a better AD than the original, and R1 believes it.</text>
  <text class="s" x="26" y="148">External OSPF is AD 110; internal EIGRP is 90. So the round trip makes the route look BETTER.</text>
  <text class="s" x="14" y="180">Suboptimal at best, a black hole at worst, and it only appears with two or more redistribution points.</text>
</svg>
<p class="walk-say"><span class="walk-title">Two redistribution points is where it goes wrong</span>
With one redistribution point nothing can loop. With <b>two or more</b>, a route can leave OSPF into EIGRP at R1 and re-enter OSPF at R2.
<br><br>What makes it dangerous is administrative distance. A route native to OSPF is AD 110. Coming back as EIGRP internal it is <b>AD 90 — more believable</b>. So R1 prefers the path that goes out through EIGRP and back, which points away from the actual destination.
<br><br>And because everything is "up", nothing logs a problem. You find it by tracing a path that goes somewhere absurd. See <a href="/blog/route-redistribution-seed-metrics-loops-and-tags">the redistribution article</a> for the full treatment — this is the loop-prevention half.</p>
</div>
<div class="walk-panel">
<svg class="sv3" viewBox="0 0 640 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Tagging routes on redistribution and denying tagged routes on the way back prevents the loop">
  <style>.sv3 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv3 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv3 .m{font-family:ui-monospace,Menlo,monospace;font-size:10px;fill:#17171A}.sv3 .n{fill:#17171A}.sv3 .nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:10px;font-weight:700}</style>
  <rect class="n" x="70" y="52" width="100" height="28" rx="3"/><text class="nt" x="120" y="70" text-anchor="middle">R1</text>
  <rect class="n" x="450" y="52" width="100" height="28" rx="3"/><text class="nt" x="500" y="70" text-anchor="middle">R2</text>
  <path d="M 170 60 L 450 60" stroke="#4b7bec" stroke-width="2" fill="none"/>
  <circle r="4" fill="#4b7bec"><animateMotion dur="1.6s" repeatCount="indefinite" path="M 170 60 L 450 60"/></circle>
  <text class="m" x="310" y="50" text-anchor="middle" fill="#2f5fd0">set tag 110  — stamped on the way out</text>
  <path d="M 450 74 L 260 74" stroke="#D3002D" stroke-width="2" stroke-dasharray="5 4" fill="none"/>
  <line x1="250" y1="66" x2="268" y2="82" stroke="#D3002D" stroke-width="2.5"/>
  <line x1="268" y1="66" x2="250" y2="82" stroke="#D3002D" stroke-width="2.5"/>
  <text class="m" x="340" y="98" text-anchor="middle" fill="#B80027">match tag 110 → deny</text>
  <rect x="14" y="118" width="612" height="44" fill="rgba(31,157,107,.10)" stroke="#1f9d6b"/>
  <text class="k" x="26" y="138" fill="#0f6b47">A tag is a 32-bit number that rides with the route and means whatever you decide.</text>
  <text class="s" x="26" y="156">Convention: tag with the AD of the protocol it came from — 110 for OSPF, 90 for EIGRP.</text>
  <text class="s" x="14" y="186">Works in EIGRP, OSPF and BGP. It is the one loop prevention that does not depend on topology.</text>
</svg>
<p class="walk-say"><span class="walk-title">Tagging — the method that always works</span>
On redistribution, <code>set tag 110</code> stamps the route. At every other redistribution point, a route map matching that tag <b>denies it from coming back</b>.
<br><br>Why this beats the alternatives: prefix lists need updating whenever the address plan changes, and AD manipulation is fragile and hard to reason about. <b>A tag travels with the route and needs no maintenance.</b>
<br><br>Apply it at <b>every</b> redistribution point, in both directions, from day one — even with a single point today. The day somebody adds a second one for redundancy, the protection is already there, and nobody has to remember why it matters.</p>
</div>
<div class="walk-panel">
<svg class="sv4" viewBox="0 0 640 195" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Split horizon stops a router advertising a route back out the interface it learned it on">
  <style>.sv4 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv4 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv4 .m{font-family:ui-monospace,Menlo,monospace;font-size:10px;fill:#17171A}.sv4 .n{fill:#17171A}.sv4 .nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:10px;font-weight:700}</style>
  <rect class="n" x="50" y="56" width="90" height="28" rx="3"/><text class="nt" x="95" y="74" text-anchor="middle">R1</text>
  <rect class="n" x="280" y="56" width="90" height="28" rx="3"/><text class="nt" x="325" y="74" text-anchor="middle">R2</text>
  <path d="M 140 64 L 280 64" stroke="#4b7bec" stroke-width="2" fill="none"/>
  <circle r="4" fill="#4b7bec"><animateMotion dur="1.6s" repeatCount="indefinite" path="M 140 64 L 280 64"/></circle>
  <path d="M 280 78 L 150 78" stroke="#D3002D" stroke-width="2" stroke-dasharray="5 4" fill="none"/>
  <line x1="200" y1="70" x2="218" y2="86" stroke="#D3002D" stroke-width="2.5"/>
  <line x1="218" y1="70" x2="200" y2="86" stroke="#D3002D" stroke-width="2.5"/>
  <text class="m" x="210" y="50" text-anchor="middle">10.1.0.0/24</text>
  <text class="s" x="215" y="106" text-anchor="middle" fill="#B80027">not sent back</text>
  <rect x="14" y="122" width="612" height="62" fill="rgba(242,201,76,.16)" stroke="#c99700"/>
  <text class="k" x="26" y="142" fill="#8a6500">And on a hub-and-spoke mGRE interface this is a problem, not a protection.</text>
  <text class="s" x="26" y="160">The hub learns spoke A's routes and must advertise them to spoke B — out the SAME interface.</text>
  <text class="s" x="26" y="176">Hence <tspan font-family="ui-monospace,Menlo,monospace">no ip split-horizon eigrp</tspan> on DMVPN hubs. Correct there, dangerous almost everywhere else.</text>
</svg>
<p class="walk-say"><span class="walk-title">Split horizon — usually right, occasionally in the way</span>
A router does not advertise a route back out the interface it learned it on. Simple, and it prevents the two-router loop that plagued early distance-vector protocols.
<br><br>The exception matters because you will meet it: on a <b>multipoint</b> interface — DMVPN mGRE, Frame Relay — all spokes share one interface, so the hub must re-advertise spoke A's routes to spoke B <b>out the same interface split horizon is blocking</b>.
<br><br>Hence <code>no ip split-horizon eigrp 100</code> on DMVPN hubs, which is correct there and <b>a good way to create a loop anywhere else</b>. See <a href="/blog/dmvpn-nhrp-mgre-and-spoke-to-spoke-tunnels">the DMVPN article</a> for why Phase 3 makes this largely unnecessary.</p>
</div>
<div class="walk-panel">
<svg class="sv5" viewBox="0 0 640 205" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Summarising creates a discard route to null zero which prevents a loop for addresses inside the summary that do not exist">
  <style>.sv5 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv5 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv5 .m{font-family:ui-monospace,Menlo,monospace;font-size:10px;fill:#17171A}.sv5 .n{fill:#17171A}.sv5 .nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:10px;font-weight:700}</style>
  <rect class="n" x="40" y="56" width="96" height="28" rx="3"/><text class="nt" x="88" y="74" text-anchor="middle">CORE</text>
  <rect class="n" x="300" y="56" width="96" height="28" rx="3"/><text class="nt" x="348" y="74" text-anchor="middle">R1</text>
  <path d="M 136 70 L 300 70" stroke="#4b7bec" stroke-width="2" fill="none"/>
  <circle r="4" fill="#4b7bec"><animateMotion dur="1.6s" repeatCount="indefinite" path="M 136 70 L 300 70"/></circle>
  <text class="m" x="218" y="58" text-anchor="middle">to 10.1.7.99 — inside the /21, but no such subnet</text>
  <rect x="440" y="56" width="120" height="28" fill="rgba(211,0,45,.16)" stroke="#D3002D"/>
  <text class="m" x="500" y="74" text-anchor="middle">Null0</text>
  <path d="M 396 70 L 440 70" stroke="#D3002D" stroke-width="2" fill="none"/>
  <text class="k" x="14" y="118">Without the Null0 route, R1 would send it back to the core, which sends it back…</text>
  <text class="s" x="14" y="144">R1 advertises 10.1.0.0/21 but only has .0 through .5. A packet for .7.99 matches the summary</text>
  <text class="s" x="14" y="160">on the way in and nothing specific on R1 — so it follows its own default straight back out.</text>
  <rect x="14" y="174" width="612" height="26" fill="rgba(31,157,107,.10)" stroke="#1f9d6b"/>
  <text class="s" x="26" y="192" fill="#0f6b47">IOS creates the discard route automatically when you summarise. <tspan font-weight="700">Never remove it.</tspan></text>
</svg>
<p class="walk-say"><span class="walk-title">The Null0 route is not clutter</span>
Summarise 10.1.0.0/21 while only owning .0 through .5, and a packet for 10.1.7.99 arrives at you legitimately — it matched the summary. You have no specific route for it, so you would forward it via your default, straight back where it came from. <b>That is a loop, built from a perfectly ordinary summary.</b>
<br><br>So IOS automatically installs <code>10.1.0.0/21 → Null0</code>. The packet matches it, is discarded, and the loop never forms.
<br><br>It appears in <code>show ip route</code> and it looks like noise. <b>It is load-bearing.</b> The same mechanism applies to BGP aggregates and OSPF summaries, and it is the reason summarisation is safe at all.</p>
</div>
</div>
</div>

---

## Configuration, word by word

<div class="cmd">
<div class="cmd-line"><span class="opt">! the trailing clause FIRST, so you cannot forget it</span>
<span class="t">route-map</span> <span class="opt">OSPF-TO-EIGRP</span> <span class="t">deny</span> <span class="opt">10</span>
 <span class="t">match tag</span> <span class="opt">90</span>
<span class="t">route-map</span> <span class="opt">OSPF-TO-EIGRP</span> <span class="t">permit</span> <span class="opt">20</span>
 <span class="t">set tag</span> <span class="opt">110</span>
!
<span class="t">route-map</span> <span class="opt">EIGRP-TO-OSPF</span> <span class="t">deny</span> <span class="opt">10</span>
 <span class="t">match tag</span> <span class="opt">110</span>
<span class="t">route-map</span> <span class="opt">EIGRP-TO-OSPF</span> <span class="t">permit</span> <span class="opt">20</span>
 <span class="t">set tag</span> <span class="opt">90</span>
!
<span class="t">router eigrp</span> <span class="opt">100</span>
 <span class="t">redistribute ospf</span> <span class="opt">1</span> <span class="t">metric</span> <span class="opt">100000 100 255 1 1500</span> <span class="t">route-map</span> <span class="opt">OSPF-TO-EIGRP</span>
<span class="t">router ospf</span> <span class="opt">1</span>
 <span class="t">redistribute eigrp</span> <span class="opt">100</span> <span class="t">subnets route-map</span> <span class="opt">EIGRP-TO-OSPF</span>
!
<span class="opt">! summarisation</span>
<span class="t">interface</span> <span class="opt">GigabitEthernet0/1</span>
 <span class="t">ip summary-address eigrp</span> <span class="opt">100 10.1.0.0 255.255.248.0</span>
!
<span class="t">router ospf</span> <span class="opt">1</span>
 <span class="t">area</span> <span class="opt">1</span> <span class="t">range</span> <span class="opt">10.2.0.0 255.255.252.0</span></div>
<dl class="cmd-parts">
<div class="is-key"><dt>deny 10 / match tag</dt><dd><b>Lowest sequence first, and this clause must come first.</b> Anything tagged as having originated in the other protocol is refused re-entry. Put it at sequence 20 instead and the permit at 10 catches everything before the deny is ever evaluated.</dd></div>
<div class="is-key"><dt>permit 20 / set tag</dt><dd><b>No match statement, so it matches everything</b> that survived the deny — and stamps it. The empty permit is both the "let the rest through" clause and the tagging clause in one. Omit it and the implicit deny drops every route.</dd></div>
<div><dt>Both directions</dt><dd>Two maps, mirrored. A tag applied in one direction is useless unless something is checking it in the other, and half-configured tagging is worse than none because it looks done.</dd></div>
<div class="is-key"><dt>redistribute ospf 1 <br>metric …</dt><dd>EIGRP needs a seed metric or the routes are redistributed with infinite metric and <b>never installed</b>. OSPF defaults to 20 and works without one — an inconsistency that catches people moving between the two.</dd></div>
<div class="is-key"><dt>subnets <i>(OSPF only)</i></dt><dd><b>Without it, OSPF redistributes only classful networks</b> — so every /24 inside 10.0.0.0/8 is silently skipped. It looks like redistribution failed entirely. There is essentially no reason ever to omit it.</dd></div>
<div class="is-key"><dt>ip summary-address eigrp<br><i>(on the interface)</i></dt><dd><b>EIGRP summarises per interface</b>, not globally — so you must apply it on every interface where the summary should be advertised. Miss one and a neighbour still receives the specifics, which defeats the purpose and is invisible unless you check that neighbour.</dd></div>
<div><dt>area 1 range <i>(OSPF)</i></dt><dd>Applied on the <b>ABR</b>, and it summarises routes <i>from</i> that area. For redistributed externals it is <code>summary-address</code> on the <b>ASBR</b> instead — two different commands for two different route types, and using the wrong one silently does nothing.</dd></div>
</dl>
</div>

---

## Reading it

<div class="term">
<div class="term-bar"><span class="term-dots"><i></i><i></i><i></i></span>R1 — the counters nobody looks at</div>
<pre><span class="p">R1#</span> <span class="c">show route-map OSPF-TO-EIGRP</span>
route-map OSPF-TO-EIGRP, deny, sequence 10
  Match clauses:
    tag 90
  <span class="y">Policy routing matches: 0 packets, 0 bytes</span>
route-map OSPF-TO-EIGRP, permit, sequence 20
  Set clauses:
    tag 110
<span class="y">  Policy routing matches: 412 packets, 0 bytes</span>

<span class="o">! Zero matches on a clause you expected to fire = your match is wrong,</span>
<span class="o">! or an earlier clause already caught everything. Check sequence order.</span>

<span class="p">R1#</span> <span class="c">show ip route 10.1.0.0</span>
Routing entry for 10.1.0.0/21
  Known via "eigrp 100", distance 5, metric 2816, type internal
  <span class="y">Routing Descriptor Blocks:</span>
  <span class="y">  directly connected, via Null0</span>
    Route metric is 2816, traffic share count is 1

<span class="o">! THE DISCARD ROUTE. Created automatically by the summary. AD 5 in EIGRP.</span>
<span class="o">! It is what stops packets for non-existent subnets inside the summary looping.</span>

<span class="p">R1#</span> <span class="c">show ip route 10.4.9.0</span>
Routing entry for 10.4.9.0/24
  Known via "ospf 1", distance 110, metric 20, type extern 2
  <span class="y">Tag 90</span>, type extern 2
  <span class="o">^^^^^^ came from EIGRP originally. If this were re-redistributed back</span>
  <span class="o">into EIGRP, the deny clause matching tag 90 is what stops it.</span>

<span class="p">R1#</span> <span class="c">show ip protocols | section eigrp</span>
Routing Protocol is "eigrp 100"
  <span class="y">Automatic Summarization: disabled</span>
  Address Summarization:
    10.1.0.0/21 for GigabitEthernet0/1
  <span class="o">! Only Gi0/1. Any OTHER neighbour still gets the specifics.</span><span class="cur"></span></pre>
</div>
<p class="term-cap"><b><code>show route-map</code> counters are the fastest way to find a map that is not doing what you think.</b> A clause with zero matches is either wrong or unreachable because an earlier clause caught everything — and either way, the sequence numbers are where to look.</p>

<div class="real">
<b>In the real world</b>
Route maps are where redistribution designs go wrong, and the failures share a shape: <b>everything looks configured, and some subset of routes has silently vanished.</b> No log, no state change, no error.
<br><br>So build two habits. <b>Write the trailing permit clause first.</b> And <b>tag everything at every redistribution point from the start</b>, even when there is only one — because the second one gets added during an outage, by someone in a hurry, and the protection needs to already be there.
<br><br>On summarisation: it is one of the few changes that makes a network both faster to converge and easier to read. It is also one of the easiest to get subtly wrong, because <b>summarising more than you own black-holes the part you do not</b>. Check the boundary before you advertise it.
</div>

---

## What goes wrong

**Most routes disappeared after applying a route map.** Implicit deny. Add a trailing permit clause.

**A clause never fires.** Earlier clause already matched — check sequence numbers with `show route-map`.

**Redistribution loop with two ASBRs.** No tagging. Tag on export, deny on import, both directions.

**OSPF redistributes almost nothing.** Missing `subnets`.

**EIGRP redistributed routes never install.** No seed metric.

**Summary not advertised to one neighbour.** EIGRP summarises per interface — apply it on that one too.

**Traffic black-holed after summarising.** Summary covers subnets you do not have. That is the Null0 route working as designed; fix the summary.

**DMVPN spokes cannot reach each other.** Split horizon on the hub's mGRE interface.

---

<div class="lab">
<div class="lab-head">Lab — build the loop, then stop it with a tag</div>
<div class="lab-body">

<div class="lab-target"><b>Target</b>
Produce the implicit-deny outage deliberately so you recognise it instantly. Build a genuine redistribution loop with two ASBRs and watch a route come back with a better AD. Stop it with tagging. Then summarise, find the Null0 route, and black-hole traffic by summarising more than you own.</div>

**Topology.** An OSPF domain and an EIGRP domain joined by **two** routers (R1 and R2), both redistributing both ways. Loopbacks in each domain to advertise.

<p class="lab-step"><span class="n">1</span>Cause the implicit-deny outage</p>

Write a route map that sets a metric on one prefix, and apply it to redistribution with **no trailing permit clause**.

```cisco
R1# show ip route eigrp
```

<div class="lab-issues"><b>Possible issues</b>
<ul>
<li><b>Routes are still there</b> — the map is not applied where you think. Check <code>show ip protocols</code>.</li>
<li><b>Nothing at all appears</b> — also check the seed metric; two faults at once is confusing.</li>
<li><b>It works fine</b> — your match is catching everything, which is a different bug worth understanding.</li>
</ul>
<b>Every prefix except the one you matched has vanished</b>, with no error anywhere. Add <code>route-map NAME permit 100</code> with no match statement and they all return instantly. <b>Cause this once deliberately and you will never cause it by accident.</b></div>

<p class="lab-step"><span class="n">2</span>Build the loop</p>

Redistribute both ways on **both** R1 and R2, with no tagging and no filtering.

<div class="lab-watch"><b>Things to notice</b>
Pick a native OSPF prefix and run <code>show ip route</code> on R1. It may now be learned <b>via EIGRP</b>, because the round trip through R2 returned it at AD 90 instead of 110.
<br><br>Trace to it and watch the path go somewhere absurd. <b>Everything is "up"; the routing table looks populated; the traffic goes the wrong way.</b> This is the failure mode that makes redistribution feared, and you have now built it on purpose.</div>

<p class="lab-step"><span class="n">3</span>Stop it with tags</p>

Add the two mirrored route maps from above on **both** ASBRs.

```cisco
R1# show ip route 10.4.9.0
R1# show route-map
```

<div class="lab-watch"><b>Things to notice</b>
Routes now carry <b>Tag 90</b> or <b>Tag 110</b>, and the deny clause counter increments. Check on <b>both</b> routers — tagging on one only is the half-configured state that looks finished and is not.
<br><br>Remove the tagging from R2 alone and watch the loop return through that one side. <b>Both directions, both routers, always.</b></div>

<p class="lab-step"><span class="n">4</span>Summarise and find the discard route</p>

```cisco
R1(config-if)# ip summary-address eigrp 100 10.1.0.0 255.255.248.0
R1# show ip route 10.1.0.0
```

<div class="lab-watch"><b>Things to notice</b>
The neighbour now receives <b>one route instead of six</b>, and R1 has grown a <code>Null0</code> entry at <b>AD 5</b>.
<br><br>Then check a <b>different</b> EIGRP neighbour on another interface: <b>it still has all six specifics.</b> EIGRP summarises per interface, and that asymmetry is invisible unless you go and look.</div>

<p class="lab-step"><span class="n">5</span>Black-hole traffic on purpose</p>

Summarise 10.1.0.0/21 while owning only 10.1.0.0/24 through 10.1.5.0/24. Then ping 10.1.7.99 from the far side.

<div class="lab-watch"><b>Things to notice</b>
Traffic is drawn to R1 because the summary says R1 has it, then <b>discarded by the Null0 route</b>. Now delete the Null0 route manually and ping again: <b>the packet loops</b> between R1 and the core until TTL expires — visible in a traceroute as the same two hops repeating.
<br><br><b>That is exactly what the discard route exists to prevent</b>, demonstrated by removing it. Put it back, and never remove one in production.</div>

<p class="lab-step"><span class="n">6</span>Break split horizon, both ways</p>

On a multipoint interface (mGRE or a lab equivalent) with two spokes, check whether spoke routes reach each other.

<div class="lab-watch"><b>Things to notice</b>
Without <code>no ip split-horizon eigrp 100</code> on the hub, <b>spokes cannot see each other's networks</b> — the hub refuses to advertise them back out the interface they arrived on.
<br><br>Turn it off and they appear. Then turn it off on an ordinary point-to-point link between two routers and watch routes get advertised back where they came from — <b>harmless here because of other mechanisms, but you have seen why the default exists.</b></div>

<div class="lab-earned"><b>What you earned</b>
You have caused the implicit-deny outage and fixed it with one empty clause, so you will recognise "most routes vanished" instantly. You have built a real redistribution loop with two ASBRs and watched AD make the wrong path look better. You have stopped it with tags and confirmed the deny clause counter incrementing. You know EIGRP summarises per interface and have seen one neighbour summarised while another was not. And you have deleted a Null0 discard route and watched packets loop, which is the clearest possible argument for leaving it alone.</div>

</div>
</div>

---

## Test yourself

<div class="qz">
<p class="qz-q"><span class="qz-num">Q1</span>You apply a route map to redistribution and most routes disappear. Why?</p>
<label class="qz-opt"><input type="radio" name="rq1"><span>The implicit <code>deny</code> at the end dropped everything that matched no clause</span><em class="qz-fb qz-good">Correct. Add a trailing <code>permit</code> clause with no match statement.</em></label>
<label class="qz-opt"><input type="radio" name="rq1"><span>The seed metric is missing</span><em class="qz-fb qz-bad">That stops EIGRP installing them, but it is a different fault — and it would affect all of them, not most.</em></label>
<label class="qz-opt"><input type="radio" name="rq1"><span>The sequence numbers are too far apart</span><em class="qz-fb qz-bad">Gaps between sequence numbers are harmless and conventional.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q2</span>Why does route tagging beat prefix-list filtering for redistribution loops?</p>
<label class="qz-opt"><input type="radio" name="rq2"><span>The tag travels with the route, so it needs no maintenance when the address plan changes</span><em class="qz-fb qz-good">Correct — and it works identically in EIGRP, OSPF and BGP regardless of topology.</em></label>
<label class="qz-opt"><input type="radio" name="rq2"><span>Tags are processed faster</span><em class="qz-fb qz-bad">Performance is not the consideration.</em></label>
<label class="qz-opt"><input type="radio" name="rq2"><span>Prefix lists cannot match redistributed routes</span><em class="qz-fb qz-bad">They can; they just need updating forever.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q3</span>What is the Null0 route created by a summary for?</p>
<label class="qz-opt"><input type="radio" name="rq3"><span>Discarding packets for addresses inside the summary that do not exist, preventing a loop</span><em class="qz-fb qz-good">Correct. Remove it and those packets bounce back and forth until TTL expires.</em></label>
<label class="qz-opt"><input type="radio" name="rq3"><span>Leftover clutter that can be safely removed</span><em class="qz-fb qz-bad">It is load-bearing — removing it creates a genuine routing loop.</em></label>
<label class="qz-opt"><input type="radio" name="rq3"><span>A placeholder until the specific routes are learned</span><em class="qz-fb qz-bad">It persists for as long as the summary does.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q4</span>An EIGRP summary is advertised to one neighbour but not another. Why?</p>
<label class="qz-opt"><input type="radio" name="rq4"><span>EIGRP summarises per interface — it must be configured on each one</span><em class="qz-fb qz-good">Correct, and the asymmetry is invisible unless you check the other neighbour.</em></label>
<label class="qz-opt"><input type="radio" name="rq4"><span>Auto-summary is interfering</span><em class="qz-fb qz-bad">Auto-summary is disabled by default on modern IOS and works differently.</em></label>
<label class="qz-opt"><input type="radio" name="rq4"><span>The second neighbour is in a different AS</span><em class="qz-fb qz-bad">Then there would be no adjacency at all.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q5</span>Why is split horizon disabled on a DMVPN hub?</p>
<label class="qz-opt"><input type="radio" name="rq5"><span>All spokes share one multipoint interface, so the hub must re-advertise out the interface routes arrived on</span><em class="qz-fb qz-good">Correct — and it is the right call there and a good way to create a loop anywhere else.</em></label>
<label class="qz-opt"><input type="radio" name="rq5"><span>Split horizon does not work over GRE</span><em class="qz-fb qz-bad">It works; that is precisely the problem.</em></label>
<label class="qz-opt"><input type="radio" name="rq5"><span>To speed up convergence</span><em class="qz-fb qz-bad">It is about reachability between spokes, not timing.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q6</span>OSPF redistribution brings in almost nothing. What is missing?</p>
<label class="qz-opt"><input type="radio" name="rq6"><span>The <code>subnets</code> keyword — without it only classful networks are redistributed</span><em class="qz-fb qz-good">Correct, and there is essentially no reason ever to omit it.</em></label>
<label class="qz-opt"><input type="radio" name="rq6"><span>A seed metric</span><em class="qz-fb qz-bad">OSPF defaults to 20 and works without one; that is EIGRP's requirement.</em></label>
<label class="qz-opt"><input type="radio" name="rq6"><span>A route map</span><em class="qz-fb qz-bad">Route maps filter and modify; they are not required for redistribution to work.</em></label>
</div>

---

## References

- **RFC 2328** — OSPF, including summarisation at ABRs and ASBRs.
- Cisco — [Route Maps for IP Routing Protocol Redistribution](https://www.cisco.com/c/en/us/support/docs/ip/border-gateway-protocol-bgp/49111-route-map-bestp.html)
- Cisco — [Redistributing Routing Protocols](https://www.cisco.com/c/en/us/support/docs/ip/enhanced-interior-gateway-routing-protocol-eigrp/8606-redist.html) — the tagging pattern in full.
- Cisco — [EIGRP Configuration Guide](https://www.cisco.com/c/en/us/td/docs/ios-xml/ios/iproute_eigrp/configuration/xe-17/ire-xe-17-book.html)

---

*Related: [Route redistribution](/blog/route-redistribution-seed-metrics-loops-and-tags) · [Policy-based routing](/blog/policy-based-routing-pbr-explained) · [OSPF multi-area](/blog/ospf-multi-area-summarisation-and-filtering) · [DMVPN](/blog/dmvpn-nhrp-mgre-and-spoke-to-spoke-tunnels).*

*Part of the [CCNA, ENCOR and ENARSI topic-by-topic study guide](/blog/ccna-ccnp-study-guide).*
