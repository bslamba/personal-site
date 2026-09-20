---
title: "EIGRP Explained: DUAL, Feasible Successors and the Stuck-in-Active Problem"
excerpt: "How EIGRP achieves sub-second convergence without recalculating a topology, what the feasibility condition actually guarantees, and why 'stuck in active' is the failure worth understanding."
date: "2026-04-02"
tags: ["Routing", "EIGRP", "Networking", "Troubleshooting", "Fundamentals"]
draft: false
---

> **Blueprint:** ENARSI 300-410 — 1.9 *Troubleshoot EIGRP (classic and named mode; VRF and global)*, covering address families, neighbour relationships and authentication, loop-free path selection (RD, FD, FC, successor, feasible successor, stuck in active), stubs, equal and unequal cost load balancing, and metrics. ENCOR 350-401 — 3.2.a *Compare routing concepts of EIGRP and OSPF*.

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

## The feasibility condition, step by step

Everything EIGRP does quickly, it does because it worked out the answer **before** the failure happened. Step through it.

<div class="walk">
<div class="walk-head">Why one failure converges in milliseconds and another takes minutes <span class="walk-hint">click a step</span></div>
<div class="walk-tabs">
  <input type="radio" name="eigw" id="eg1" checked><label for="eg1"><span class="step-n">1</span>Two paths</label>
  <input type="radio" name="eigw" id="eg2"><label for="eg2"><span class="step-n">2</span>The test</label>
  <input type="radio" name="eigw" id="eg3"><label for="eg3"><span class="step-n">3</span>Instant failover</label>
  <input type="radio" name="eigw" id="eg4"><label for="eg4"><span class="step-n">4</span>No backup</label>
  <input type="radio" name="eigw" id="eg5"><label for="eg5"><span class="step-n">5</span>Stuck</label>
</div>
<div class="walk-panels">
<div class="walk-panel">
<svg viewBox="0 0 640 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A router has two paths to the same destination with different reported and feasible distances">
  <style>.n{fill:#17171A}.nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.m{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;fill:#17171A}.l{stroke:#8A8A93;stroke-width:1.5}</style>
  <rect class="n" x="20" y="80" width="66" height="32" rx="3"/><text class="nt" x="53" y="101" text-anchor="middle">R1</text>
  <rect class="n" x="250" y="34" width="66" height="32" rx="3"/><text class="nt" x="283" y="55" text-anchor="middle">R2</text>
  <rect class="n" x="250" y="126" width="66" height="32" rx="3"/><text class="nt" x="283" y="147" text-anchor="middle">R3</text>
  <rect class="n" x="470" y="80" width="130" height="32" rx="3"/><text class="nt" x="535" y="101" text-anchor="middle">10.9.9.0/24</text>
  <line class="l" x1="86" y1="92" x2="250" y2="55" stroke="#1f9d6b" stroke-width="3"/>
  <line class="l" x1="86" y1="102" x2="250" y2="142"/>
  <line class="l" x1="316" y1="55" x2="470" y2="92"/>
  <line class="l" x1="316" y1="142" x2="470" y2="102"/>
  <text class="m" x="150" y="52" fill="#0f6b47">via R2 · FD 3072</text>
  <text class="m" x="150" y="170">via R3 · FD 5120</text>
  <text class="s" x="330" y="86">R2 reports RD 2816</text>
  <text class="s" x="330" y="112">R3 reports RD 2560</text>
  <text class="k" x="320" y="192" text-anchor="middle" fill="#0f6b47">R2 is the successor. Whether R3 is a <tspan font-style="italic">feasible</tspan> successor is a separate question.</text>
</svg>
<p class="walk-say"><span class="walk-title">Two paths, and four numbers</span>
<b>RD — reported distance</b> is what the neighbour says <em>its</em> cost to the destination is. <b>FD — feasible distance</b> is R1's own total cost through that neighbour. The lowest FD wins and that neighbour becomes the <b>successor</b>.
<br><br>The second path is only useful if R1 can be certain it does not loop back through R1 itself. Working that out without asking anybody is the whole trick.</p>
</div>
<div class="walk-panel">
<svg viewBox="0 0 640 195" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The feasibility condition compares the neighbour reported distance against the current best feasible distance">
  <style>.s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.k{font-family:ui-sans-serif,system-ui;font-size:12px;font-weight:700}.m{font-family:ui-monospace,Menlo,monospace;font-size:12px;fill:#17171A}.ok{fill:rgba(31,157,107,.12);stroke:#1f9d6b}</style>
  <rect class="ok" x="70" y="34" width="500" height="54"/>
  <text class="m" x="320" y="68" text-anchor="middle" fill="#0f6b47">RD of the alternative  &lt;  FD of the current best</text>
  <text class="k" x="320" y="112" text-anchor="middle">2560 &lt; 3072 — true, so R3 is a feasible successor</text>
  <text class="s" x="320" y="140" text-anchor="middle">R3 reports a cost <tspan font-weight="700">lower than R1's own</tspan>, which is only possible if R3's path does not</text>
  <text class="s" x="320" y="156" text-anchor="middle">pass back through R1. A loop through R1 would necessarily cost more than R1's own route.</text>
  <text class="s" x="320" y="184" text-anchor="middle">Note it compares against the FD, not against the other path's FD. That catches people.</text>
</svg>
<p class="walk-say"><span class="walk-title">The condition, and why it is safe</span>
A neighbour is a <b>feasible successor</b> if its reported distance is strictly less than the router's current feasible distance. That single comparison is a <b>proof of loop-freedom</b>, computed locally, with no conversation.
<br><br>The logic: if R3's path went back through R1, R3's cost would have to include R1's cost plus the link — so it could not be lower than R1's. A lower reported distance therefore guarantees R3 is genuinely closer to the destination and not behind us.
<br><br>It is <b>conservative</b>. Some perfectly good loop-free paths fail the test and are not kept, which is the price of never having to check.</p>
</div>
<div class="walk-panel">
<svg viewBox="0 0 640 195" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="When the successor fails the feasible successor is promoted immediately with no queries">
  <style>.n{fill:#17171A}.nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.l{stroke:#8A8A93;stroke-width:1.5}</style>
  <rect class="n" x="20" y="80" width="66" height="32" rx="3"/><text class="nt" x="53" y="101" text-anchor="middle">R1</text>
  <rect class="n" x="250" y="34" width="66" height="32" rx="3" opacity=".4"/><text class="nt" x="283" y="55" text-anchor="middle">R2</text>
  <rect class="n" x="250" y="126" width="66" height="32" rx="3"/><text class="nt" x="283" y="147" text-anchor="middle">R3</text>
  <rect class="n" x="470" y="80" width="130" height="32" rx="3"/><text class="nt" x="535" y="101" text-anchor="middle">10.9.9.0/24</text>
  <line class="l" x1="86" y1="92" x2="250" y2="55" stroke-dasharray="5 4" stroke="#D3002D" stroke-width="2"/>
  <line x1="150" y1="64" x2="168" y2="80" stroke="#D3002D" stroke-width="2.5"/>
  <line x1="168" y1="64" x2="150" y2="80" stroke="#D3002D" stroke-width="2.5"/>
  <line class="l" x1="86" y1="102" x2="250" y2="142" stroke="#1f9d6b" stroke-width="3"/>
  <line class="l" x1="316" y1="142" x2="470" y2="102" stroke="#1f9d6b" stroke-width="3"/>
  <circle r="4.5" fill="#1f9d6b"><animateMotion dur="1.8s" repeatCount="indefinite" path="M 86 102 L 250 142 L 316 142 L 470 102"/></circle>
  <text class="k" x="320" y="184" text-anchor="middle" fill="#0f6b47">The route stays PASSIVE. No query, no wait, no recalculation.</text>
  <text class="s" x="320" y="166" text-anchor="middle">R3 was already in the topology table, already proven loop-free. It is simply installed.</text>
</svg>
<p class="walk-say"><span class="walk-title">Failover with no protocol exchange at all</span>
The successor dies and the feasible successor is promoted <b>immediately</b> — the route never leaves the <code>Passive</code> state, no packets are sent, and convergence is limited only by how fast the failure is detected.
<br><br>This is what people mean when they say EIGRP converges in milliseconds. It is not that EIGRP computes quickly; it is that <b>the computation already happened</b>, minutes ago, and the answer was sitting in the topology table waiting.</p>
</div>
<div class="walk-panel">
<svg viewBox="0 0 640 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="With no feasible successor the router goes active and floods queries to every neighbour">
  <style>.n{fill:#17171A}.nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.q{stroke:#F2994A;stroke-width:2.5;fill:none}</style>
  <rect class="n" x="270" y="82" width="80" height="34" rx="3" fill="#F2994A"/><text class="nt" x="310" y="104" text-anchor="middle">R1 ACTIVE</text>
  <rect class="n" x="40" y="26" width="66" height="28" rx="3"/><text class="nt" x="73" y="45" text-anchor="middle">R4</text>
  <rect class="n" x="40" y="146" width="66" height="28" rx="3"/><text class="nt" x="73" y="165" text-anchor="middle">R5</text>
  <rect class="n" x="530" y="26" width="66" height="28" rx="3"/><text class="nt" x="563" y="45" text-anchor="middle">R6</text>
  <rect class="n" x="530" y="146" width="66" height="28" rx="3"/><text class="nt" x="563" y="165" text-anchor="middle">R7</text>
  <path class="q" d="M 276 88 L 106 46"/><path class="q" d="M 276 112 L 106 154"/>
  <path class="q" d="M 344 88 L 530 46"/><path class="q" d="M 344 112 L 530 154"/>
  <circle r="4.5" fill="#F2994A"><animateMotion dur="1.6s" repeatCount="indefinite" path="M 276 88 L 106 46"/></circle>
  <circle r="4.5" fill="#F2994A"><animateMotion dur="1.6s" repeatCount="indefinite" path="M 344 112 L 530 154"/></circle>
  <text class="k" x="310" y="192" text-anchor="middle" fill="#B26014">Queries go to every neighbour — and each one queries its neighbours in turn.</text>
  <text class="s" x="310" y="70" text-anchor="middle">&#8220;Does anyone have a path to 10.9.9.0/24?&#8221;</text>
</svg>
<p class="walk-say"><span class="walk-title">No feasible successor means asking, and waiting</span>
With no pre-proven backup, EIGRP cannot invent one safely. The route goes <b>Active</b> and the router queries every neighbour — and each neighbour that has no answer of its own <b>queries its own neighbours</b>, and so on outward.
<br><br>The router cannot install anything until <b>every query is answered</b>. That is the fundamental cost of DUAL: convergence is fast when the answer was precomputed and bounded by the slowest router in the query radius when it was not.</p>
</div>
<div class="walk-panel">
<svg viewBox="0 0 640 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="If a query is not answered within three minutes the route goes stuck in active">
  <style>.s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.k{font-family:ui-sans-serif,system-ui;font-size:12px;font-weight:700}.m{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;fill:#17171A}.bad{fill:#FFF1F3;stroke:#D3002D}</style>
  <rect class="bad" x="40" y="30" width="560" height="60"/>
  <text class="k" x="320" y="56" text-anchor="middle" fill="#B80027">One unanswered query holds the whole route Active</text>
  <text class="s" x="320" y="78" text-anchor="middle">A router three hops away that is busy, or on a flapping link, or simply gone — and R1 waits.</text>
  <text class="m" x="320" y="118" text-anchor="middle" fill="#B80027">%DUAL-3-SIA: Route 10.9.9.0/24 stuck-in-active state in IP-EIGRP(0) 100</text>
  <text class="s" x="320" y="146" text-anchor="middle">After <tspan font-weight="700">three minutes</tspan> the active timer expires and EIGRP tears down the adjacency</text>
  <text class="s" x="320" y="162" text-anchor="middle">with whichever neighbour did not reply — which removes its routes and can start the problem again elsewhere.</text>
  <text class="s" x="320" y="190" text-anchor="middle">The fix is never to make queries faster. It is to make sure they do not travel that far.</text>
</svg>
<p class="walk-say"><span class="walk-title">Stuck in active</span>
SIA is not a bug in EIGRP; it is EIGRP giving up on a conversation nobody finished. The damage is that tearing down the adjacency removes every route learned from that neighbour, which can put <em>those</em> routes Active and propagate the disruption.
<br><br>Later releases added <b>SIA-Query</b> and <b>SIA-Reply</b> (opcodes 10 and 11) so a slow-but-alive neighbour can say "still working on it" and keep the adjacency. It reduces the blast radius; it does not remove the cause.
<br><br>The real fixes all shrink the query radius: <b>summarisation</b>, which stops queries at the summarising router, and <b>stub routers</b>, which are never queried at all.</p>
</div>
</div>
</div>

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

## On the wire

<div class="cap">
<div class="cap-head">Capture · EIGRP hello on a point-to-point link <span class="cap-filter">eigrp</span></div>
<div class="cap-hex"><pre>0000  01 00 5e 00 00 0a 00 1a  2b 3c 4d 5e 08 00 45 c0   ..^.....+&lt;M^..E.
0010  00 3c 00 00 00 00 <mark>01</mark> <mark>58</mark>  c2 9f 0a 00 0c 01 <mark>e0 00</mark>   .&lt;.....X........
0020  <mark>00 0a</mark> <mark>02</mark> <mark>05</mark> e7 65 00 00  00 00 00 00 00 00 00 00   .....e..........
0030  00 00 00 00 00 <mark>64</mark> 00 01  00 0c <mark>01 00 01 00 00 00</mark>   .....d..........
0040  <mark>00 0f</mark> 00 04 00 08 11 09  03 00                     ..........</pre></div>
<div class="cap-note"><b>Everything that has to match for an adjacency is in these bytes.</b> <code>01</code> — TTL 1, EIGRP never leaves the segment. <code>58</code> — protocol <b>88</b>. <code>e0 00 00 0a</code> — <b>224.0.0.10</b>, all EIGRP routers. <code>02</code> — version 2. <code>05</code> — opcode 5, a <b>Hello</b> (1 Update, 3 Query, 4 Reply, 10 SIA-Query, 11 SIA-Reply).
<br><br><code>64</code> — the <b>autonomous system number, 100</b>. Then the Parameters TLV: <code>01 00 01 00 00 00</code> is <b>K1=1, K2=0, K3=1, K4=0, K5=0, K6=0</b>, and <code>00 0f</code> is the hold time, 15 seconds.
<br><br><b>The AS number and the K values are the adjacency check.</b> Mismatch either and the neighbours never form — and the router will tell you so, in a log message people scroll past: <code>%DUAL-5-NBRCHANGE ... K-value mismatch</code>. Both are visible in one hello, which is why a capture settles this faster than comparing two configurations.</div>
</div>

<div class="term">
<div class="term-bar"><span class="term-dots"><i></i><i></i><i></i></span>R1 — the topology table is where the answer lives</div>
<pre><span class="p">R1#</span> <span class="c">show ip eigrp topology</span>
Codes: P - Passive, A - Active, U - Update, Q - Query, R - Reply

<span class="g">P</span>  10.9.9.0/24, <span class="y">2 successors</span>, FD is <span class="y">3072</span>
        via 10.0.12.2 (<span class="y">3072</span>/2816), GigabitEthernet0/1
        via 10.0.13.3 (5120/<span class="g">2560</span>), GigabitEthernet0/2

<span class="o">! Read the pair as (FD / RD). The second path's RD is 2560, which is less than</span>
<span class="o">! the FD of 3072 — so it passes the feasibility condition and is a feasible successor.</span>
<span class="o">! If its RD were 3072 or more it would NOT be listed here at all, however good the path.</span>

<span class="p">R1#</span> <span class="c">show ip eigrp topology all-links</span>
<span class="o">! THIS is the command that shows paths which FAILED feasibility. If you are asking</span>
<span class="o">! "why is that path not being used", the plain command will never tell you —</span>
<span class="o">! because it only lists paths that passed.</span>

<span class="p">R1#</span> <span class="c">show ip eigrp neighbors</span>
H   Address      Interface   Hold Uptime   SRTT   RTO  <span class="y">Q</span>  Seq
                             (sec)         (ms)       <span class="y">Cnt</span> Num
0   10.0.12.2    Gi0/1        13  02:14:55    4    100  <span class="g">0</span>   187
1   10.0.13.3    Gi0/2        11  02:14:51    6    100  <span class="r">3</span>   204

<span class="o">! Q Cnt is the queue count — packets waiting to be sent to that neighbour.</span>
<span class="o">! Anything other than 0 for more than a moment means that neighbour is not keeping up,</span>
<span class="o">! and it is the earliest warning you get of a stuck-in-active in the making.</span><span class="cur"></span></pre>
</div>
<p class="term-cap"><b><code>show ip eigrp topology all-links</code> is the command that answers the question the normal one hides.</b> The default output lists only successors and feasible successors — paths that passed the test. A path that failed feasibility is invisible, so "EIGRP is ignoring my backup link" looks like a bug until you add <code>all-links</code> and see it sitting there with an RD too high to qualify.</p>

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

## Configuration, word by word

<div class="cmd">
<div class="cmd-line">router eigrp <span class="opt">ENTERPRISE</span>
 <span class="t">address-family ipv4 unicast autonomous-system</span> <span class="opt">100</span>
  <span class="t">af-interface</span> <span class="opt">GigabitEthernet0/1</span>
   <span class="t">authentication mode md5</span>
   <span class="t">summary-address</span> <span class="opt">10.9.0.0 255.255.0.0</span>
  <span class="t">topology base</span>
   <span class="t">variance</span> <span class="opt">2</span>
   <span class="t">maximum-paths</span> <span class="opt">4</span>
   <span class="t">metric rib-scale</span> <span class="opt">128</span>
  network 10.0.0.0</div>
<dl class="cmd-parts">
<div class="is-key"><dt>router eigrp NAME<br><span class="opt">(named mode)</span></dt><dd>Named mode is not cosmetic. It is <b>required</b> for VRFs, for IPv6 in the same process, and for 64-bit <b>wide metrics</b>. Classic <code>router eigrp 100</code> cannot do any of those. If you are adding VRFs or 10-gig links to an EIGRP network, converting is part of the work.</dd></div>
<div><dt>autonomous-system 100</dt><dd>Must match on both neighbours, and it moves into the address-family line in named mode. A mismatch means no adjacency — and it is one of the two fields visible in the hello capture above.</dd></div>
<div class="is-key"><dt>summary-address</dt><dd>Summarisation in EIGRP happens <b>per interface</b>, anywhere you like — unlike OSPF, which can only do it at an area boundary. And it does something OSPF's does not: <b>a summarising router answers queries for the component routes itself</b>, so the query stops there. Summarisation is the primary defence against stuck-in-active.</dd></div>
<div class="is-key"><dt>variance 2</dt><dd>Unequal-cost load balancing. Any path whose FD is up to <b>2 ×</b> the best FD is installed alongside it. <b>But only feasible successors are eligible</b> — a path that failed the feasibility condition is never used however large you make the variance. That is the detail the exam tests and the one that makes people think variance is broken.</dd></div>
<div><dt>maximum-paths 4</dt><dd>How many paths may be installed at once. Default 4; raise it if variance is finding more than that and you want them all.</dd></div>
<div><dt>metric rib-scale 128</dt><dd>Wide metrics are 64-bit and the routing table's metric field is 32-bit, so the value is divided by this factor on the way into the RIB. It affects what <code>show ip route</code> displays, not what EIGRP computes with. Leave it alone unless you are comparing metrics across a redistribution boundary.</dd></div>
<div class="is-key"><dt><span class="opt">eigrp stub</span></dt><dd>Not shown above, and the other half of query control. A stub router <b>advertises that it is a stub in its hello</b>, and neighbours then never send it queries at all. Every access-layer router in a hub-and-spoke design should be a stub — it costs nothing and it is the single most effective thing you can do about SIA.</dd></div>
</dl>
</div>

<div class="real">
<b>In the real world</b>
EIGRP's reputation for sub-second convergence is earned, and it is <b>conditional</b>. It holds exactly as long as there is a feasible successor. When there is not, convergence time is set by the slowest, furthest router that has to answer a query — which in a flat network with no summarisation and no stubs can be the other side of the country, over a circuit that is flapping.
<br><br>So the useful operational metric is not "how fast does EIGRP converge". It is <b>what fraction of your prefixes have a feasible successor</b>. Run <code>show ip eigrp topology</code> across your core and count how many entries show a second path. If most show only one, your network will converge slowly under exactly the conditions where you need it not to — and the fixes are summarisation and stubs, not timers.
</div>

<div class="lab">
<div class="lab-head">Lab — make one failure instant and the next one take three minutes</div>
<div class="lab-body">

<div class="lab-target"><b>Target</b>
Build a topology where one destination has a feasible successor and another does not, then fail both and measure the difference with a stopwatch. Find a path that failed the feasibility condition and prove that variance will not use it. Then produce a real stuck-in-active, and remove it two ways — with summarisation and with a stub router.</div>

**Topology.** R1 with two paths to a destination behind R4: one via R2, one via R3. Make the R2 path clearly better. Behind R3, a chain of routers R5–R7 so queries have somewhere slow to travel.

<p class="lab-step"><span class="n">1</span>Find the four numbers</p>

```cisco
R1# show ip eigrp topology 10.9.9.0/24
R1# show ip eigrp topology all-links
```

<div class="lab-watch"><b>Things to notice</b>
Write down the FD and the RD of each path, and apply the feasibility condition by hand before reading the output's verdict. Then compare the two commands: <code>all-links</code> shows paths the plain command hides, and if a path appears only in <code>all-links</code> it failed feasibility. That difference is the answer to most "why isn't my backup being used" questions.</div>

<p class="lab-step"><span class="n">2</span>Fail the successor, twice</p>

Start a continuous ping. Shut the R1–R2 link and count lost packets. Restore.

Now raise R3's reported distance — increase the delay on R3's link toward R4 until its RD exceeds R1's FD — so the second path **fails** feasibility. Confirm with `all-links`. Then fail R1–R2 again.

<div class="lab-watch"><b>Things to notice</b>
The first failure costs you almost nothing — the route never leaves <code>Passive</code>, because the answer was already computed. The second sends the route <b>Active</b>, floods queries down the R3–R5–R6–R7 chain, and takes as long as the slowest reply.
<br><br><b>Same topology, same failure, two completely different convergence times</b>, and the only thing that changed was whether a backup path had been pre-proven. Record both numbers; this is the single most useful measurement in the topic.</div>

<p class="lab-step"><span class="n">3</span>Prove that variance cannot rescue a non-feasible path</p>

With the second path still failing feasibility:

```cisco
router eigrp ENTERPRISE
 address-family ipv4 unicast autonomous-system 100
  topology base
   variance 8
```

<div class="lab-issues"><b>Possible issues</b>
<ul>
<li><b>Nothing is installed no matter how high you set variance</b> — that is the expected result and the point of the step.</li>
<li><b>A second path appears</b> — it still passes feasibility. Raise the delay further until <code>all-links</code> confirms the RD exceeds the FD.</li>
<li><b>You see more paths than expected</b> — check <code>maximum-paths</code>; the default of 4 caps it.</li>
</ul>
Then lower the delay so the path becomes feasible again, and watch variance install it immediately. <b>Variance widens the net; feasibility decides what is allowed in it.</b></div>

<p class="lab-step"><span class="n">4</span>Produce a stuck-in-active</p>

With no feasible successor, make the far end of the query chain unable to answer — shut R7's interfaces, or apply an ACL on R6 that drops EIGRP (protocol 88) toward R7 so queries leave and replies never return. Then fail R1–R2.

<div class="lab-watch"><b>Things to notice</b>
Watch <code>show ip eigrp topology active</code> and the <b>Q Cnt</b> column in <code>show ip eigrp neighbors</code> climb. After three minutes you get <code>%DUAL-3-SIA</code> and the adjacency is torn down — and then watch the <b>secondary damage</b>: every route learned from that neighbour disappears, and some of those go Active too.
<br><br>That cascade is why SIA is treated as serious rather than as a slow convergence event. One unanswered query has just disrupted routes that had nothing to do with the original failure.</div>

<p class="lab-step"><span class="n">5</span>Stop the query at a summary</p>

Undo the ACL. On R3, summarise the destination toward R1:

```cisco
 af-interface GigabitEthernet0/1
  summary-address 10.9.0.0 255.255.0.0
```

Re-run the failure.

<div class="lab-watch"><b>Things to notice</b>
The query now <b>stops at R3</b> — R3 answers for the whole summarised range itself and never passes the query on. Confirm by watching for queries on the R3–R5 link and seeing none.
<br><br>This is the difference from OSPF worth stating out loud: EIGRP summarisation is a <b>query boundary</b>, not just a table-size optimisation, and that makes it a convergence tool rather than a tidiness one.</div>

<p class="lab-step"><span class="n">6</span>Make the spokes stubs</p>

Remove the summary. On R5, R6 and R7:

```cisco
 eigrp stub connected summary
```

```cisco
R3# show ip eigrp neighbors detail
```

<div class="lab-watch"><b>Things to notice</b>
The neighbour output now says <code>Stub Peer Advertising (CONNECTED, SUMMARY)</code>. Re-run the failure and watch: <b>no queries are sent to the stubs at all</b>. R3 knows not to ask them, because they told it so in their hellos.
<br><br>Compare the convergence time with step 2's worst case. Then consider that the entire fix was one line per access router, and that it is the correct default for every spoke in every hub-and-spoke EIGRP network you will ever build.</div>

<div class="lab-earned"><b>What you earned</b>
You can read FD and RD off a topology table and apply the feasibility condition yourself, and you know that <code>all-links</code> is the command that reveals the paths the default output hides. You have measured the same failure converging in milliseconds and in minutes, and you know the only difference was whether a backup had been pre-proven. You know variance cannot use a path that failed feasibility, however large you set it. And you have caused a stuck-in-active, watched it damage routes unrelated to the original failure, and fixed it twice — with a summary and with a stub — which are the two tools that actually work.</div>

</div>
</div>

## EIGRP versus OSPF, briefly

Both are used successfully in large enterprises. The honest comparison:

**EIGRP** converges faster where feasible successors exist, is simpler to configure, and handles unequal-cost load balancing natively via the `variance` command — something OSPF cannot do at all. Its weakness is query scope, which must be managed architecturally.

**OSPF** is an open standard with genuine multi-vendor support, and its area structure enforces a hierarchy that limits blast radius by design rather than by discipline. Its weakness is configuration complexity and the reference-bandwidth trap.

The practical determinant is usually vendor mix. An all-Cisco estate can reasonably choose either; a mixed estate chooses OSPF.

---

EIGRP's elegance is the feasibility condition — a simple arithmetic test that proves a backup path is loop-free without any topology computation. Its weakness is what happens when no such path exists, and that's entirely addressable with summarisation and stub routers. Both are one line of configuration and both are routinely omitted.
