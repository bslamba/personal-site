---
title: "How a Router Chooses: The Routing Table, Longest Match, and Administrative Distance"
excerpt: "Three rules decide every packet a router forwards, and almost everyone learns them in the wrong order. Longest prefix match, administrative distance and metric are not a sequence — they belong to two different planes, and knowing which one runs when is the difference between reading a routing table and guessing at it."
date: "2026-09-23"
tags: ["Routing", "Routing Table", "Administrative Distance", "CEF", "Longest Match", "CCNA", "ENARSI"]
draft: false
---

> **Blueprint:** CCNA 200-301 — 3.1 *Interpret the components of routing table* and 3.2 *Determine how a router makes a forwarding decision by default*. ENARSI 300-410 — 1.1 *Troubleshoot administrative distance (all routing protocols)*.

## Cheat sheet

**The codes at the start of every line:**

| | | | |
|---|---|---|---|
| `C` | Connected | `O` | OSPF intra-area |
| `L` | **Local** — the router's own /32 | `O IA` | OSPF inter-area |
| `S` | Static | `O E1` / `O E2` | OSPF external |
| `S*` | Static, **candidate default** | `O N1` / `O N2` | OSPF NSSA external |
| `D` | EIGRP | `i L1` / `i L2` | IS-IS |
| `D EX` | EIGRP external | `B` | BGP |
| `R` | RIP | `*` | Candidate default |

**Administrative distance — used when *building* the table:**

| | AD | | AD |
|---|---|---|---|
| Connected | **0** | IS-IS | 115 |
| Static | **1** | RIP | **120** |
| EIGRP summary | 5 | EGP | 140 |
| eBGP | **20** | ODR | 160 |
| EIGRP internal | **90** | **EIGRP external** | **170** |
| IGRP | 100 | iBGP | **200** |
| OSPF | **110** | Unknown | **255** — never installed |

**The rule people state backwards.** Longest prefix match is **not** step one of a three-step comparison. It is the *only* thing that happens at forwarding time. Administrative distance and metric were used earlier, to decide what went into the table in the first place.

---

## Two planes, two questions

A router answers two completely separate questions, at two different times, using two different mechanisms. Conflating them is the single biggest source of confusion in this topic.

<figure class="fig">
<svg class="sv1" viewBox="0 0 640 260" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The control plane uses metric and administrative distance to decide what goes in the routing table, and the data plane uses longest prefix match to forward each packet">
  <style>.sv1 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv1 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv1 .m{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;fill:#17171A}.sv1 .hdr{font-family:ui-sans-serif,system-ui;font-size:10.5px;font-weight:700;letter-spacing:.06em}.sv1 .cp{fill:rgba(75,123,236,.08);stroke:#4b7bec}.sv1 .dp{fill:rgba(31,157,107,.08);stroke:#1f9d6b}.sv1 .bx{fill:#F1EEE9;stroke:#B5B5BC}
  </style>
  <rect class="cp" x="14" y="30" width="290" height="180" stroke-dasharray="4 3"/>
  <text class="hdr" x="26" y="50" fill="#2b5ab8">CONTROL PLANE — occasionally</text>
  <rect class="bx" x="30" y="62" width="120" height="26"/><text class="m" x="90" y="79" text-anchor="middle">OSPF says</text>
  <rect class="bx" x="30" y="94" width="120" height="26"/><text class="m" x="90" y="111" text-anchor="middle">EIGRP says</text>
  <rect class="bx" x="30" y="126" width="120" height="26"/><text class="m" x="90" y="143" text-anchor="middle">static says</text>
  <text class="k" x="176" y="84" fill="#2b5ab8">metric</text>
  <text class="s" x="176" y="98">within one protocol</text>
  <text class="k" x="176" y="126" fill="#2b5ab8">AD</text>
  <text class="s" x="176" y="140">between protocols,</text>
  <text class="s" x="176" y="154">same prefix length</text>
  <rect x="30" y="166" width="258" height="30" fill="#fff" stroke="#4b7bec"/>
  <text class="m" x="159" y="186" text-anchor="middle" fill="#2b5ab8">→ the RIB, what show ip route prints</text>
  <rect class="dp" x="336" y="30" width="290" height="180" stroke-dasharray="4 3"/>
  <text class="hdr" x="348" y="50" fill="#0f6b47">DATA PLANE — every single packet</text>
  <rect class="bx" x="352" y="70" width="120" height="30"/><text class="m" x="412" y="90" text-anchor="middle">packet arrives</text>
  <text class="k" x="490" y="90" fill="#0f6b47">longest match</text>
  <rect x="352" y="118" width="258" height="30" fill="#fff" stroke="#1f9d6b"/>
  <text class="m" x="481" y="138" text-anchor="middle" fill="#0f6b47">→ the FIB, built by CEF from the RIB</text>
  <text class="s" x="352" y="170">AD and metric are <tspan font-weight="700">not consulted here at all</tspan>.</text>
  <text class="s" x="352" y="188">They already did their job. The FIB has one answer per prefix.</text>
  <text class="k" x="320" y="238" text-anchor="middle">A more specific route always wins — even from a &#8220;worse&#8221; protocol with a higher AD.</text>
  <text class="s" x="320" y="254" text-anchor="middle">Because by forwarding time, both routes are already in the table and only their length matters.</text>
</svg>
<figcaption><b>Figure 1.</b> Metric narrows one protocol's offering to its best. AD picks between protocols offering <em>the same prefix</em>. Longest match then chooses between the different prefixes that survived — and it is the only rule the data plane knows.</figcaption>
</figure>

<div class="why">
<b>Say it once, properly</b>
<b>Metric</b> is a protocol arguing with itself: OSPF has four paths to 10.1.1.0/24 and picks the lowest cost. <b>Administrative distance</b> is the router arbitrating between protocols that are all offering <b>the same prefix with the same mask</b> — OSPF's 10.1.1.0/24 versus EIGRP's 10.1.1.0/24 — and the lower AD is installed. <b>Longest prefix match</b> never compares protocols at all. It compares <em>prefix lengths</em> among routes that are already in the table, and the most specific one wins, unconditionally.
</div>

---

## Watch both planes run

<div class="walk">
<div class="walk-head">From three protocols to one forwarded packet <span class="walk-hint">click a step</span></div>
<div class="walk-tabs">
  <input type="radio" name="rtw" id="rt1" checked><label for="rt1"><span class="step-n">1</span>Each protocol</label>
  <input type="radio" name="rtw" id="rt2"><label for="rt2"><span class="step-n">2</span>Metric</label>
  <input type="radio" name="rtw" id="rt3"><label for="rt3"><span class="step-n">3</span>AD</label>
  <input type="radio" name="rtw" id="rt4"><label for="rt4"><span class="step-n">4</span>The table</label>
  <input type="radio" name="rtw" id="rt5"><label for="rt5"><span class="step-n">5</span>Longest match</label>
</div>
<div class="walk-panels">
<div class="walk-panel">
<svg class="sv2" viewBox="0 0 640 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Three routing protocols each offer routes for the same destination">
  <style>.sv2 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv2 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv2 .m{font-family:ui-monospace,Menlo,monospace;font-size:11px;fill:#17171A}.sv2 .bx{fill:#F1EEE9;stroke:#B5B5BC}.sv2 .hdr{font-family:ui-sans-serif,system-ui;font-size:10px;font-weight:700;letter-spacing:.06em}</style>
  <text class="hdr" x="14" y="22" fill="#8A8A93">WHAT EACH PROTOCOL IS OFFERING</text>
  <rect class="bx" x="14" y="34" width="290" height="56"/>
  <text class="k" x="26" y="54" fill="#2b5ab8">OSPF</text>
  <text class="m" x="26" y="74">10.1.1.0/24 via A cost 30 · via B cost 50</text>
  <rect class="bx" x="14" y="98" width="290" height="56"/>
  <text class="k" x="26" y="118" fill="#0f6b47">EIGRP</text>
  <text class="m" x="26" y="138">10.1.1.0/24 via C, FD 3072</text>
  <rect class="bx" x="322" y="34" width="290" height="56"/>
  <text class="k" x="334" y="54" fill="#B26014">STATIC</text>
  <text class="m" x="334" y="74">10.1.1.128/25 via D</text>
  <rect class="bx" x="322" y="98" width="290" height="56"/>
  <text class="k" x="334" y="118" fill="#8A8A93">CONNECTED</text>
  <text class="m" x="334" y="138">10.1.1.0/24 on Gi0/0 — if it were local</text>
  <text class="s" x="320" y="184" text-anchor="middle">Four sources, three different prefixes. Nothing has been decided yet.</text>
</svg>
<p class="walk-say"><span class="walk-title">Everyone submits their candidates</span>
Each routing protocol maintains its own database and its own idea of the best path. None of them can see the others. The routing table has not been touched yet — these are proposals.
<br><br>Note that the static route is for a <b>different prefix</b>: <code>/25</code>, not <code>/24</code>. That will matter enormously in step 5 and not at all in step 3.</p>
</div>
<div class="walk-panel">
<svg class="sv3" viewBox="0 0 640 195" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Each protocol uses its own metric to reduce its offering to a single best path">
  <style>.sv3 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv3 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv3 .m{font-family:ui-monospace,Menlo,monospace;font-size:11px;fill:#17171A}.sv3 .ok{fill:rgba(31,157,107,.12);stroke:#1f9d6b}.sv3 .no{fill:#F1EEE9;stroke:#B5B5BC}</style>
  <text class="k" x="14" y="28" fill="#2b5ab8">STEP 1 — METRIC, inside each protocol only</text>
  <rect class="ok" x="14" y="42" width="290" height="34"/>
  <text class="m" x="26" y="64" fill="#0f6b47">OSPF: via A cost 30  ✓ kept</text>
  <rect class="no" x="14" y="84" width="290" height="34" opacity=".45"/>
  <text class="m" x="26" y="106" opacity=".5">OSPF: via B cost 50  ✗ discarded</text>
  <text class="s" x="14" y="146">OSPF compares OSPF costs. EIGRP compares EIGRP metrics. Neither number</text>
  <text class="s" x="14" y="162">means anything to the other, and neither protocol ever sees the other's offer.</text>
  <text class="s" x="14" y="186">Each protocol now submits exactly one best path per prefix — or several, if they are equal cost.</text>
</svg>
<p class="walk-say"><span class="walk-title">Metric — a protocol narrowing its own field</span>
This happens entirely <b>inside</b> each protocol, using a metric that is meaningless outside it. An OSPF cost of 30 and an EIGRP feasible distance of 3072 are not comparable quantities, which is exactly why the next step cannot use metrics.
<br><br>If a protocol has several equal-cost paths it submits all of them, and they are installed together for <b>equal-cost load balancing</b>.</p>
</div>
<div class="walk-panel">
<svg class="sv4" viewBox="0 0 640 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Administrative distance decides between protocols offering the same prefix and mask">
  <style>.sv4 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv4 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv4 .m{font-family:ui-monospace,Menlo,monospace;font-size:11px;fill:#17171A}.sv4 .ok{fill:rgba(31,157,107,.12);stroke:#1f9d6b}.sv4 .no{fill:#FFF1F3;stroke:#D3002D}</style>
  <text class="k" x="14" y="28" fill="#2b5ab8">STEP 2 — ADMINISTRATIVE DISTANCE, same prefix only</text>
  <rect class="ok" x="14" y="42" width="290" height="40"/>
  <text class="m" x="26" y="60" fill="#0f6b47">EIGRP  10.1.1.0/24  AD 90</text>
  <text class="s" x="26" y="76" fill="#0f6b47">installed</text>
  <rect class="no" x="322" y="42" width="290" height="40"/>
  <text class="m" x="334" y="60" fill="#B80027">OSPF   10.1.1.0/24  AD 110</text>
  <text class="s" x="334" y="76" fill="#B80027">kept in the OSPF database, not in the RIB</text>
  <text class="k" x="14" y="112">90 beats 110, so EIGRP's /24 is installed.</text>
  <text class="s" x="14" y="136">The OSPF route has not been deleted — OSPF still has it, still floods it, and will install it</text>
  <text class="s" x="14" y="152">the instant the EIGRP route disappears. That is what makes AD a <tspan font-weight="700">preference</tspan> rather than a filter.</text>
  <text class="s" x="14" y="184" fill="#B80027">Crucially: the /25 static route was never part of this comparison. Different prefix length, different contest.</text>
</svg>
<p class="walk-say"><span class="walk-title">AD — arbitration between protocols, for identical prefixes</span>
Two protocols both offering <b>10.1.1.0/24</b>. The router cannot compare their metrics, so it compares how much it trusts the <em>source</em>: EIGRP internal at 90 beats OSPF at 110, and EIGRP's route is installed.
<br><br><b>The losing route is not discarded.</b> It sits in OSPF's database, and if the EIGRP route is withdrawn it is installed within milliseconds. That is the mechanism behind a <b>floating static route</b> — a static with its AD deliberately raised above a protocol's, so it waits in the wings.</p>
</div>
<div class="walk-panel">
<svg class="sv5" viewBox="0 0 640 190" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The routing table now holds routes of different prefix lengths from different sources">
  <style>.sv5 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv5 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv5 .m{font-family:ui-monospace,Menlo,monospace;font-size:11.5px;fill:#17171A}.sv5 .hdr{font-family:ui-sans-serif,system-ui;font-size:10px;font-weight:700;letter-spacing:.06em}</style>
  <rect x="14" y="30" width="612" height="104" fill="#fff" stroke="#4b7bec"/>
  <text class="hdr" x="26" y="50" fill="#2b5ab8">THE RIB — WHAT SHOW IP ROUTE PRINTS</text>
  <text class="m" x="26" y="74">D    10.1.1.0/24   [90/3072]  via 10.0.0.3</text>
  <text class="m" x="26" y="94">S    10.1.1.128/25 [1/0]      via 10.0.0.4</text>
  <text class="m" x="26" y="114">S*   0.0.0.0/0     [1/0]      via 10.0.0.9</text>
  <text class="s" x="14" y="158">Three entries, three different prefix lengths, three different sources — and they coexist happily.</text>
  <text class="k" x="14" y="182" fill="#2b5ab8">The control plane is finished. Nothing above will be reconsidered per packet.</text>
</svg>
<p class="walk-say"><span class="walk-title">The table, and what the brackets mean</span>
<code>[90/3072]</code> is <b>[administrative distance / metric]</b> — a record of the decisions already made, kept so you can see why this route is here. The router will not re-evaluate them when a packet arrives.
<br><br>CEF then compiles this into the <b>FIB</b>, a structure optimised for one operation and one only: find the longest matching prefix, fast, in hardware. <code>show ip cef</code> shows it, and on a healthy router it agrees with the RIB.</p>
</div>
<div class="walk-panel">
<svg class="sv6" viewBox="0 0 640 215" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A packet is forwarded using the longest matching prefix regardless of which protocol supplied it">
  <style>.sv6 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv6 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv6 .m{font-family:ui-monospace,Menlo,monospace;font-size:11.5px;fill:#17171A}.sv6 .ok{fill:rgba(31,157,107,.14);stroke:#1f9d6b}.sv6 .no{fill:#F1EEE9;stroke:#B5B5BC}</style>
  <text class="k" x="14" y="26">packet for <tspan font-family="ui-monospace,Menlo,monospace">10.1.1.200</tspan> — which entry wins?</text>
  <rect class="no" x="14" y="38" width="612" height="30" opacity=".5"/>
  <text class="m" x="26" y="58" opacity=".55">D    10.1.1.0/24     matches — 24 bits     AD 90</text>
  <rect class="ok" x="14" y="74" width="612" height="30"/>
  <text class="m" x="26" y="94" fill="#0f6b47">S    10.1.1.128/25   matches — 25 bits     AD 1      ← WINS</text>
  <rect class="no" x="14" y="110" width="612" height="30" opacity=".5"/>
  <text class="m" x="26" y="130" opacity=".55">S*   0.0.0.0/0       matches — 0 bits      AD 1</text>
  <circle r="5" fill="#1f9d6b"><animateMotion dur="2s" repeatCount="indefinite" path="M 600 26 L 600 89 L 40 89"/></circle>
  <text class="k" x="14" y="168" fill="#0f6b47">25 bits beat 24. The AD column is not even looked at.</text>
  <text class="s" x="14" y="192">Reverse the ADs — make the /25 an eBGP route at 20 and the /24 a connected route at 0 — and</text>
  <text class="s" x="14" y="208">nothing changes. The /25 still wins, because at forwarding time only the length matters.</text>
</svg>
<p class="walk-say"><span class="walk-title">Longest match — and it does not care where the route came from</span>
The packet is for <code>10.1.1.200</code>. Three entries match it. The <b>/25</b> is the most specific, so it is used — even though it is a static route sitting alongside a dynamically learned /24, and even though the default route also technically matches.
<br><br>This is the rule that surprises people: <b>a more specific route from a "worse" source always beats a less specific route from a "better" one</b>. AD had its chance earlier and only against an identical prefix. It does not get a second vote.
<br><br>It is also why an accidental static <code>/32</code> can silently override an entire routing protocol for one host, and why route summarisation and leaking need care — the more specific prefix wins, always.</p>
</div>
</div>
</div>

---

## Reading a real table, field by field

<div class="term">
<div class="term-bar"><span class="term-dots"><i></i><i></i><i></i></span>R1 — every component the blueprint names, in one screen</div>
<pre><span class="p">R1#</span> <span class="c">show ip route</span>
Codes: L - local, C - connected, S - static, R - RIP, M - mobile, B - BGP
       D - EIGRP, EX - EIGRP external, O - OSPF, IA - OSPF inter area
       E1 - OSPF external type 1, E2 - OSPF external type 2
       * - candidate default, U - per-user static route

<span class="y">Gateway of last resort is 10.0.0.9 to network 0.0.0.0</span>

<span class="g">S*</span>    <span class="y">0.0.0.0/0</span> [<span class="y">1</span>/<span class="y">0</span>] via <span class="y">10.0.0.9</span>
      10.0.0.0/8 is variably subnetted, 6 subnets, 4 masks
<span class="g">C</span>        10.0.0.0/30 is directly connected, GigabitEthernet0/0
<span class="g">L</span>        10.0.0.1/32 is directly connected, GigabitEthernet0/0
<span class="g">D</span>        10.1.1.0/24 [<span class="y">90</span>/<span class="y">3072</span>] via 10.0.0.3, 00:14:22, GigabitEthernet0/1
<span class="g">S</span>        10.1.1.128/25 [1/0] via 10.0.0.4
<span class="g">O IA</span>     10.2.0.0/16 [110/20] via 10.0.0.5, 01:02:11, GigabitEthernet0/2
<span class="g">B</span>        192.0.2.0/24 [20/0] via 203.0.113.1, 2d04h

<span class="o">! Take one line apart:</span>
<span class="o">!   D            the code — this came from EIGRP</span>
<span class="o">!   10.1.1.0     the prefix</span>
<span class="o">!   /24          the network mask, in prefix-length form</span>
<span class="o">!   [90/3072]    [administrative distance / metric]</span>
<span class="o">!   via 10.0.0.3 the next hop — who to hand the packet to</span>
<span class="o">!   00:14:22     how long this route has been in the table</span>
<span class="o">!   Gi0/1        the exit interface</span>

<span class="p">R1#</span> <span class="c">show ip route 10.1.1.200</span>
Routing entry for <span class="g">10.1.1.128/25</span>            <span class="o">&lt;- the LONGEST match, not the /24</span>
  Known via "static", distance 1, metric 0
  Routing Descriptor Blocks:
  * 10.0.0.4
      Route metric is 0, traffic share count is 1<span class="cur"></span></pre>
</div>
<p class="term-cap"><b><code>show ip route &lt;address&gt;</code> is the command that ends arguments.</b> Give it a host address and the router tells you exactly which entry it would use — running the real longest-match lookup rather than making you eyeball the table. It is faster and more reliable than reasoning about it, and it is the first thing to run when traffic is going somewhere unexpected.</p>

<div class="note">
<b>The <code>L</code> route, and why your table doubled in size</b>
Every connected interface produces <b>two</b> entries: a <code>C</code> route for the subnet and an <code>L</code> route for the router's own address as a <code>/32</code>. The local route was added in IOS 15 and exists so the router can match traffic addressed to <em>itself</em> with a single exact-match lookup instead of a special case. It is not a fault and it cannot be removed — if you learned routing before IOS 15 and your tables suddenly look twice as long, this is why.
</div>

---

## Administrative distance as a tool

AD is not just something to read — it is something to set, and the floating static route is the reason.

<div class="cmd">
<div class="cmd-line"><span class="t">ip route</span> <span class="opt">0.0.0.0 0.0.0.0</span> <span class="opt">10.0.0.9</span>
<span class="t">ip route</span> <span class="opt">0.0.0.0 0.0.0.0</span> <span class="opt">10.0.0.13</span> <span class="t">130</span>
!
<span class="t">ip route</span> <span class="opt">10.9.9.0 255.255.255.0</span> <span class="opt">10.0.0.9</span> <span class="t">track</span> <span class="opt">1</span>
!
router ospf 1
 <span class="t">distance</span> <span class="opt">115</span>
 <span class="t">distance</span> <span class="opt">200 10.0.0.5 0.0.0.0 PREFIXES</span></div>
<dl class="cmd-parts">
<div><dt>ip route … 10.0.0.9</dt><dd>A static default with the AD left at its default of <b>1</b>. It beats everything except a connected route, which is why a forgotten static is such a common cause of "the routing protocol is being ignored".</dd></div>
<div class="is-key"><dt>… 10.0.0.13 <b>130</b></dt><dd>A <b>floating static route</b>. The trailing number is the administrative distance, set here to 130 — deliberately <b>worse than RIP's 120 and OSPF's 110</b>, so it is not installed while any dynamic route exists. The moment the dynamic route is withdrawn, this one appears. It is the standard way to build a backup path that costs nothing while the primary is healthy.
<br><br>Pick the number deliberately: it must be higher than the AD of whatever it is backing up. A "floating" static at AD 100 does not float above OSPF at 110 — it overrides it.</dd></div>
<div class="is-key"><dt>track 1</dt><dd>A static route is believed as long as its <b>next hop is reachable</b>, which on a connected subnet means "forever". Attaching a tracked object driven by an IP SLA probe makes it withdraw when the far end actually stops answering. <b>Without tracking, a static route is a promise nobody checks</b> — and a floating static behind it never gets its turn.</dd></div>
<div><dt>distance 115<br><span class="opt">(under a protocol)</span></dt><dd>Changes the AD of every route from that protocol. Blunt, global, and it will surprise the next engineer — but it is the fastest way to flip a preference during an incident.</dd></div>
<div class="is-key"><dt>distance 200 &lt;source&gt;<br>&lt;wildcard&gt; ACL</dt><dd>Changes the AD only for routes from a specific neighbour, and only for prefixes matched by the ACL. This is the surgical form, and the one to use in production — it documents which routes you meant and leaves everything else alone.</dd></div>
<div><dt><span class="opt">AD 255</span></dt><dd>A route with AD 255 is considered unusable and is <b>never installed</b>. Setting it is a way to suppress specific routes without filtering them, and seeing it unexpectedly means somebody already did.</dd></div>
</dl>
</div>

<div class="real">
<b>In the real world</b>
The most common AD incident is not exotic. Somebody adds a static route during a migration — "just temporarily, to get this working" — with the default AD of 1. It beats every dynamic protocol on the box. The migration finishes, the static stays, and months later the routing protocol reconverges around a failure exactly as designed while traffic continues down a dead path because a static route insists it is fine. Nothing alarms, because the route is <em>up</em>; the next hop is on a connected subnet.
<br><br>Two habits: every static route in production gets a <code>track</code> object, and <code>show ip route | include ^S</code> goes on your pre-change checklist. The second takes five seconds and finds leftovers nobody remembers.
</div>

---

## What goes wrong

**A routing protocol is "being ignored".** A static route with AD 1 for the same prefix. `show ip route <prefix>` names the source.

**Traffic goes somewhere the protocol did not choose.** A more specific prefix from another source. Longest match wins regardless of AD — check for a `/32` or a summarised leak.

**A backup path never activates.** The floating static's AD is lower than the primary's, so it is not floating at all — or the primary static has no `track`, so it never withdraws.

**Two routers disagree about the best path.** One has a locally significant AD change, or a `weight` in BGP. AD is not advertised; it is a local decision every time.

**The table has doubled in size.** `L` routes. Normal since IOS 15.

**`show ip route` and `show ip cef` disagree.** Rare and worth taking seriously — the FIB is what actually forwards. Usually a platform bug or a hardware programming failure; `clear ip route *` rebuilds it.

**A route is in the protocol's database but not in the table.** Either a better AD won, or the next hop is unreachable. `show ip ospf database` versus `show ip route` will show the difference.

---

<div class="lab">
<div class="lab-head">Lab — five sources, one prefix, and proving which rule decided</div>
<div class="lab-body">

<div class="lab-target"><b>Target</b>
Build a routing table where the same destination is offered by five different sources, and be able to say — before you look — which one will be installed and why. Then prove that longest match beats administrative distance by making a deliberately "worse" route win. Finally build a floating static that actually floats, and discover why most of them do not.</div>

**Topology.** R1 connected to R2 (OSPF), R3 (EIGRP), R4 (RIP) and R5 (eBGP), with all four advertising `10.1.1.0/24`. A fifth path via R6 available for static routes.

<p class="lab-step"><span class="n">1</span>Bring the sources up one at a time</p>

Enable each protocol in turn — RIP first, then OSPF, then EIGRP, then BGP — running `show ip route 10.1.1.0` after each.

<div class="lab-watch"><b>Things to notice</b>
The installed route changes each time a lower AD appears: 120 → 110 → 90, and eBGP's 20 takes it at the end. <b>Predict each change before you make it.</b> Then run <code>show ip ospf database</code> and <code>show ip eigrp topology</code> and confirm the losing routes are still there, fully computed, just not installed. AD is a preference, not a filter — that is the sentence this step exists to prove.</div>

<p class="lab-step"><span class="n">2</span>Beat every one of them with a worse route</p>

```cisco
ip route 10.1.1.128 255.255.255.128 10.0.0.6
```

```cisco
R1# show ip route 10.1.1.200
R1# show ip route 10.1.1.50
```

<div class="lab-watch"><b>Things to notice</b>
Traffic to <b>10.1.1.200</b> now takes the static /25, beating eBGP's /24 at AD 20 — and the AD column was never consulted. Traffic to <b>10.1.1.50</b> still takes the /24, because it does not match the /25 at all.
<br><br>One prefix, two host addresses, two different forwarding decisions. That is longest match, and it is the clearest possible demonstration that it operates on a different plane from AD.</div>

<p class="lab-step"><span class="n">3</span>Prove the plane distinction with a trace</p>

```cisco
R1# show ip cef 10.1.1.200
R1# show ip cef 10.1.1.50
R1# show ip route 10.1.1.200 | include Known via
```

<div class="lab-watch"><b>Things to notice</b>
The CEF entries show the exit interface and next hop with <b>no AD and no metric anywhere in the output</b> — because the FIB does not store them. It has no use for them. That absence is the proof that the data plane is a different machine from the control plane.</div>

<p class="lab-step"><span class="n">4</span>Build a floating static that does not float</p>

```cisco
ip route 10.1.1.0 255.255.255.0 10.0.0.6 100
```

<div class="lab-issues"><b>Possible issues</b>
<ul>
<li><b>It is installed immediately, replacing the dynamic route</b> — that is the expected result and the point of the step. AD 100 beats OSPF's 110 and RIP's 120, so it is not floating above them; it is sitting on top of them.</li>
<li><b>Nothing changes</b> — eBGP at 20 is still winning. Shut the BGP session first so the comparison is against an IGP.</li>
<li><b>You cannot tell which is installed</b> — <code>show ip route 10.1.1.0</code> prints <code>Known via</code>, which names the source outright.</li>
</ul>
Now raise it to <b>130</b> and confirm it disappears from the table while the dynamic route exists. Shut the dynamic path and watch it appear within a second. <b>That</b> is a floating static.</div>

<p class="lab-step"><span class="n">5</span>Discover why floating statics fail in production</p>

Point the primary static at a next hop on a connected subnet, then switch off the device at that next hop while leaving the link up.

<div class="lab-watch"><b>Things to notice</b>
The primary static <b>stays in the table</b>, because its next hop is still reachable via the connected subnet — so the floating backup never gets its turn, and traffic black-holes. This is the same failure as unsupervised PBR, from the same cause.
<br><br>Fix it with an IP SLA probe and <code>track</code>, then repeat and watch the backup install. Time the failover and tune the probe frequency. A static route without tracking is a promise nobody is checking.</div>

<p class="lab-step"><span class="n">6</span>Read a table cold</p>

Produce a table with all of `C`, `L`, `S`, `S*`, `D`, `D EX`, `O`, `O IA`, `O E2` and `B` present, then explain out loud, for each line: the source, the prefix length, the AD, the metric, the next hop, and **which rule put it there**.

<div class="lab-earned"><b>What you earned</b>
You can say which of the three rules decided any given line in a routing table, and you know two of them ran long before the packet arrived. You can demonstrate that longest match ignores administrative distance entirely, which means an unexplained forwarding path sends you looking for a more specific prefix rather than arguing about protocol preference. You know <code>show ip route &lt;host-address&gt;</code> answers the question directly instead of by inspection. And you have built a floating static that genuinely floats — and seen the far more common version that does not, because nothing was checking whether the primary still worked.</div>

</div>
</div>

---

## Test yourself

<div class="qz">
<p class="qz-q"><span class="qz-num">Q1</span>The table holds <code>10.1.1.0/24</code> via eBGP (AD 20) and <code>10.1.1.128/25</code> via a static route (AD 1). Which is used for <code>10.1.1.200</code>?</p>
<label class="qz-opt"><input type="radio" name="rq1"><span>The eBGP /24, because 20 is a better AD than… no, wait</span><em class="qz-fb qz-bad">AD is not consulted at forwarding time at all. Both routes are already installed.</em></label>
<label class="qz-opt"><input type="radio" name="rq1"><span>The static /25 — it is the longest match</span><em class="qz-fb qz-good">Correct. 25 bits beat 24, and the AD column plays no part. Reverse the ADs entirely and the answer is unchanged.</em></label>
<label class="qz-opt"><input type="radio" name="rq1"><span>Both, load balanced</span><em class="qz-fb qz-bad">Load balancing happens between equal-cost paths for the <em>same</em> prefix, not between different prefix lengths.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q2</span>When is administrative distance actually used?</p>
<label class="qz-opt"><input type="radio" name="rq2"><span>On every packet, after longest match</span><em class="qz-fb qz-bad">The FIB does not even store AD. It has nothing to consult.</em></label>
<label class="qz-opt"><input type="radio" name="rq2"><span>When deciding which of several sources offering the <em>same prefix and mask</em> gets installed</span><em class="qz-fb qz-good">Right — it is a control-plane tie-break between protocols for an identical prefix, and it happens once, when the table is built.</em></label>
<label class="qz-opt"><input type="radio" name="rq2"><span>To compare metrics between different protocols</span><em class="qz-fb qz-bad">Metrics from different protocols are not comparable — that is precisely why AD exists instead.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q3</span>What does <code>[110/20]</code> mean in a routing table line?</p>
<label class="qz-opt"><input type="radio" name="rq3"><span>Administrative distance 110, metric 20</span><em class="qz-fb qz-good">Correct — AD first, then the protocol's own metric. 110 identifies it as OSPF without reading the code.</em></label>
<label class="qz-opt"><input type="radio" name="rq3"><span>Metric 110, hop count 20</span><em class="qz-fb qz-bad">The first number is always the administrative distance.</em></label>
<label class="qz-opt"><input type="radio" name="rq3"><span>Uptime and interface number</span><em class="qz-fb qz-bad">Uptime appears later in the line, unbracketed.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q4</span>You configure a backup static route with AD 100 to back up an OSPF route. What happens?</p>
<label class="qz-opt"><input type="radio" name="rq4"><span>It floats correctly and only activates if OSPF fails</span><em class="qz-fb qz-bad">Compare the numbers: OSPF is 110 and 100 is lower.</em></label>
<label class="qz-opt"><input type="radio" name="rq4"><span>It immediately replaces the OSPF route, because 100 beats 110</span><em class="qz-fb qz-good">Correct — it is not floating, it is overriding. A floating static must have an AD <em>higher</em> than whatever it backs up; 130 would work here.</em></label>
<label class="qz-opt"><input type="radio" name="rq4"><span>It is rejected as a duplicate</span><em class="qz-fb qz-bad">Both routes coexist happily. Only one is installed.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q5</span>Why does every connected interface produce two routing table entries?</p>
<label class="qz-opt"><input type="radio" name="rq5"><span>A <code>C</code> route for the subnet and an <code>L</code> route for the router's own /32</span><em class="qz-fb qz-good">Correct. The local route arrived in IOS 15 so traffic addressed to the router itself matches by exact lookup rather than as a special case.</em></label>
<label class="qz-opt"><input type="radio" name="rq5"><span>One for IPv4 and one for IPv6</span><em class="qz-fb qz-bad">Those live in separate tables entirely — <code>show ipv6 route</code>.</em></label>
<label class="qz-opt"><input type="radio" name="rq5"><span>One is a backup in case the interface flaps</span><em class="qz-fb qz-bad">Both disappear together when the interface goes down.</em></label>
</div>

---

## References

- Cisco — [Route Selection in Cisco Routers](https://www.cisco.com/c/en/us/support/docs/ip/enhanced-interior-gateway-routing-protocol-eigrp/8651-21.html) — the authoritative statement that longest match is applied at forwarding time, after AD and metric have built the table.
- Cisco — [Understand Administrative Distance](https://www.cisco.com/c/en/us/support/docs/ip/border-gateway-protocol-bgp/15986-admin-distance.html) — the full default AD table.
- Cisco — [How to Read the Output of the show ip route Command](https://www.cisco.com/c/en/us/support/docs/ip/routing-information-protocol-rip/13716-38.html)

---

*Related: [Redistribution: seed metrics, loops and tags](/blog/route-redistribution-seed-metrics-loops-and-tags) · [Policy-based routing](/blog/policy-based-routing-pbr-explained) · [BGP best path selection](/blog/bgp-best-path-selection-the-tie-breakers-in-order).*

*Part of the [CCNA, ENCOR and ENARSI topic-by-topic study guide](/blog/ccna-ccnp-study-guide).*
