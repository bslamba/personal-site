---
title: "BFD: Detecting a Dead Neighbour in Milliseconds, Not Seconds"
excerpt: "A routing protocol's own hellos are too slow and too heavy to run fast — OSPF's default dead timer is 40 seconds. BFD is a tiny, dedicated hello that fires hundreds of times a second in hardware, and simply tells the routing protocol 'the path is gone' the instant it is. One detector, every protocol."
date: "2026-09-22"
tags: ["BFD", "Convergence", "OSPF", "BGP", "EIGRP", "High availability", "ENARSI"]
draft: false
---

> **Blueprint:** ENARSI 300-410 — 1.8 *Describe Bidirectional Forwarding Detection*.

## Cheat sheet

| | |
|---|---|
| **What it is** | A lightweight, protocol-independent **failure detector** for a path between two neighbours |
| **What it is not** | A routing protocol — it carries no routes, makes no decisions |
| **How** | Tiny hello packets exchanged very fast (tens of ms), often in hardware/ASIC |
| **Result** | On failure it tells its **clients** (OSPF, BGP, EIGRP, HSRP, static) to tear down **now** |
| **Why** | Routing-protocol hellos are slow (OSPF dead 40 s, BGP hold 180 s) and CPU-bound |
| **Modes** | **Asynchronous** (the norm) · **Echo** (loops packets back to test the local path) |
| **Timers** | `bfd interval <tx> min_rx <rx> multiplier <n>` — failure ≈ rx × multiplier |
| **Register a client** | `bfd all-interfaces` under the routing protocol, or per-interface |

**The sentence that explains why it exists.** Every routing protocol already detects dead neighbours — with its own hellos, slowly, in software. **BFD replaces all of those detectors with one fast, shared, hardware-friendly one**, so sub-second failover stops being a per-protocol tuning exercise and becomes a single mechanism every protocol subscribes to.

---

## The gap BFD fills

<figure class="fig">
<svg class="sv1" viewBox="0 0 640 230" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Without BFD a routing protocol waits out its dead timer; with BFD failure is detected in milliseconds">
  <style>
    .sv1 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}
    .sv1 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}
    .sv1 .m{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;fill:#17171A}
    .sv1 .bad{fill:#D3002D}.sv1 .good{fill:#1f9d6b}
  </style>
  <text class="k" x="14" y="24">Link fails at t = 0</text>
  <text class="s" x="14" y="46">Without BFD — OSPF waits out its dead timer:</text>
  <rect x="14" y="54" width="520" height="18" fill="#E4E4E9"/>
  <rect x="14" y="54" width="520" height="18" fill="none" stroke="#D3002D"/>
  <text class="m" x="540" y="68" fill="#B80027">~40 s</text>
  <text class="s" x="14" y="98">With BFD — the detector fires and tells OSPF immediately:</text>
  <rect x="14" y="106" width="10" height="18" fill="#1f9d6b"/>
  <text class="m" x="30" y="120" fill="#0f6b47">~150 ms (50 ms × 3)</text>
  <rect x="14" y="150" width="612" height="66" fill="#F1EEE9" stroke="#B5B5BC"/>
  <text class="k" x="26" y="172">During those 40 seconds, traffic is black-holed down a dead path.</text>
  <text class="s" x="26" y="192">You could lower OSPF's own timers — but sub-second hellos in software burn CPU on every router and</text>
  <text class="s" x="26" y="208">still cannot run as fast as a purpose-built detector. BFD does it once, in hardware, for every protocol.</text>
</svg>
<figcaption><b>Figure 1.</b> The routing protocol converges quickly once it <em>knows</em> — BFD's job is to make it know in milliseconds instead of tens of seconds.</figcaption>
</figure>

<div class="why">
<b>Why not just lower the routing protocol's timers?</b>
You can — <code>ip ospf dead-interval minimal hello-multiplier 4</code> gets OSPF to sub-second. But it has three problems that BFD does not. It runs the fast hellos <b>in software</b> on the route processor, so it burns CPU and does not scale to many neighbours. It is <b>per-protocol</b>, so you tune OSPF, then BGP, then EIGRP separately, each with different knobs. And it is still <b>slower and less precise</b> than a detector designed only to do this, often in the line-card ASIC.
<br><br>BFD solves all three at once: one detector, in hardware, shared by every protocol that registers as a client. You tune the failure interval in one place, and OSPF, BGP, EIGRP, HSRP and even a tracked static route all benefit. That separation — <b>detection is BFD's job, reaction is the protocol's job</b> — is the whole design.
</div>

---

## How it works

<div class="walk">
<div class="walk-head">From hello to failover <span class="walk-hint">click a step</span></div>
<div class="walk-tabs">
  <input type="radio" name="bfw" id="bf1" checked><label for="bf1"><span class="step-n">1</span>The session</label>
  <input type="radio" name="bfw" id="bf2"><label for="bf2"><span class="step-n">2</span>Detection</label>
  <input type="radio" name="bfw" id="bf3"><label for="bf3"><span class="step-n">3</span>Telling the client</label>
  <input type="radio" name="bfw" id="bf4"><label for="bf4"><span class="step-n">4</span>Echo mode</label>
</div>
<div class="walk-panels">
<div class="walk-panel">
<svg class="sv2" viewBox="0 0 640 160" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Two routers exchange rapid BFD hellos to keep a session up">
  <style>.sv2 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv2 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv2 .n{fill:#17171A}.sv2 .nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:10px;font-weight:700}</style>
  <rect class="n" x="30" y="56" width="90" height="30" rx="3"/><text class="nt" x="75" y="76" text-anchor="middle">R1</text>
  <rect class="n" x="520" y="56" width="90" height="30" rx="3"/><text class="nt" x="565" y="76" text-anchor="middle">R2</text>
  <path d="M 120 66 L 520 66" stroke="#1f9d6b" stroke-width="1.5" fill="none"/>
  <circle r="3" fill="#1f9d6b"><animateMotion dur="0.5s" repeatCount="indefinite" path="M 120 66 L 520 66"/></circle>
  <path d="M 520 78 L 120 78" stroke="#1f9d6b" stroke-width="1.5" fill="none"/>
  <circle r="3" fill="#1f9d6b"><animateMotion dur="0.5s" begin="0.25s" repeatCount="indefinite" path="M 520 78 L 120 78"/></circle>
  <text class="s" x="320" y="52" text-anchor="middle">tiny hellos, both directions, tens of ms apart</text>
  <text class="k" x="14" y="118">"Bidirectional" — each end confirms the OTHER can both send and receive.</text>
  <text class="s" x="14" y="142">A one-way (unidirectional) failure is caught too, which a naive keepalive can miss.</text>
</svg>
<p class="walk-say"><span class="walk-title">A fast, two-way heartbeat</span>
Two routers establish a <b>BFD session</b> over the link and exchange minimal control packets very rapidly in both directions. The packets carry almost nothing — session IDs and timers — so they are cheap enough to send tens or hundreds of times a second, and on many platforms they are handled on the <b>line card</b>, not the main CPU.
<br><br><b>Bidirectional</b> is the key word: each end verifies the other can both transmit and receive, so a link that has failed in only one direction — which a simple keepalive can miss — is still detected.</p>
</div>
<div class="walk-panel">
<svg class="sv3" viewBox="0 0 640 160" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="When hellos stop arriving for interval times multiplier the session is declared down">
  <style>.sv3 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv3 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv3 .m{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;fill:#17171A}</style>
  <text class="k" x="14" y="26">Failure = min_rx × multiplier</text>
  <text class="m" x="14" y="54">bfd interval 50 min_rx 50 multiplier 3</text>
  <text class="s" x="14" y="74">→ send/expect a hello every 50 ms; miss 3 in a row → declare the session DOWN at ~150 ms.</text>
  <text class="s" x="14" y="104">The multiplier is the tolerance for the occasional lost packet — set it too low and a single</text>
  <text class="s" x="14" y="120">dropped hello flaps the session; too high and you slow detection back down.</text>
  <text class="s" x="14" y="148">Both ends negotiate the actual rate to the slower of the two configured values.</text>
</svg>
<p class="walk-say"><span class="walk-title">Detection: interval × multiplier</span>
The failure time is simply the receive interval times the multiplier. <code>bfd interval 50 min_rx 50 multiplier 3</code> means "expect a hello every 50 ms; if three in a row are missed, the session is down" — about 150 ms.
<br><br>The <b>multiplier</b> is your tolerance for an occasional dropped packet. Too low and a single lost hello flaps the session (and your routing with it); too high and you have thrown away the speed you deployed BFD for. The two ends <b>negotiate</b> to the slower of their configured intervals, so both must be set for aggressive timing to take effect.</p>
</div>
<div class="walk-panel">
<svg class="sv4" viewBox="0 0 640 165" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="On failure BFD notifies its client protocols which then reconverge">
  <style>.sv4 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv4 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv4 .m{font-family:ui-monospace,Menlo,monospace;font-size:10px;fill:#17171A}.sv4 .b{fill:#F1EEE9;stroke:#B5B5BC}.sv4 .bad{fill:rgba(211,0,45,.14);stroke:#D3002D}</style>
  <rect class="bad" x="14" y="30" width="150" height="34"/><text class="m" x="89" y="51" text-anchor="middle">BFD: session DOWN</text>
  <path d="M 164 47 L 210 47" stroke="#8A8A93" stroke-width="1.5"/>
  <rect class="b" x="214" y="20" width="150" height="24"/><text class="m" x="289" y="37" text-anchor="middle">→ OSPF: drop neighbour</text>
  <rect class="b" x="214" y="50" width="150" height="24"/><text class="m" x="289" y="67" text-anchor="middle">→ BGP: reset session</text>
  <rect class="b" x="214" y="80" width="150" height="24"/><text class="m" x="289" y="97" text-anchor="middle">→ EIGRP: drop neighbour</text>
  <rect class="b" x="214" y="110" width="150" height="24"/><text class="m" x="289" y="127" text-anchor="middle">→ static: withdraw route</text>
  <text class="k" x="410" y="60">One detector,</text>
  <text class="k" x="410" y="78">many clients.</text>
  <text class="s" x="14" y="158">BFD makes no routing decision — it only says "down," and each client reacts in its own way.</text>
</svg>
<p class="walk-say"><span class="walk-title">Telling the clients — the division of labour</span>
When the session goes down, BFD notifies every <b>client</b> registered on that interface, and each reacts in its own way: OSPF drops the neighbour and reruns SPF, BGP resets the session, EIGRP queries for a new successor, a tracked static route is withdrawn.
<br><br>This is the elegant part. <b>BFD makes no routing decision</b> — it only reports reachability. The routing protocols keep all their intelligence and simply outsource the slow, expensive job of noticing a dead path. That clean separation is why one BFD session can accelerate every protocol on the link at once.</p>
</div>
<div class="walk-panel">
<svg class="sv5" viewBox="0 0 640 160" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Echo mode loops a packet back through the neighbour to test the local forwarding path">
  <style>.sv5 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv5 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv5 .n{fill:#17171A}.sv5 .nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:10px;font-weight:700}</style>
  <rect class="n" x="30" y="60" width="90" height="30" rx="3"/><text class="nt" x="75" y="80" text-anchor="middle">R1</text>
  <rect class="n" x="520" y="60" width="90" height="30" rx="3"/><text class="nt" x="565" y="80" text-anchor="middle">R2</text>
  <path d="M 120 68 C 320 30, 420 30, 520 68" stroke="#4b7bec" stroke-width="1.5" fill="none"/>
  <path d="M 520 82 C 420 120, 320 120, 120 82" stroke="#4b7bec" stroke-width="1.5" fill="none"/>
  <circle r="3.5" fill="#4b7bec"><animateMotion dur="1.4s" repeatCount="indefinite" path="M 120 68 C 320 30, 420 30, 520 68 C 420 120, 320 120, 120 82"/></circle>
  <text class="s" x="320" y="28" text-anchor="middle">R1 sends a packet R2 just loops straight back</text>
  <text class="k" x="14" y="128">Echo mode tests the full forwarding path to the neighbour and back —</text>
  <text class="s" x="14" y="150">including the neighbour's data plane — without the neighbour's control plane processing it.</text>
</svg>
<p class="walk-say"><span class="walk-title">Echo mode — testing the forwarding path itself</span>
In <b>asynchronous</b> mode (the default) each end sends its own hellos. In <b>echo</b> mode, a router sends a packet that the neighbour simply <b>loops back</b> in its data plane without control-plane processing — so it tests the complete forwarding path, including the far end's line card, and confirms the path can actually carry traffic, not just that the far CPU is alive.
<br><br>Echo can run alongside async and lets you slow the async hellos (since echo is doing the fast detection), reducing control-plane load further. It is a refinement; async mode is what you deploy first and what most designs use.</p>
</div>
</div>
</div>

---

## Configuration, word by word

<div class="cmd">
<div class="cmd-line"><span class="opt">! per interface: define the BFD timers</span>
<span class="t">interface</span> <span class="opt">GigabitEthernet0/1</span>
 <span class="t">bfd interval</span> <span class="opt">50</span> <span class="t">min_rx</span> <span class="opt">50</span> <span class="t">multiplier</span> <span class="opt">3</span>
!
<span class="opt">! register clients — the protocols that will USE the session</span>
<span class="t">router ospf</span> <span class="opt">1</span>
 <span class="t">bfd all-interfaces</span>
!
<span class="t">router bgp</span> <span class="opt">65000</span>
 <span class="t">neighbor</span> <span class="opt">10.0.12.2</span> <span class="t">fall-over bfd</span>
!
<span class="t">router eigrp</span> <span class="opt">100</span>
 <span class="t">bfd all-interfaces</span>
!
<span class="opt">! even a static route can use it</span>
<span class="t">ip route static bfd</span> <span class="opt">GigabitEthernet0/1 10.0.12.2</span>
<span class="t">ip route</span> <span class="opt">10.2.0.0 255.255.0.0 10.0.12.2</span></div>
<dl class="cmd-parts">
<div class="is-key"><dt>bfd interval 50 <br>min_rx 50 multiplier 3</dt><dd><b>The detection speed, set once on the interface.</b> `interval` is how often you send, `min_rx` how often you expect to receive, `multiplier` how many misses before "down." Failure time ≈ min_rx × multiplier ≈ 150 ms. Every client on this interface inherits it.</dd></div>
<div class="is-key"><dt>bfd all-interfaces <br><span class="opt">(under the protocol)</span></dt><dd><b>This is the line that actually links BFD to the protocol.</b> Defining the interface timers alone does nothing useful until a client registers. Without this under OSPF/EIGRP, the session may not even form — there is no client asking for it.</dd></div>
<div><dt>neighbor … fall-over bfd</dt><dd>BGP registers per-neighbour rather than per-interface, because a BGP peer may be multiple hops away. `fall-over bfd` says "tear this session down the instant BFD reports the path down" instead of waiting the 180-second hold time.</dd></div>
<div class="is-key"><dt>both ends required</dt><dd><b>BFD is bidirectional — it must be configured on both routers</b>, and the timers negotiate to the slower pair. Configure one side only and the session never comes up, and the protocol quietly falls back to its own slow detection with no obvious error.</dd></div>
<div><dt>ip route static bfd</dt><dd>Lets a **static route** track a BFD session, so it withdraws in milliseconds when the path dies — a lighter alternative to [IP SLA object tracking](/blog/ip-sla-probes-jitter-and-tracking-objects) when you just need fast next-hop liveness on a connected link.</dd></div>
<div class="is-key"><dt>keep timers sane</dt><dd>Aggressive timers (50 ms) suit stable, low-latency links. Over a jittery or long-latency path, 50 ms × 3 will flap; raise the interval or multiplier. **Match the timers to the link's real behaviour**, or BFD becomes the cause of the instability it was meant to fix.</dd></div>
</dl>
</div>

---

## Reading it

<div class="term">
<div class="term-bar"><span class="term-dots"><i></i><i></i><i></i></span>R1 — the session and its clients</div>
<pre><span class="p">R1#</span> <span class="c">show bfd neighbors</span>
IPv4 Sessions
NeighAddr        LD/RD         RH/RS     State     Int
10.0.12.2        1/1           Up        <span class="g">Up</span>        Gi0/1

<span class="o">! State Up = the session is healthy. RH/RS Up = remote is happy too.</span>

<span class="p">R1#</span> <span class="c">show bfd neighbors details | include Registered|Rx|Tx|multiplier</span>
        Registered protocols: <span class="y">OSPF EIGRP</span>
        <span class="o">! ^^^ the clients using this session. If empty, no protocol registered —</span>
        <span class="o">! defining interface timers alone does nothing.</span>
        Tx Count: 48210, Rx Count: 48209
        Rx interval (ms): 50   Tx interval (ms): 50   Multiplier: 3

<span class="p">R1#</span> <span class="c">show bfd summary</span>
Session       Up      Down
Number        4       0

<span class="p">R1#</span> <span class="c">show ip ospf neighbor detail | include BFD</span>
        BFD enabled
        <span class="o">! confirms OSPF is actually using BFD on this adjacency.</span>

<span class="o">! When a link fails, the log shows BFD reporting first, then the protocol reacting:</span>
%BFD-6-BFD_SESS_DESTROYED: BFD session ... reason: ECHO FAILURE
%OSPF-5-ADJCHG: ... from FULL to DOWN, Neighbor Down: BFD node down<span class="cur"></span></pre>
</div>
<p class="term-cap"><b>The line to check is "Registered protocols."</b> A BFD session that is Up but has no registered clients is doing nothing — the classic misconfiguration is setting interface timers and forgetting `bfd all-interfaces` (or `fall-over bfd`) under the routing protocol. And the log order — BFD reports down, then the protocol reacts — is exactly the division of labour the feature is built on.</p>

<div class="real">
<b>In the real world</b>
BFD is standard on any link where sub-second failover matters and the physical layer will not tell you fast enough — which is most fibre and almost all links through an intermediate transport (metro Ethernet, a provider's switch, a DWDM system) where a far-end failure does not drop your local interface. On a direct copper link, interface-down is already fast; BFD earns its place where <b>the link stays up locally while the path beyond it dies</b>.
<br><br>The failure to avoid is aggressive timers on a link that cannot support them — a satellite hop, a congested or jittery path — where BFD flaps and drags every registered protocol with it. Start conservative (say 300 ms × 3), confirm stability, then tighten only if the link genuinely warrants it. BFD is a scalpel; on the wrong link it is a source of outages.
</div>

---

## What goes wrong

**Session stays Down.** BFD configured on one end only, or a timer/authentication mismatch. It is bidirectional — both ends required.

**Session Up but failover still slow.** No client registered — missing `bfd all-interfaces` or `neighbor … fall-over bfd`. Check "Registered protocols."

**Session flaps.** Timers too aggressive for the link's latency/jitter. Raise interval or multiplier.

**Works for OSPF, not BGP.** BGP registers per-neighbour with `fall-over bfd`, not with `bfd all-interfaces`.

**No benefit on a direct link that already drops fast.** BFD helps where the local interface stays up while the path beyond fails — through transport, not on back-to-back copper.

---

<div class="lab">
<div class="lab-head">Lab — make OSPF converge in 150 ms instead of 40 seconds</div>
<div class="lab-body">

<div class="lab-target"><b>Target</b>
Measure OSPF's default failure detection, then add BFD and measure again. Prove the session is only useful once a client registers, and see BFD catch a failure that leaves the local interface up — the case it exists for.</div>

**Topology.** R1–R2 with OSPF adjacency, ideally through an intermediate switch (so you can fail the *path* without dropping R1's interface). A continuous ping across the link to measure loss.

<p class="lab-step"><span class="n">1</span>Baseline OSPF's own detection</p>

With default timers, start a continuous ping across the link, then fail the path (shut the switch port toward R2, not R1's own port).

<div class="lab-watch"><b>Things to notice</b>
Count the lost pings — with the default dead-interval you will lose roughly <b>40 seconds</b> of traffic before OSPF drops the neighbour and reconverges. That black hole is the problem BFD solves.</div>

<p class="lab-step"><span class="n">2</span>Add interface timers — and watch nothing change yet</p>

```cisco
R1(config-if)# bfd interval 50 min_rx 50 multiplier 3
```
(and the same on R2). Re-test **without** touching the routing protocol.

<div class="lab-watch"><b>Things to notice</b>
`show bfd neighbors` may show a session, but `show bfd neighbors details` shows <b>no registered protocols</b> — and failover is still slow. <b>Defining timers alone does nothing;</b> a client must subscribe. This is the single most common BFD mistake, produced deliberately.</div>

<p class="lab-step"><span class="n">3</span>Register OSPF and measure again</p>

```cisco
R1(config)# router ospf 1
R1(config-router)# bfd all-interfaces
```
(both ends), then fail the path again with the ping running.

<div class="lab-issues"><b>Possible issues</b>
<ul>
<li><b>Still slow</b> — only one end registered, or timers set on one end only. Both ends, both steps.</li>
<li><b>Session won't come up</b> — a mismatch, or an ACL/CoPP dropping BFD; check both ends' timers.</li>
<li><b>It flaps on its own</b> — the link cannot support 50 ms; raise to 300 ms × 3.</li>
</ul>
Now you lose only a <b>handful</b> of pings — detection in ~150 ms instead of 40 s. Check the log order: <b>BFD reports the session destroyed first, then OSPF logs the adjacency down</b> — detection and reaction, cleanly separated.</div>

<p class="lab-step"><span class="n">4</span>Prove the "interface stays up" case</p>

Fail the path at the intermediate switch so R1's own interface **stays up** (line protocol up), and compare with and without BFD.

<div class="lab-watch"><b>Things to notice</b>
Without BFD, R1's interface is up so it has no fast signal at all — it must wait out the full OSPF dead timer. With BFD, the missing echoes detect the dead path in milliseconds despite the interface being up. <b>This is precisely the scenario BFD exists for</b>, and the one where lowering interface-down detection cannot help.</div>

<p class="lab-step"><span class="n">5</span>Find the flap threshold</p>

Introduce latency/jitter on the path (a lab impairment) and tighten timers until the session flaps, then back off.

<div class="lab-watch"><b>Things to notice</b>
There is a point where `interval × multiplier` is shorter than the link's worst-case delivery and BFD declares a healthy link down. <b>Every registered protocol flaps with it.</b> Finding that edge in the lab teaches you why production BFD timers are matched to the link, not copied from a fast-convergence blog post.</div>

<div class="lab-earned"><b>What you earned</b>
You have measured the 40-second black hole BFD removes, and seen failover drop to ~150 ms. You produced the classic "session up, no client, still slow" mistake and fixed it with `bfd all-interfaces`. You saw BFD catch a path failure that left the local interface up — the case it is really for. And you found the timer edge where BFD becomes the cause of flapping, which is why its timers are a per-link decision.</div>

</div>
</div>

---

## Test yourself

<div class="qz">
<p class="qz-q"><span class="qz-num">Q1</span>What is BFD's job?</p>
<label class="qz-opt"><input type="radio" name="bfq1"><span>Fast, protocol-independent detection of a failed path, which it reports to client protocols</span><em class="qz-fb qz-good">Correct — it detects; the routing protocol decides. One detector, many clients.</em></label>
<label class="qz-opt"><input type="radio" name="bfq1"><span>Choosing the best path when a link fails</span><em class="qz-fb qz-bad">That is the routing protocol's job; BFD only reports the failure.</em></label>
<label class="qz-opt"><input type="radio" name="bfq1"><span>Encrypting routing updates</span><em class="qz-fb qz-bad">BFD has nothing to do with encryption.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q2</span>Why use BFD instead of just lowering OSPF's hello/dead timers?</p>
<label class="qz-opt"><input type="radio" name="bfq2"><span>One hardware-friendly detector shared by all protocols, instead of fast software hellos tuned per protocol</span><em class="qz-fb qz-good">Correct — it scales better, runs faster, and you tune it once for OSPF, BGP, EIGRP and more.</em></label>
<label class="qz-opt"><input type="radio" name="bfq2"><span>BFD carries routes more efficiently</span><em class="qz-fb qz-bad">BFD carries no routes at all.</em></label>
<label class="qz-opt"><input type="radio" name="bfq2"><span>Lowering timers is not possible</span><em class="qz-fb qz-bad">It is possible, just CPU-heavy and per-protocol.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q3</span>A BFD session is Up but failover is still slow. Why?</p>
<label class="qz-opt"><input type="radio" name="bfq3"><span>No client registered — <code>bfd all-interfaces</code> / <code>fall-over bfd</code> is missing under the protocol</span><em class="qz-fb qz-good">Correct — interface timers alone do nothing; a protocol must subscribe. Check "Registered protocols."</em></label>
<label class="qz-opt"><input type="radio" name="bfq3"><span>The multiplier is too high</span><em class="qz-fb qz-bad">That would slow detection, but the giveaway here is a healthy session with no client.</em></label>
<label class="qz-opt"><input type="radio" name="bfq3"><span>Echo mode is off</span><em class="qz-fb qz-bad">Async mode alone still detects; the issue is no registered client.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q4</span>With <code>bfd interval 50 min_rx 50 multiplier 3</code>, roughly how fast is detection?</p>
<label class="qz-opt"><input type="radio" name="bfq4"><span>~150 ms — min_rx × multiplier</span><em class="qz-fb qz-good">Correct: miss three 50 ms intervals and the session is declared down.</em></label>
<label class="qz-opt"><input type="radio" name="bfq4"><span>~50 ms</span><em class="qz-fb qz-bad">That is one interval; you wait for the multiplier count of misses.</em></label>
<label class="qz-opt"><input type="radio" name="bfq4"><span>~3 seconds</span><em class="qz-fb qz-bad">The units are milliseconds here, not seconds.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q5</span>Where does BFD add the most value?</p>
<label class="qz-opt"><input type="radio" name="bfq5"><span>Where the local interface stays up while the path beyond it fails — through an intermediate transport</span><em class="qz-fb qz-good">Correct — on back-to-back copper the interface already drops fast; BFD shines when it does not.</em></label>
<label class="qz-opt"><input type="radio" name="bfq5"><span>On a jittery satellite link with aggressive timers</span><em class="qz-fb qz-bad">That is where aggressive BFD flaps — match timers to the link.</em></label>
<label class="qz-opt"><input type="radio" name="bfq5"><span>Only on BGP sessions</span><em class="qz-fb qz-bad">It serves OSPF, EIGRP, HSRP and static routes too.</em></label>
</div>

---

## References

- **RFC 5880** — *Bidirectional Forwarding Detection (BFD)* — the base protocol.
- **RFC 5881** — BFD for IPv4 and IPv6 (single hop).
- **RFC 5882** — Generic application of BFD (how clients use it).
- Cisco — [BFD Configuration Guide](https://www.cisco.com/c/en/us/td/docs/ios-xml/ios/iproute_bfd/configuration/xe-17/irb-xe-17-book.html)

---

*Related: [How a router chooses](/blog/how-a-router-chooses-routing-table-longest-match-and-ad) · [IP SLA and object tracking](/blog/ip-sla-probes-jitter-and-tracking-objects) · [FHRP](/blog/fhrp-hsrp-vrrp-glbp-explained) · [OSPF](/blog/ospf-explained-areas-lsas-and-adjacency).*

*Part of the [CCNA, ENCOR and ENARSI topic-by-topic study guide](/blog/ccna-ccnp-study-guide).*
