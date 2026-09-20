---
title: "Redistribution: Seed Metrics, Administrative Distance, and the Loop You Built Yourself"
excerpt: "Two routing protocols have no common language. Redistribution translates between them by throwing the metric away and inventing a new one, and then hands the result to a believability contest that knows nothing about whether the path is real. Do it at one point and it is easy. Do it at two — which is what redundancy means — and you have built a two-way door that will feed routes back into the domain they came from. Here is exactly how that fails, and the three fixes in the order you should reach for them."
date: "2026-09-22"
tags: ["Redistribution", "OSPF", "EIGRP", "Administrative Distance", "Route Tags", "Routing", "ENARSI", "CCNP"]
draft: false
---

> **Blueprint:** ENARSI 300-410 — 1.4 *Troubleshoot redistribution between any routing protocols or routing sources*. It leans on 1.1 *administrative distance*, 1.2 *route maps*, and 1.3 *loop prevention mechanisms (filtering, tagging, split horizon, route poisoning)* — all three are really one topic, and this is it.

## Cheat sheet

**Default seed metric when redistributing *into*:**

| Into | Default | Consequence |
|---|---|---|
| **OSPF** | **20** — except from **BGP**, which gets **1** | Works without a metric. Type **E2** by default |
| **IS-IS** | **0** | Works, but every route ties |
| **RIP** | **Infinity** | **Nothing is redistributed** until you set one |
| **EIGRP** | **Infinity** | **Nothing is redistributed** until you set one |
| **BGP** | The IGP metric, copied into **MED** | |

**Administrative distance — the believability contest:**

| | AD | | AD |
|---|---|---|---|
| Connected | **0** | RIP | **120** |
| Static | **1** | EGP | 140 |
| EIGRP summary | **5** | ODR | 160 |
| eBGP | **20** | **EIGRP external** | **170** |
| EIGRP internal | **90** | iBGP | **200** |
| IGRP | 100 | Unknown | **255** — never installed |
| OSPF | **110** | | |
| IS-IS | 115 | | |

**The one rule.** A redistribution loop becomes possible the moment a route that has travelled *out of* a domain and *back into* it arrives with a **better administrative distance than the native copy**. Everything else in this article is a consequence of that sentence.

---

## Why this is the hardest thing in the exam

Every other routing topic is one protocol being internally consistent. Redistribution is two protocols that **cannot compare notes**, joined by a router that has to invent an answer.

An OSPF cost of 20 and an EIGRP composite metric of 3072 are not different values of the same thing. They are different things. There is no conversion, no formula, no meaningful comparison — so redistribution does the only thing it can: it **discards the original metric entirely** and stamps on a new one that you chose, or that the protocol defaulted to.

<figure class="fig">
<svg viewBox="0 0 640 230" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A route crossing a redistribution boundary loses its original metric and is stamped with a new seed metric that carries no information about the real path">
  <style>
    .n{fill:#17171A}.nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}
    .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}
    .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}
    .m{font-family:ui-monospace,Menlo,monospace;font-size:11px;fill:#17171A}
    .eig{fill:rgba(75,123,236,.08);stroke:#4b7bec}.osp{fill:rgba(31,157,107,.08);stroke:#1f9d6b}
  </style>
  <rect class="eig" x="14" y="40" width="240" height="104" stroke-dasharray="4 3"/>
  <text class="k" x="26" y="60" fill="#2b5ab8">EIGRP</text>
  <rect class="osp" x="386" y="40" width="240" height="104" stroke-dasharray="4 3"/>
  <text class="k" x="398" y="60" fill="#0f6b47">OSPF</text>
  <rect class="n" x="40" y="80" width="96" height="32" rx="3"/><text class="nt" x="88" y="101" text-anchor="middle">10.1.1.0/24</text>
  <text class="m" x="88" y="130" text-anchor="middle" fill="#2b5ab8">metric 3072</text>
  <rect class="n" x="290" y="76" width="60" height="40" rx="3" fill="#D3002D"/><text class="nt" x="320" y="100" text-anchor="middle">R1</text>
  <text class="s" x="320" y="132" text-anchor="middle" fill="#B80027">redistribute</text>
  <line x1="136" y1="96" x2="290" y2="96" stroke="#8A8A93" stroke-width="1.5"/>
  <line x1="350" y1="96" x2="470" y2="96" stroke="#8A8A93" stroke-width="1.5"/>
  <circle r="4.5" fill="#4b7bec"><animateMotion dur="2.2s" repeatCount="indefinite" path="M 136 96 L 290 96"/></circle>
  <circle r="4.5" fill="#1f9d6b"><animateMotion dur="2.2s" begin="1.1s" repeatCount="indefinite" path="M 350 96 L 470 96"/></circle>
  <rect class="n" x="470" y="80" width="130" height="32" rx="3"/><text class="nt" x="535" y="101" text-anchor="middle">10.1.1.0/24 E2</text>
  <text class="m" x="535" y="130" text-anchor="middle" fill="#0f6b47">metric 20</text>
  <rect x="14" y="160" width="612" height="60" fill="#FFF1F3" stroke="#D3002D"/>
  <text class="k" x="26" y="182" fill="#B80027">3072 did not become 20. It was thrown away, and 20 was invented.</text>
  <text class="s" x="26" y="200">That number describes nothing about the real path — not its bandwidth, not its hop count, not its delay. Every</text>
  <text class="s" x="26" y="214">route redistributed at this point gets the same 20, whether it is one hop away or on the other side of the country.</text>
</svg>
<figcaption><b>Figure 1.</b> Redistribution is not translation. It is deletion followed by invention — and the number invented is identical for every route crossing that boundary unless you say otherwise.</figcaption>
</figure>

<div class="why">
<b>Why the flat metric matters more than it looks</b>
Inside OSPF, cost accumulates hop by hop, so a router can tell a near destination from a far one. A redistributed E2 route <b>does not accumulate</b> — the seed metric is carried unchanged across the whole OSPF domain. So every route that entered at R1 looks exactly as good as every other one, and if a second boundary router injects the same prefixes, OSPF cannot tell which boundary is closer to the real destination. It picks on a tie-break that has nothing to do with the topology. This is why <b>E2 is the default and E1 is usually the better answer</b>: E1 adds the internal OSPF cost to the seed, so a router four hops from the boundary correctly sees the route as worse than one that is next to it.
</div>

---

## The seed metric, and the two protocols that refuse without one

<div class="cmd">
<div class="cmd-line">router ospf 1
 <span class="t">redistribute eigrp</span> <span class="opt">100</span> <span class="t">subnets metric</span> <span class="opt">20</span> <span class="t">metric-type</span> <span class="opt">1</span>
!
router eigrp 100
 <span class="t">redistribute ospf</span> <span class="opt">1</span> <span class="t">metric</span> <span class="opt">1000000 100 255 1 1500</span></div>
<dl class="cmd-parts">
<div class="is-key"><dt>metric 20 <span class="opt">(into OSPF)</span></dt><dd>Optional — OSPF defaults to <b>20</b> for everything except BGP, which gets <b>1</b>. So redistribution into OSPF works without you saying anything, which is exactly why people forget the metric exists and end up with every external route tied.</dd></div>
<div class="is-key"><dt>metric-type 1</dt><dd><b>E1 adds the internal OSPF cost to the seed metric; E2 (the default) does not.</b> With E2 every router in the domain sees the same cost no matter how far it is from the boundary. Use <b>E1</b> whenever there is more than one redistribution point, because it is the only thing that lets OSPF prefer the nearer boundary.</dd></div>
<div><dt>subnets</dt><dd>On classic IOS this is <b>mandatory</b> — without it only classful networks are redistributed and your /24s silently vanish. On <b>IOS-XE it is applied by default and hidden from the running configuration</b>, so the command you typed disappears and the behaviour is still correct. Type it anyway: it is harmless, it is right on every platform, and it documents intent.</dd></div>
<div class="is-key"><dt>metric 1000000 100<br>255 1 1500 <span class="opt">(into EIGRP)</span></dt><dd>EIGRP's default seed metric is <b>infinity</b>, and a route with an infinite metric is unreachable — so <b>without this line nothing is redistributed at all</b>, silently, with no error. The five values are bandwidth (Kbps), delay (tens of microseconds), reliability, load and MTU. Only bandwidth and delay affect the classic metric; the other three are along for the ride.</dd></div>
<div><dt>default-metric<br><span class="opt">(the alternative)</span></dt><dd><code>default-metric 1000000 100 255 1 1500</code> under the routing process sets it once for every redistribute statement, instead of repeating it. Cleaner when you redistribute from several sources, and it removes the commonest cause of "redistribution is configured and nothing arrives".</dd></div>
</dl>
</div>

<div class="warn">
<b>The silent failure</b>
Redistributing into EIGRP or RIP without a metric produces <b>no error, no log message and no routes</b>. The configuration looks complete, <code>show run</code> shows the redistribute statement, and the far side simply never learns anything. If you take one operational habit from this article, make it this: after configuring redistribution, immediately check the <em>receiving</em> protocol's topology table, not the configuration.
</div>

---

## The failure, step by step

One redistribution point is straightforward. The trouble starts when you add a second one — which is the first thing anybody does, because one boundary router is a single point of failure.

<div class="walk">
<div class="walk-head">How mutual redistribution eats itself <span class="walk-hint">click a step</span></div>
<div class="walk-tabs">
  <input type="radio" name="rdw" id="rd1" checked><label for="rd1"><span class="step-n">1</span>One door</label>
  <input type="radio" name="rdw" id="rd2"><label for="rd2"><span class="step-n">2</span>Two doors</label>
  <input type="radio" name="rdw" id="rd3"><label for="rd3"><span class="step-n">3</span>Out</label>
  <input type="radio" name="rdw" id="rd4"><label for="rd4"><span class="step-n">4</span>Back in</label>
  <input type="radio" name="rdw" id="rd5"><label for="rd5"><span class="step-n">5</span>AD decides</label>
  <input type="radio" name="rdw" id="rd6"><label for="rd6"><span class="step-n">6</span>The loop</label>
  <input type="radio" name="rdw" id="rd7"><label for="rd7"><span class="step-n">7</span>Tagged</label>
</div>
<div class="walk-panels">
<div class="walk-panel">
<svg viewBox="0 0 640 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="With a single redistribution point routes can only travel one way across the boundary">
  <style>.n{fill:#17171A}.nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.a{fill:rgba(75,123,236,.08);stroke:#4b7bec}.b{fill:rgba(31,157,107,.08);stroke:#1f9d6b}.l{stroke:#8A8A93;stroke-width:1.5}</style>
  <rect class="a" x="14" y="40" width="230" height="110" stroke-dasharray="4 3"/><text class="k" x="26" y="60" fill="#2b5ab8">EIGRP 100</text>
  <rect class="b" x="396" y="40" width="230" height="110" stroke-dasharray="4 3"/><text class="k" x="408" y="60" fill="#0f6b47">OSPF 1</text>
  <rect class="n" x="40" y="86" width="104" height="30" rx="3"/><text class="nt" x="92" y="106" text-anchor="middle">10.1.1.0/24</text>
  <rect class="n" x="290" y="82" width="60" height="38" rx="3" fill="#D3002D"/><text class="nt" x="320" y="106" text-anchor="middle">R1</text>
  <rect class="n" x="480" y="86" width="86" height="30" rx="3"/><text class="nt" x="523" y="106" text-anchor="middle">R9</text>
  <line class="l" x1="144" y1="101" x2="290" y2="101"/>
  <line class="l" x1="350" y1="101" x2="480" y2="101"/>
  <circle r="4.5" fill="#4b7bec"><animateMotion dur="2s" repeatCount="indefinite" path="M 144 101 L 290 101 L 480 101"/></circle>
  <text class="k" x="320" y="176" text-anchor="middle" fill="#0f6b47">One boundary. A route can leave, and there is no way back in.</text>
  <text class="s" x="320" y="196" text-anchor="middle">Safe, simple, and a single point of failure — which is why almost nobody leaves it like this.</text>
</svg>
<p class="walk-say"><span class="walk-title">One redistribution point is easy</span>
With a single boundary router, a route originated in EIGRP is translated once into OSPF and can never return. There is no feedback path, so there is no loop — whatever you get wrong about metrics will be suboptimal, not circular.
<br><br>It is also a single point of failure for <b>every</b> prefix crossing between the two domains, which no serious design accepts. So you add a second one.</p>
</div>
<div class="walk-panel">
<svg viewBox="0 0 640 215" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Adding a second redistribution point creates a path for routes to travel back into the domain they came from">
  <style>.n{fill:#17171A}.nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.a{fill:rgba(75,123,236,.08);stroke:#4b7bec}.b{fill:rgba(31,157,107,.08);stroke:#1f9d6b}.l{stroke:#8A8A93;stroke-width:1.5}</style>
  <rect class="a" x="14" y="40" width="230" height="130" stroke-dasharray="4 3"/><text class="k" x="26" y="60" fill="#2b5ab8">EIGRP 100</text>
  <rect class="b" x="396" y="40" width="230" height="130" stroke-dasharray="4 3"/><text class="k" x="408" y="60" fill="#0f6b47">OSPF 1</text>
  <rect class="n" x="40" y="96" width="104" height="30" rx="3"/><text class="nt" x="92" y="116" text-anchor="middle">10.1.1.0/24</text>
  <rect class="n" x="290" y="70" width="60" height="34" rx="3" fill="#D3002D"/><text class="nt" x="320" y="92" text-anchor="middle">R1</text>
  <rect class="n" x="290" y="120" width="60" height="34" rx="3" fill="#D3002D"/><text class="nt" x="320" y="142" text-anchor="middle">R2</text>
  <line class="l" x1="144" y1="106" x2="290" y2="87"/>
  <line class="l" x1="144" y1="116" x2="290" y2="137"/>
  <line class="l" x1="350" y1="87" x2="480" y2="106"/>
  <line class="l" x1="350" y1="137" x2="480" y2="116"/>
  <rect class="n" x="480" y="96" width="86" height="30" rx="3"/><text class="nt" x="523" y="116" text-anchor="middle">R9</text>
  <text class="s" x="320" y="34" text-anchor="middle" fill="#B80027">both routers redistribute in BOTH directions</text>
  <text class="k" x="320" y="190" text-anchor="middle" fill="#B80027">Two boundaries mean a circuit, not a pair of doors.</text>
  <text class="s" x="320" y="208" text-anchor="middle">Anything that leaves through R1 can come back through R2. Nothing in either protocol knows that is what happened.</text>
</svg>
<p class="walk-say"><span class="walk-title">Two points is redundancy, and a circuit</span>
Both routers now redistribute EIGRP into OSPF and OSPF into EIGRP. That is the correct design for availability, and it creates the exact topology a routing loop needs: a path out of the domain and a path back in.
<br><br>The critical thing to understand is that <b>neither protocol can detect this</b>. Split horizon and route poisoning protect a protocol from its own routes; they know nothing about a route that left, changed identity, and returned wearing a different protocol's badge.</p>
</div>
<div class="walk-panel">
<svg viewBox="0 0 640 215" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The route leaves the EIGRP domain through R1 and becomes an OSPF external route">
  <style>.n{fill:#17171A}.nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.a{fill:rgba(75,123,236,.08);stroke:#4b7bec}.b{fill:rgba(31,157,107,.08);stroke:#1f9d6b}.l{stroke:#8A8A93;stroke-width:1.5}.hot{stroke:#4b7bec;stroke-width:3}</style>
  <rect class="a" x="14" y="40" width="230" height="130" stroke-dasharray="4 3"/><text class="k" x="26" y="60" fill="#2b5ab8">EIGRP 100</text>
  <rect class="b" x="396" y="40" width="230" height="130" stroke-dasharray="4 3"/><text class="k" x="408" y="60" fill="#0f6b47">OSPF 1</text>
  <rect class="n" x="40" y="96" width="104" height="30" rx="3"/><text class="nt" x="92" y="116" text-anchor="middle">10.1.1.0/24</text>
  <text class="s" x="92" y="146" text-anchor="middle" fill="#2b5ab8">EIGRP internal · AD 90</text>
  <rect class="n" x="290" y="70" width="60" height="34" rx="3" fill="#D3002D"/><text class="nt" x="320" y="92" text-anchor="middle">R1</text>
  <rect class="n" x="290" y="120" width="60" height="34" rx="3" opacity=".4"/><text class="nt" x="320" y="142" text-anchor="middle">R2</text>
  <path class="hot" d="M 144 106 L 290 87"/>
  <path class="hot" d="M 350 87 L 480 106"/>
  <circle r="5" fill="#4b7bec"><animateMotion dur="2s" repeatCount="indefinite" path="M 144 106 L 290 87 L 350 87 L 480 106"/></circle>
  <rect class="n" x="480" y="96" width="86" height="30" rx="3"/><text class="nt" x="523" y="116" text-anchor="middle">R9</text>
  <text class="s" x="523" y="146" text-anchor="middle" fill="#0f6b47">OSPF E2 · AD 110</text>
  <text class="k" x="320" y="192" text-anchor="middle">R1 translates: metric discarded, seed 20 applied, type E2, AD becomes 110.</text>
  <text class="s" x="320" y="208" text-anchor="middle">R9 now has a perfectly good OSPF route to a prefix that does not live in OSPF.</text>
</svg>
<p class="walk-say"><span class="walk-title">Out through R1</span>
R1 takes the EIGRP route out of its routing table, discards the composite metric, stamps on cost 20 and originates a <b>Type 5 AS-External LSA</b>. That LSA floods to every router in the OSPF domain, including R2.
<br><br>Everything so far is correct and intended. This is what you asked redistribution to do.</p>
</div>
<div class="walk-panel">
<svg viewBox="0 0 640 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="R2 receives the OSPF external route and redistributes it back into the EIGRP domain it originally came from">
  <style>.n{fill:#17171A}.nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.a{fill:rgba(75,123,236,.08);stroke:#4b7bec}.b{fill:rgba(31,157,107,.08);stroke:#1f9d6b}.hot{stroke:#4b7bec;stroke-width:3}.back{stroke:#D3002D;stroke-width:3}</style>
  <rect class="a" x="14" y="40" width="230" height="130" stroke-dasharray="4 3"/><text class="k" x="26" y="60" fill="#2b5ab8">EIGRP 100</text>
  <rect class="b" x="396" y="40" width="230" height="130" stroke-dasharray="4 3"/><text class="k" x="408" y="60" fill="#0f6b47">OSPF 1</text>
  <rect class="n" x="40" y="96" width="104" height="30" rx="3"/><text class="nt" x="92" y="116" text-anchor="middle">10.1.1.0/24</text>
  <rect class="n" x="290" y="70" width="60" height="34" rx="3" opacity=".4"/><text class="nt" x="320" y="92" text-anchor="middle">R1</text>
  <rect class="n" x="290" y="120" width="60" height="34" rx="3" fill="#D3002D"/><text class="nt" x="320" y="142" text-anchor="middle">R2</text>
  <rect class="n" x="480" y="96" width="86" height="30" rx="3"/><text class="nt" x="523" y="116" text-anchor="middle">R9</text>
  <path class="hot" d="M 480 106 L 350 137" opacity=".5"/>
  <path class="back" d="M 290 137 L 144 116"/>
  <circle r="5" fill="#D3002D"><animateMotion dur="2s" repeatCount="indefinite" path="M 480 106 L 350 137 L 290 137 L 144 116"/></circle>
  <text class="s" x="200" y="164" text-anchor="middle" fill="#B80027">re-enters as EIGRP external · AD 170</text>
  <text class="k" x="320" y="192" text-anchor="middle" fill="#B80027">R2 has no idea this prefix started life in EIGRP.</text>
  <text class="s" x="320" y="210" text-anchor="middle">It sees a valid OSPF route in its table and does exactly what you told it: redistribute OSPF into EIGRP.</text>
</svg>
<p class="walk-say"><span class="walk-title">And back in through R2</span>
R2 is doing nothing wrong. It has an OSPF route to 10.1.1.0/24 in its routing table, and its configuration says "redistribute OSPF into EIGRP". So it does — and the prefix re-enters the domain it came from, now as an <b>EIGRP external</b> route with a brand-new metric and <b>administrative distance 170</b>.
<br><br>This is the moment the circuit closes. Whether it becomes a loop or merely an embarrassment is decided entirely by the next step.</p>
</div>
<div class="walk-panel">
<svg viewBox="0 0 640 230" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Administrative distance decides whether the returning route beats the original one">
  <style>.s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.m{font-family:ui-monospace,Menlo,monospace;font-size:11.5px;fill:#17171A}.hdr{font-family:ui-sans-serif,system-ui;font-size:10px;font-weight:700;fill:#8A8A93;letter-spacing:.06em}.ok{fill:rgba(31,157,107,.10);stroke:#1f9d6b}.no{fill:#FFF1F3;stroke:#D3002D}</style>
  <text class="hdr" x="14" y="20">EIGRP &#8596; OSPF — PROTECTED BY ACCIDENT</text>
  <rect class="ok" x="14" y="30" width="300" height="76"/>
  <text class="m" x="26" y="52">native:    EIGRP internal   AD  90</text>
  <text class="m" x="26" y="72">returning: EIGRP external   AD 170</text>
  <text class="k" x="26" y="96" fill="#0f6b47">90 wins. The native route survives.</text>
  <text class="hdr" x="336" y="20">RIP &#8596; OSPF — NOT PROTECTED</text>
  <rect class="no" x="336" y="30" width="290" height="76"/>
  <text class="m" x="348" y="52">native:    RIP             AD 120</text>
  <text class="m" x="348" y="72">returning: OSPF E2         AD 110</text>
  <text class="k" x="348" y="96" fill="#B80027">110 wins. The fake route replaces the real one.</text>
  <text class="k" x="14" y="136">This is the whole mechanism, and it is why EIGRP external has an AD of 170 at all.</text>
  <text class="s" x="14" y="158">Cisco set it deliberately above OSPF's 110 and RIP's 120, so that a route which has been out through another</text>
  <text class="s" x="14" y="174">protocol and back always loses to a native EIGRP route. It is a safety net, not a law of nature.</text>
  <text class="s" x="14" y="200" fill="#B80027">Change an AD by hand — or use a protocol pairing without that gap — and the net is gone.</text>
  <text class="s" x="14" y="220">Two OSPF processes redistributing into each other are both AD 110, and have no protection at all.</text>
</svg>
<p class="walk-say"><span class="walk-title">Administrative distance decides, and it is not clever</span>
AD is a <b>preference between sources</b>, not a judgement about whether a route is real. A router with two copies of 10.1.1.0/24 installs the one with the lower AD and never asks which one describes an actual path.
<br><br>With EIGRP and OSPF you are usually saved by the external AD of 170 — which exists precisely for this. With <b>RIP and OSPF</b> you are not: an OSPF external at 110 beats a native RIP route at 120, so the returning copy wins and a router inside the RIP domain starts forwarding toward OSPF to reach a prefix that is sitting next to it.</p>
</div>
<div class="walk-panel">
<svg viewBox="0 0 640 252" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="When the returning route wins the traffic circulates between the two boundary routers">
  <style>.n{fill:#17171A}.nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.a{fill:rgba(75,123,236,.08);stroke:#4b7bec}.b{fill:rgba(31,157,107,.08);stroke:#1f9d6b}.loop{stroke:#D3002D;stroke-width:3;fill:none}</style>
  <rect class="a" x="14" y="40" width="230" height="130" stroke-dasharray="4 3"/><text class="k" x="26" y="60" fill="#2b5ab8">domain A</text>
  <rect class="b" x="396" y="40" width="230" height="130" stroke-dasharray="4 3"/><text class="k" x="408" y="60" fill="#0f6b47">domain B</text>
  <rect class="n" x="40" y="96" width="104" height="30" rx="3" opacity=".4"/><text class="nt" x="92" y="116" text-anchor="middle">10.1.1.0/24</text>
  <text class="s" x="92" y="146" text-anchor="middle" fill="#D3002D">the real one — now ignored</text>
  <rect class="n" x="290" y="70" width="60" height="34" rx="3" fill="#D3002D"/><text class="nt" x="320" y="92" text-anchor="middle">R1</text>
  <rect class="n" x="290" y="120" width="60" height="34" rx="3" fill="#D3002D"/><text class="nt" x="320" y="142" text-anchor="middle">R2</text>
  <rect class="n" x="480" y="96" width="86" height="30" rx="3"/><text class="nt" x="523" y="116" text-anchor="middle">R9</text>
  <path class="loop" d="M 350 87 L 476 104 L 476 118 L 350 137 C 330 190 268 198 244 164 C 222 132 246 90 290 87"/>
  <circle r="5" fill="#D3002D"><animateMotion dur="2.4s" repeatCount="indefinite" path="M 350 87 L 476 104 L 476 118 L 350 137 C 330 190 268 198 244 164 C 222 132 246 90 290 87"/></circle>
  <text class="k" x="330" y="222" text-anchor="middle" fill="#B80027">R1 points at the OSPF domain. R2 points back at R1. The packet never arrives.</text>
  <text class="s" x="330" y="242" text-anchor="middle">IP's TTL eventually kills each packet — so this does not melt the network like a Layer 2 loop, it just black-holes a prefix.</text>
</svg>
<p class="walk-say"><span class="walk-title">The loop, and why it is quiet</span>
Once the returning copy wins, a boundary router forwards traffic for the prefix <em>away</em> from where it actually lives, toward the router that taught it the fake route — which forwards it back. The packet circulates until the <b>TTL expires</b>.
<br><br>That TTL is the reason this fault is so much less dramatic than a Layer 2 loop and so much harder to notice. Nothing melts. CPU does not spike. You get <b>one unreachable prefix</b>, a <code>traceroute</code> that bounces between two routers until it gives up, and a ticket that says "the finance subnet is down" with no alarms anywhere.</p>
</div>
<div class="walk-panel">
<svg viewBox="0 0 640 225" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Tagging routes on the way out and refusing tagged routes on the way back closes the loop">
  <style>.n{fill:#17171A}.nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.a{fill:rgba(75,123,236,.08);stroke:#4b7bec}.b{fill:rgba(31,157,107,.08);stroke:#1f9d6b}.ok{stroke:#1f9d6b;stroke-width:3}.x{stroke:#D3002D;stroke-width:3}</style>
  <rect class="a" x="14" y="40" width="230" height="130" stroke-dasharray="4 3"/><text class="k" x="26" y="60" fill="#2b5ab8">EIGRP 100</text>
  <rect class="b" x="396" y="40" width="230" height="130" stroke-dasharray="4 3"/><text class="k" x="408" y="60" fill="#0f6b47">OSPF 1</text>
  <rect class="n" x="40" y="96" width="104" height="30" rx="3"/><text class="nt" x="92" y="116" text-anchor="middle">10.1.1.0/24</text>
  <rect class="n" x="290" y="70" width="60" height="34" rx="3" fill="#D3002D"/><text class="nt" x="320" y="92" text-anchor="middle">R1</text>
  <rect class="n" x="290" y="120" width="60" height="34" rx="3" fill="#D3002D"/><text class="nt" x="320" y="142" text-anchor="middle">R2</text>
  <rect class="n" x="480" y="96" width="86" height="30" rx="3"/><text class="nt" x="523" y="116" text-anchor="middle">R9</text>
  <path class="ok" d="M 144 106 L 290 87 L 350 87 L 480 106"/>
  <circle r="4.5" fill="#1f9d6b"><animateMotion dur="2s" repeatCount="indefinite" path="M 144 106 L 290 87 L 350 87 L 480 106"/></circle>
  <path class="x" d="M 350 137 L 290 137" stroke-dasharray="5 4"/>
  <line x1="326" y1="128" x2="344" y2="146" stroke="#D3002D" stroke-width="2.5"/>
  <line x1="344" y1="128" x2="326" y2="146" stroke="#D3002D" stroke-width="2.5"/>
  <text class="s" x="200" y="82" fill="#0f6b47">out: set tag 90</text>
  <text class="s" x="404" y="168" fill="#B80027">back: match tag 90 &#8594; deny</text>
  <text class="k" x="320" y="196" text-anchor="middle" fill="#0f6b47">The route carries a marker saying where it came from, and the other door refuses it.</text>
  <text class="s" x="320" y="214" text-anchor="middle">Everything else still crosses freely. Add a prefix tomorrow and you change nothing.</text>
</svg>
<p class="walk-say"><span class="walk-title">The fix that scales</span>
On the way out, stamp every route with a <b>tag</b> naming the domain it came from. On the way back, refuse anything carrying that tag. The mechanism is a 32-bit field that travels with the route — it is a real field in the OSPF Type 5 LSA, visible in the capture below — and both boundary routers get the identical configuration.
<br><br>Crucially it is <b>prefix-independent</b>. A filter listing networks has to be edited every time somebody adds a subnet, and will eventually be forgotten. A tag policy describes the <em>rule</em> rather than the data, so it keeps working.</p>
</div>
</div>
</div>

### The tag is a real field, and you can see it

<div class="cap">
<div class="cap-head">Capture · OSPF Type 5 LSA carrying a redistribution tag <span class="cap-filter">ospf.lsa.type == 5</span></div>
<div class="cap-tree"><pre>&#9662; Open Shortest Path First
  &#9662; <span class="f">LSA-type 5 (AS-External-LSA)</span>, len 36
      <span class="f">LS Age:</span> <span class="v">412 seconds</span>
      <span class="f">Options:</span> <span class="v">0x22 (DC, E)</span>
      <span class="f">Link-State Advertisement Type:</span> <span class="v">AS-External-LSA (5)</span>
      <span class="f">Link State ID:</span> <span class="v">10.1.1.0</span>              &#8592; the prefix
      <span class="f">Advertising Router:</span> <span class="v">10.255.255.1</span>       &#8592; R1, the router that redistributed it
      <span class="f">Sequence Number:</span> <span class="v">0x80000004</span>
      <span class="f">Netmask:</span> <span class="v">255.255.255.0</span>
      <span class="f">1... ....</span> = <span class="v"><mark>External Type: Type 2 (metric does not accumulate)</mark></span>
      <span class="f">Metric:</span> <span class="v"><mark>20</mark></span>                            &#8592; the seed metric, invented at the boundary
      <span class="f">Forwarding address:</span> <span class="v">0.0.0.0</span>
      <span class="f">External Route Tag:</span> <span class="v"><mark>90</mark></span>               &#8592; <b>the loop-prevention marker</b></pre></div>
<div class="cap-hex"><pre>0000  01 9c <mark>22</mark> <mark>05</mark> 0a 01 01 00  0a ff ff 01 80 00 00 04   ..".............
0010  24 06 00 24 ff ff ff 00  <mark>80</mark> <mark>00 00 14</mark> 00 00 00 00   $..$............
0020  00 00 <mark>00 5a</mark>                                          ...Z</pre></div>
<div class="cap-note"><b>Four bytes do all the work.</b> <code>05</code> — LSA type 5, an external route. <code>80</code> — the <b>E-bit</b>, set, meaning metric type E2; clear that single bit and the same LSA becomes E1 and starts accumulating internal cost. <code>00 00 14</code> — the metric, 20, the seed value R1 invented. And <code>00 00 00 5a</code> — <b>the External Route Tag, 90</b>, which is the entire loop-prevention mechanism sitting in the packet where anyone can read it.
<br><br>The tag has <b>no meaning to OSPF at all</b>. OSPF carries it, floods it, and never acts on it. It exists purely so that a router on the far side of the domain can make a decision with it — which is why the convention of tagging with the source protocol's AD (90 for EIGRP, 110 for OSPF, 120 for RIP) is so useful: the number documents itself.</div>
</div>

---

## The three fixes, in the order you should reach for them

<div class="cmd">
<div class="cmd-line"><span class="opt">! 1. TAGS — the right answer</span>
route-map EIGRP-TO-OSPF deny 10
 <span class="t">match tag</span> <span class="opt">110</span>
route-map EIGRP-TO-OSPF permit 20
 <span class="t">set tag</span> <span class="opt">90</span>
!
route-map OSPF-TO-EIGRP deny 10
 <span class="t">match tag</span> <span class="opt">90</span>
route-map OSPF-TO-EIGRP permit 20
 <span class="t">set tag</span> <span class="opt">110</span>
!
router ospf 1
 <span class="t">redistribute eigrp</span> <span class="opt">100</span> <span class="t">subnets metric-type</span> <span class="opt">1</span> <span class="t">route-map</span> <span class="opt">EIGRP-TO-OSPF</span>
router eigrp 100
 <span class="t">redistribute ospf</span> <span class="opt">1</span> <span class="t">metric</span> <span class="opt">1000000 100 255 1 1500</span> <span class="t">route-map</span> <span class="opt">OSPF-TO-EIGRP</span></div>
<dl class="cmd-parts">
<div class="is-key"><dt>deny 10 / match tag</dt><dd>The deny clause comes <b>first</b> and drops anything already carrying the other domain's tag. Order matters: a route-map is evaluated top down and stops at the first match, exactly like an ACL.</dd></div>
<div class="is-key"><dt>permit 20 / set tag</dt><dd>Everything that survived gets stamped on its way out. A <code>permit</code> clause with no <code>match</code> matches <b>everything</b> — which is what you want here, and a trap everywhere else.</dd></div>
<div><dt>(the tag values)</dt><dd>Any 32-bit number works. Using each protocol's <b>administrative distance</b> — 90 for EIGRP, 110 for OSPF, 120 for RIP — makes the configuration self-documenting, and anyone reading <code>show ip ospf database external</code> can tell instantly where a route entered.</dd></div>
<div class="is-key"><dt>identical on both<br>boundary routers</dt><dd>This is the part people get wrong. The configuration must be <b>the same on R1 and R2</b> — a tag applied by one and not honoured by the other protects nothing. Build it as a template and apply it to both in the same change.</dd></div>
<div><dt><span class="opt">implicit deny</span></dt><dd>A route-map used by <code>redistribute</code> has an implicit <b>deny any</b> at the end, so forgetting the <code>permit 20</code> clause redistributes <b>nothing at all</b> — silently. If routes vanish the moment you attach a route-map, this is why.</dd></div>
</dl>
</div>

<div class="cmd">
<div class="cmd-line"><span class="opt">! 2. ADMINISTRATIVE DISTANCE — a blunt instrument</span>
router ospf 1
 <span class="t">distance ospf external</span> <span class="opt">200</span>
!
router eigrp 100
 <span class="t">distance eigrp</span> <span class="opt">90 200</span></div>
<dl class="cmd-parts">
<div><dt>distance ospf<br>external 200</dt><dd>Makes OSPF external routes <b>less believable than RIP (120) and EIGRP external (170)</b>, so a returning route always loses to the native one. It fixes the RIP/OSPF case cleanly.</dd></div>
<div><dt>distance eigrp<br>90 200</dt><dd>Internal 90, external 200. Same idea from the other side.</dd></div>
<div class="is-key"><dt><span class="opt">why it is second choice</span></dt><dd>AD changes are <b>global to the protocol</b> — they affect every external route from every source, not just the ones coming back through the other boundary. They also fix the symptom rather than the cause: the bogus route is still being advertised, still consuming database space and still present in every topology table, just losing the contest. And the next engineer will not know why that number is 200. <b>Use AD when you need a fast fix during an incident; go back and do it with tags.</b></dd></div>
</dl>
</div>

<div class="cmd">
<div class="cmd-line"><span class="opt">! 3. PREFIX FILTERING — correct, and it will rot</span>
ip prefix-list NO-FEEDBACK seq 5 deny 10.1.0.0/16 le 32
ip prefix-list NO-FEEDBACK seq 10 permit 0.0.0.0/0 le 32
!
route-map OSPF-TO-EIGRP permit 10
 <span class="t">match ip address prefix-list</span> <span class="opt">NO-FEEDBACK</span></div>
<dl class="cmd-parts">
<div><dt>the idea</dt><dd>List the prefixes that belong to the EIGRP domain and refuse to redistribute them back into it. Precise, easy to reason about, and it works on the day you write it.</dd></div>
<div class="is-key"><dt>why it is third</dt><dd>It encodes <b>data</b> rather than a <b>rule</b>. Somebody adds 10.9.0.0/16 to the EIGRP domain next year, nobody updates the prefix list on both boundary routers, and the loop comes back — for that prefix only, months after the change that caused it. A tag policy would have covered it automatically.
<br><br>It is still the right tool when you need to be surgical: one prefix behaving badly, or a summarisation boundary where you genuinely do want to name the ranges.</dd></div>
</dl>
</div>

---

## Reading it on a live router

<div class="term">
<div class="term-bar"><span class="term-dots"><i></i><i></i><i></i></span>R2 — the three commands that find a redistribution fault</div>
<pre><span class="p">R2#</span> <span class="c">show ip route 10.1.1.0</span>
Routing entry for 10.1.1.0/24
  Known via "<span class="y">eigrp 100</span>", distance <span class="y">170</span>, metric 2172416, type <span class="y">external</span>
  Redistributing via eigrp 100, ospf 1
  <span class="r">Advertised by ospf 1 metric-type 1 route-map EIGRP-TO-OSPF</span>
  Last update from 10.0.12.1 on GigabitEthernet0/1, 00:02:41 ago

<span class="o">! "type external" + "distance 170" on a prefix you believe is native EIGRP</span>
<span class="o">! means it has been round the loop. A native route would say distance 90, internal.</span>

<span class="p">R2#</span> <span class="c">show ip ospf database external 10.1.1.0</span>
  LS age: 412
  Link State ID: 10.1.1.0 (External Network Number)
  Advertising Router: <span class="y">10.255.255.1</span>          <span class="o">&lt;- R1 injected it. Not R2.</span>
  Network Mask: /24
        Metric Type: 2 (Larger than any link state path)
        Metric: 20
        Forward Address: 0.0.0.0
        <span class="g">External Route Tag: 90</span>               <span class="o">&lt;- tagged, so R2 must refuse it</span>

<span class="p">R2#</span> <span class="c">show route-map OSPF-TO-EIGRP</span>
route-map OSPF-TO-EIGRP, deny, sequence 10
  Match clauses:
    tag 90
  <span class="g">Policy routing matches: 0 packets</span>
  Routing matches: <span class="g">14 routes</span>              <span class="o">&lt;- 14 routes refused. The filter is working.</span>
route-map OSPF-TO-EIGRP, permit, sequence 20
  Set clauses:
    tag 110
  Routing matches: 31 routes<span class="cur"></span></pre>
</div>
<p class="term-cap"><b><code>show route-map</code> is the command nobody runs and everybody needs.</b> The <code>Routing matches</code> counter tells you whether your clauses are actually being hit. A deny clause with <b>zero</b> matches means either the tags are not being set upstream or the route-map is not attached to the redistribute statement — and those two look identical from every other command on the router.</p>

<div class="term">
<div class="term-bar"><span class="term-dots"><i></i><i></i><i></i></span>R5, inside the EIGRP domain — what the loop looks like from a victim</div>
<pre><span class="p">R5#</span> <span class="c">traceroute 10.1.1.50</span>
Type escape sequence to abort.
  1 10.0.25.2 1 msec 0 msec 1 msec        <span class="o">&lt;- R2</span>
  2 <span class="r">10.0.12.1</span> 1 msec 1 msec 0 msec        <span class="o">&lt;- R1</span>
  3 <span class="r">10.0.12.2</span> 2 msec 1 msec 2 msec        <span class="o">&lt;- back to R2</span>
  4 <span class="r">10.0.12.1</span> 1 msec 2 msec 1 msec        <span class="o">&lt;- and round again</span>
  5 <span class="r">10.0.12.2</span> 2 msec 1 msec 2 msec
  ...
 30 <span class="r">10.0.12.1</span> 2 msec 1 msec 2 msec

<span class="o">! Two addresses alternating all the way to 30 hops IS the signature.</span>
<span class="o">! Nothing is down, no interface has errors, and CPU is normal.</span><span class="cur"></span></pre>
</div>
<p class="term-cap"><b>Two addresses alternating in a traceroute is a routing loop, every time.</b> It is worth recognising on sight because nothing else on the network will tell you. There is no alarm for this — the links are up, the protocols are adjacent, and exactly one prefix is unreachable.</p>

---

## What goes wrong

**Redistribution is configured and no routes appear.** Into EIGRP or RIP without a metric. The default is infinity and infinity is unreachable. Check the *receiving* protocol's topology table, not the configuration.

**A route-map was attached and everything stopped.** The implicit `deny any` at the end. You need a final `permit` clause.

**Only classful networks crossed.** Missing `subnets` on classic IOS. On IOS-XE it is applied by default and hidden from `show run`, so the same configuration behaves differently on two platforms.

**One prefix is unreachable and traceroute bounces between two routers.** A feedback loop. Check whether the prefix shows as *external* in the protocol it should be native to.

**Everything works until a boundary router reloads.** Both boundaries were redistributing, but the loop was masked by which route happened to be installed first. Reboot changes the order and the fault appears. Redistribution faults that are order-dependent are almost always missing tags.

**Suboptimal paths but no loop.** E2 metrics. Every external route has the same cost everywhere, so OSPF cannot tell which boundary is nearer. Use `metric-type 1`.

**A summary route is preferred over a more specific one.** EIGRP summary AD is **5** — lower than almost everything. A summary you created for tidiness can beat a real route learned from elsewhere.

---

<div class="lab">
<div class="lab-head">Lab — build the loop deliberately, then close it three different ways</div>
<div class="lab-body">

<div class="lab-target"><b>Target</b>
Mutually redistribute OSPF and EIGRP at two points and watch the feedback happen in the routing table; prove with a traceroute that a prefix is looping while every link and adjacency is healthy; then fix it three ways — tags, administrative distance and prefix filters — and be able to argue for the first one. Along the way, produce the silent failure that comes from omitting a seed metric, and measure what <code>metric-type 1</code> buys you.</div>

**Topology.** An EIGRP 100 domain on the left (R5 and a loopback 10.1.1.0/24), an OSPF 1 domain on the right (R9 and a loopback 10.2.2.0/24), and **two** routers R1 and R2 that sit in both and will redistribute in both directions. Make the R1 path and the R2 path genuinely different lengths so suboptimal routing is visible.

<p class="lab-step"><span class="n">1</span>Produce the silent failure first</p>

Configure redistribution in both directions on R1 only, with **no metric anywhere**:

```cisco
router ospf 1
 redistribute eigrp 100 subnets
router eigrp 100
 redistribute ospf 1
```

```cisco
R9# show ip route 10.1.1.0
R5# show ip route 10.2.2.0
```

<div class="lab-watch"><b>Things to notice</b>
One direction works and the other does not. OSPF's default seed metric of 20 carries EIGRP routes into OSPF happily; EIGRP's default of infinity means <b>nothing goes the other way</b> — with no error, no log, and a configuration that looks complete. Check <code>show ip eigrp topology</code> on R1 and confirm the OSPF prefixes are simply absent.
<br><br>Then add <code>default-metric 1000000 100 255 1 1500</code> under EIGRP and watch them all appear at once. Remember this asymmetry: it is why "redistribution into EIGRP" and "redistribution into OSPF" fail in completely different ways.</div>

<p class="lab-step"><span class="n">2</span>Add the second boundary and find the feedback</p>

Configure the same mutual redistribution on **R2**, with no tags and no filtering.

```cisco
R2# show ip route 10.1.1.0
R1# show ip route 10.2.2.0
R5# show ip route 10.1.1.0
```

<div class="lab-watch"><b>Things to notice</b>
Look for the word <b>external</b> on a prefix that should be native. With EIGRP and OSPF you will most likely see suboptimal routing rather than an outright loop — EIGRP external AD 170 loses to internal 90, and that gap is doing the protecting for you. <b>Write down that you were saved by a default</b>, because the next step removes it.</div>

<p class="lab-step"><span class="n">3</span>Take away the safety net and watch it loop</p>

On R1 and R2, make external EIGRP more believable than internal:

```cisco
router eigrp 100
 distance eigrp 90 80
```

That is deliberately wrong — external 80 now beats internal 90.

```cisco
R5# traceroute 10.1.1.50
R5# show ip route 10.1.1.0
```

<div class="lab-watch"><b>Things to notice</b>
Now you have the real thing: a traceroute alternating between two addresses until it gives up at 30 hops, on a network where <b>every link is up, every adjacency is full, and CPU is idle</b>. Confirm that no monitoring signal exists for this — check interface counters and logs and find nothing.
<br><br>This is the single most valuable five minutes in the lab. The fault is invisible to everything except a traceroute to the specific prefix, and now you know its signature on sight.</div>

<p class="lab-step"><span class="n">4</span>Fix it with tags, on both routers</p>

Apply the tag policy from the article to **R1 and R2 together**, then:

```cisco
R2# show route-map OSPF-TO-EIGRP
R2# show ip ospf database external 10.1.1.0
```

<div class="lab-issues"><b>Possible issues</b>
<ul>
<li><b>Everything stops being redistributed</b> — you omitted the final <code>permit</code> clause and hit the implicit deny. The route count in <code>show route-map</code> will be zero on the permit sequence.</li>
<li><b>The deny clause shows zero matches</b> — the other router is not setting the tag. Tags are set on the way <em>out</em>; check the other boundary's route-map, not this one's.</li>
<li><b>The loop persists</b> — the old routes are still installed. <code>clear ip route *</code> and <code>clear ip eigrp neighbors</code>, then look again.</li>
<li><b>Tags appear on some routes only</b> — routes that were already in the database keep their old tag until the LSA is refreshed. Wait for the refresh or clear the process.</li>
</ul>
Confirm in <code>show ip ospf database external</code> that the tag is genuinely in the LSA, then capture one and find the last four bytes.</div>

<p class="lab-step"><span class="n">5</span>Fix the same fault the other two ways, and compare</p>

Remove the tags. Fix it again with `distance`, then again with a prefix-list.

<div class="lab-watch"><b>Things to notice</b>
All three stop the loop. Now compare what each one costs you. With <b>AD</b>: run <code>show ip ospf database external</code> and confirm the bogus routes are <b>still there</b>, still flooding, just losing — you fixed the symptom. With the <b>prefix-list</b>: add a new subnet to the EIGRP domain without touching the filter, and watch the loop come back for that prefix alone. With <b>tags</b>: add the same subnet and watch nothing happen.
<br><br>That last comparison is the whole argument, and you now have it as an observation rather than an opinion.</div>

<p class="lab-step"><span class="n">6</span>Measure what metric-type 1 buys</p>

With tags in place and both boundaries working, from R9 in the OSPF domain:

```cisco
R9# show ip route 10.1.1.0
```

Note which boundary router it points at. Then change both redistribute statements to `metric-type 1` and look again.

<div class="lab-watch"><b>Things to notice</b>
With <b>E2</b> the cost is 20 everywhere, so R9 cannot tell R1 from R2 and picks on a tie-break unrelated to the topology — which means half your traffic may take the long way round for no reason. With <b>E1</b> the internal OSPF cost is added, so R9 correctly prefers the nearer boundary.
<br><br>Make the two paths deliberately unequal and confirm the chosen exit changes when you switch metric types. This is the cheapest improvement in the whole topic and it is one keyword.</div>

<p class="lab-step"><span class="n">7</span>Break it the way it breaks in production</p>

With everything working and tagged, remove the route-map from **R2 only** — as if somebody rebuilt one router from an older template — and reload R1.

<div class="lab-watch"><b>Things to notice</b>
It may keep working for a while, because which route wins can depend on which arrived first. Then R1 reloads, the order changes, and the fault appears — <b>hours or days after the change that caused it</b>, on a router nobody touched.
<br><br>That delay is why redistribution faults get blamed on the wrong change. The habit that prevents it: treat the two boundary routers as <b>one configuration object</b> that is always deployed together, and add <code>show route-map</code> counters to whatever you check after a change.</div>

<div class="lab-earned"><b>What you earned</b>
You can spot a redistribution loop from a traceroute in five seconds, and you know that nothing else on the network will tell you about it. You know that EIGRP and OSPF are protected by an AD gap that you can accidentally remove, and that RIP and OSPF never had that protection. You have produced the silent no-metric failure so you will check the receiving topology table rather than the configuration. And you have measured, rather than argued, why tags beat administrative distance and prefix filters — because you added a subnet and watched two of the three fixes fail.</div>

</div>
</div>

---

## Test yourself

<div class="qz">
<p class="qz-q"><span class="qz-num">Q1</span>You redistribute OSPF into EIGRP with no <code>metric</code> and no <code>default-metric</code>. What happens?</p>
<label class="qz-opt"><input type="radio" name="rd1"><span>Routes are redistributed with a default metric of 20</span><em class="qz-fb qz-bad">That is OSPF's default, in the other direction. EIGRP does not have one.</em></label>
<label class="qz-opt"><input type="radio" name="rd1"><span>Nothing is redistributed, with no error message</span><em class="qz-fb qz-good">Correct. EIGRP's default seed metric is infinity, and an infinite metric is unreachable. The configuration looks complete and no routes appear — which is why you check the receiving topology table, not <code>show run</code>.</em></label>
<label class="qz-opt"><input type="radio" name="rd1"><span>The command is rejected</span><em class="qz-fb qz-bad">It is accepted without complaint. That is precisely the problem.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q2</span>Why does EIGRP give external routes an administrative distance of 170?</p>
<label class="qz-opt"><input type="radio" name="rd2"><span>So a route that has been through another protocol and back always loses to a native EIGRP route</span><em class="qz-fb qz-good">Exactly — 170 sits above OSPF's 110 and RIP's 120 deliberately, so a returning copy cannot displace the original. It is a safety net against mutual redistribution, and you can remove it by hand.</em></label>
<label class="qz-opt"><input type="radio" name="rd2"><span>Because external routes are less accurate</span><em class="qz-fb qz-bad">AD is a statement about source preference, not accuracy. The number was chosen for a specific structural reason.</em></label>
<label class="qz-opt"><input type="radio" name="rd2"><span>To make EIGRP lose to OSPF generally</span><em class="qz-fb qz-bad">Internal EIGRP is 90 and beats OSPF comfortably. Only external EIGRP is demoted.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q3</span>A prefix is unreachable, traceroute alternates between two router addresses to 30 hops, all links are up and CPU is normal. What is it?</p>
<label class="qz-opt"><input type="radio" name="rd3"><span>A routing loop, almost certainly from redistribution feedback</span><em class="qz-fb qz-good">Right — two addresses alternating is the signature. IP's TTL keeps it quiet, so there is no alarm and no symptom other than one dead prefix.</em></label>
<label class="qz-opt"><input type="radio" name="rd3"><span>An MTU problem</span><em class="qz-fb qz-bad">MTU failures let small packets through and break large ones; they do not make traceroute oscillate.</em></label>
<label class="qz-opt"><input type="radio" name="rd3"><span>A duplex mismatch</span><em class="qz-fb qz-bad">That would show on interface counters, and this fault shows nothing anywhere.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q4</span>Why are route tags preferred over a prefix-list for loop prevention?</p>
<label class="qz-opt"><input type="radio" name="rd4"><span>They are faster to process</span><em class="qz-fb qz-bad">Performance is not the issue at these scales.</em></label>
<label class="qz-opt"><input type="radio" name="rd4"><span>A tag encodes the rule, so it keeps working when somebody adds a subnet</span><em class="qz-fb qz-good">Correct. A prefix-list encodes data and has to be maintained on both boundary routers for ever; a tag says "anything that came from over there", which covers prefixes that do not exist yet.</em></label>
<label class="qz-opt"><input type="radio" name="rd4"><span>Prefix-lists cannot be used in redistribution</span><em class="qz-fb qz-bad">They can, via a route-map, and they are the right tool when you need to be surgical.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q5</span>With two redistribution points into OSPF, why does <code>metric-type 1</code> usually beat the default?</p>
<label class="qz-opt"><input type="radio" name="rd5"><span>E1 adds the internal OSPF cost, so routers can tell which boundary is nearer</span><em class="qz-fb qz-good">Correct. E2 carries the seed metric unchanged across the whole domain, so every boundary looks equally good and the choice falls to a tie-break unrelated to topology.</em></label>
<label class="qz-opt"><input type="radio" name="rd5"><span>E1 routes have a lower administrative distance</span><em class="qz-fb qz-bad">Both are OSPF external at AD 110. Only the metric behaviour differs.</em></label>
<label class="qz-opt"><input type="radio" name="rd5"><span>E2 routes are not flooded beyond the local area</span><em class="qz-fb qz-bad">Type 5 LSAs flood throughout the domain — that is what stub areas exist to stop.</em></label>
</div>

---

## References

- Cisco — [Configure Routing Protocol Redistribution](https://www.cisco.com/c/en/us/support/docs/ip/enhanced-interior-gateway-routing-protocol-eigrp/8606-redist.html) — the source for the seed metric defaults and the tagging technique.
- Cisco — [What Is Administrative Distance?](https://www.cisco.com/c/en/us/support/docs/ip/border-gateway-protocol-bgp/15986-admin-distance.html) — the full default AD table, including EIGRP summary at 5.
- Cisco — [Redistribute Connected Networks into OSPF with the Subnets Keyword](https://www.cisco.com/c/en/us/support/docs/ip/open-shortest-path-first-ospf/113339-ospf-connected-net.html)
- Cisco — [Understand the Redistribution of OSPF Routes into BGP](https://www.cisco.com/c/en/us/support/docs/ip/border-gateway-protocol-bgp/5242-bgp-ospf-redis.html)
- **RFC 2328** — OSPF Version 2. The AS-External-LSA format, including the External Route Tag field, is in appendix A.4.5.

---

*Related: [OSPF beyond one area](/blog/ospf-multi-area-summarisation-and-filtering) · [EIGRP: DUAL, metrics and feasible successors](/blog/eigrp-explained-dual-metrics-and-feasible-successors) · [BGP best path selection](/blog/bgp-best-path-selection-the-tie-breakers-in-order).*

*Part of the [CCNA, ENCOR and ENARSI topic-by-topic study guide](/blog/ccna-ccnp-study-guide).*
