---
title: "IP SLA: Measuring the Network From the Network, and Making Something Act On It"
excerpt: "A router can generate its own test traffic, measure what happens to it, and then change the routing table when the answer is bad. That last part is where the value is — a probe nobody acts on is a graph, but a probe attached to a tracked object is a failover mechanism that notices things a routing protocol never will."
date: "2026-09-19"
tags: ["IP SLA", "Tracking", "Jitter", "Performance", "Troubleshooting", "ENCOR", "ENARSI"]
draft: false
---

> **Blueprint:** ENCOR 350-401 — 4.4 *Configure and verify IPSLA*. ENARSI 300-410 — 4.5 *Troubleshoot network performance issues using IP SLA (jitter, tracking objects, delay, connectivity)*.

## Cheat sheet

| Operation | Measures | Needs a responder? |
|---|---|---|
| **`icmp-echo`** | Reachability, round-trip delay | No |
| **`udp-jitter`** | **Jitter, one-way delay, loss, MOS** | **Yes** |
| `udp-echo` | Round-trip delay to a UDP port | Optional |
| `tcp-connect` | Time to open a TCP session | Optional |
| `http` | DNS + TCP + transaction time, split out | No |
| `dns` | Resolution time | No |
| `path-echo` | Hop-by-hop delay | No |

| | |
|---|---|
| **Responder** | `ip sla responder` — timestamps on arrival and departure so processing time can be subtracted |
| **Schedule** | `ip sla schedule N life forever start-time now` — **nothing runs without it** |
| **Track** | `track N ip sla M reachability` or `state` |
| **Acts on** | Static routes · HSRP priority · PBR next hops · EEM |
| **Default frequency** | 60 s. Lower it for anything doing failover |
| **Source** | Always pin it — `source-interface` or `source-ip` |

**The sentence that makes this topic matter.** A static route is believed as long as its next hop is in the routing table, which on a connected subnet means for ever. **IP SLA plus a tracked object is what makes a static route capable of noticing that the far end has stopped answering** — and that is the difference between a backup path that works and one that never activates.

---

## The gap IP SLA fills

<figure class="fig">
<svg class="sv1" viewBox="0 0 640 245" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A link that is physically up but broken beyond the next hop leaves a static route believing it is fine until a probe proves otherwise">
  <style>.sv1 .n{fill:#17171A}.sv1 .nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.sv1 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv1 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv1 .l{stroke:#8A8A93;stroke-width:1.5}.sv1 .ok{stroke:#1f9d6b;stroke-width:2.5}.sv1 .bad{stroke:#D3002D;stroke-width:2.5}
  </style>
  <rect class="n" x="20" y="60" width="80" height="34" rx="3"/><text class="nt" x="60" y="82" text-anchor="middle">R1</text>
  <line class="ok" x1="100" y1="77" x2="230" y2="77"/>
  <rect class="n" x="230" y="60" width="80" height="34" rx="3"/><text class="nt" x="270" y="82" text-anchor="middle">ISP CPE</text>
  <line class="bad" x1="310" y1="77" x2="440" y2="77" stroke-dasharray="6 5"/>
  <line x1="365" y1="67" x2="383" y2="87" stroke="#D3002D" stroke-width="2.5"/>
  <line x1="383" y1="67" x2="365" y2="87" stroke="#D3002D" stroke-width="2.5"/>
  <rect class="n" x="440" y="60" width="100" height="34" rx="3"/><text class="nt" x="490" y="82" text-anchor="middle">internet</text>
  <text class="s" x="165" y="108" text-anchor="middle" fill="#0f6b47">link up · next hop pingable</text>
  <text class="s" x="375" y="108" text-anchor="middle" fill="#D3002D">broken somewhere past it</text>
  <rect x="14" y="132" width="612" height="44" fill="#FFF1F3" stroke="#D3002D"/>
  <text class="k" x="26" y="152" fill="#B80027">The static route is perfectly happy. Its next hop is reachable.</text>
  <text class="s" x="26" y="168">Nothing in routing can see past the next hop — so traffic is forwarded into a black hole indefinitely.</text>
  <rect x="14" y="188" width="612" height="44" fill="rgba(31,157,107,.10)" stroke="#1f9d6b"/>
  <text class="k" x="26" y="208" fill="#0f6b47">A probe to something BEYOND the next hop notices.</text>
  <text class="s" x="26" y="224">That is the whole feature: test the thing you actually care about, then attach a decision to the result.</text>
</svg>
<figcaption><b>Figure 1.</b> Routing protocols detect the failure of adjacencies. IP SLA detects the failure of <em>service</em> — which is usually what the users are complaining about.</figcaption>
</figure>

<div class="why">
<b>Probe the right thing, or you have measured nothing</b>
Pinging your own next hop proves the cable is connected, which you already knew from the interface state. The probe only earns its place if it tests something <b>beyond</b> the failure you are trying to detect — an address in the provider's core, a public resolver, the far end of the tunnel, the actual service.
<br><br>And pin the source. Without <code>source-interface</code>, the probe can leave by a different path than the traffic it is supposed to represent, and then it cheerfully reports success while the path you care about is down.
</div>

---

## Jitter, and why it needs a responder

<div class="walk">
<div class="walk-head">What a udp-jitter probe actually measures <span class="walk-hint">click a step</span></div>
<div class="walk-tabs">
  <input type="radio" name="slaw" id="sa1" checked><label for="sa1"><span class="step-n">1</span>A stream, not a ping</label>
  <input type="radio" name="slaw" id="sa2"><label for="sa2"><span class="step-n">2</span>The responder</label>
  <input type="radio" name="slaw" id="sa3"><label for="sa3"><span class="step-n">3</span>Jitter</label>
  <input type="radio" name="slaw" id="sa4"><label for="sa4"><span class="step-n">4</span>Track and act</label>
</div>
<div class="walk-panels">
<div class="walk-panel">
<svg class="sv2" viewBox="0 0 640 185" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A jitter probe sends a stream of evenly spaced packets rather than a single ping">
  <style>.sv2 .n{fill:#17171A}.sv2 .nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.sv2 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv2 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv2 .p{stroke:#4b7bec;stroke-width:2.5;fill:none}</style>
  <rect class="n" x="30" y="70" width="90" height="34" rx="3"/><text class="nt" x="75" y="92" text-anchor="middle">SOURCE</text>
  <rect class="n" x="510" y="70" width="100" height="34" rx="3"/><text class="nt" x="560" y="92" text-anchor="middle">RESPONDER</text>
  <path class="p" d="M 120 87 L 510 87"/>
  <circle r="4" fill="#4b7bec"><animateMotion dur="1.4s" repeatCount="indefinite" path="M 120 87 L 510 87"/></circle>
  <circle r="4" fill="#4b7bec"><animateMotion dur="1.4s" begin="0.2s" repeatCount="indefinite" path="M 120 87 L 510 87"/></circle>
  <circle r="4" fill="#4b7bec"><animateMotion dur="1.4s" begin="0.4s" repeatCount="indefinite" path="M 120 87 L 510 87"/></circle>
  <circle r="4" fill="#4b7bec"><animateMotion dur="1.4s" begin="0.6s" repeatCount="indefinite" path="M 120 87 L 510 87"/></circle>
  <text class="s" x="320" y="66" text-anchor="middle">1000 packets, 20 ms apart, 160 bytes each</text>
  <text class="k" x="320" y="134" text-anchor="middle">That is a G.711 voice stream, in every respect that matters.</text>
  <text class="s" x="320" y="158" text-anchor="middle">Measuring with traffic shaped like the real thing is the point — a single ping tells you</text>
  <text class="s" x="320" y="174" text-anchor="middle">nothing about how a queue treats a steady stream.</text>
</svg>
<p class="walk-say"><span class="walk-title">A synthetic call, not a ping</span>
<code>udp-jitter codec g711ulaw</code> generates a packet stream that matches a real voice call — the same size, the same interval, the same number of packets. What it measures is therefore what a call would actually experience.
<br><br>A single ICMP echo measures one round trip under whatever conditions existed at that instant. A queue that is fine for one packet and terrible for a hundred looks healthy to a ping and awful to a phone call.</p>
</div>
<div class="walk-panel">
<svg class="sv3" viewBox="0 0 640 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The responder timestamps arrival and departure so its own processing delay can be subtracted">
  <style>.sv3 .n{fill:#17171A}.sv3 .nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.sv3 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv3 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv3 .m{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;fill:#17171A}.sv3 .p{stroke:#4b7bec;stroke-width:2.5;fill:none}.sv3 .r{stroke:#1f9d6b;stroke-width:2.5;fill:none}</style>
  <rect class="n" x="30" y="76" width="90" height="34" rx="3"/><text class="nt" x="75" y="98" text-anchor="middle">SOURCE</text>
  <rect class="n" x="510" y="76" width="100" height="34" rx="3"/><text class="nt" x="560" y="98" text-anchor="middle">RESPONDER</text>
  <path class="p" d="M 120 84 L 510 84"/>
  <circle r="4.5" fill="#4b7bec"><animateMotion dur="1.6s" repeatCount="indefinite" path="M 120 84 L 510 84"/></circle>
  <path class="r" d="M 510 102 L 120 102"/>
  <circle r="4.5" fill="#1f9d6b"><animateMotion dur="1.6s" begin="0.8s" repeatCount="indefinite" path="M 510 102 L 120 102"/></circle>
  <text class="m" x="320" y="70" text-anchor="middle">t1 sent          t2 received</text>
  <text class="m" x="320" y="128" text-anchor="middle">t4 received      t3 sent</text>
  <text class="k" x="320" y="162" text-anchor="middle" fill="#0f6b47">Four timestamps again — and the responder's own delay is subtracted out.</text>
  <text class="s" x="320" y="186" text-anchor="middle">Without a responder you get round-trip delay only. With one you get <tspan font-weight="700">one-way delay in each direction</tspan>.</text>
</svg>
<p class="walk-say"><span class="walk-title">The responder is what makes one-way measurement possible</span>
<code>ip sla responder</code> on the far device timestamps the packet when it arrives and again when it leaves, so the source can subtract the responder's own processing time from the round trip.
<br><br>That gives you <b>separate SD and DS measurements</b> — and asymmetric problems are extremely common, because congestion is usually directional. A round-trip number averages a broken direction with a healthy one and hides exactly what you need to see.
<br><br>If this looks like <a href="/blog/ntp-and-ptp-explained-stratum-offset-and-why-time-matters">NTP's four timestamps</a>, it is the same idea — and it carries the same caveat: one-way delay is only as good as the clock synchronisation between the two ends.</p>
</div>
<div class="walk-panel">
<svg class="sv4" viewBox="0 0 640 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Jitter is the variation in inter packet arrival times not the delay itself">
  <style>.sv4 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv4 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv4 .m{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;fill:#17171A}.sv4 .hdr{font-family:ui-sans-serif,system-ui;font-size:10px;font-weight:700;letter-spacing:.06em;fill:#8A8A93}</style>
  <text class="hdr" x="14" y="20">SENT — evenly spaced, 20 ms apart</text>
  <line x1="14" y1="44" x2="620" y2="44" stroke="#D9D9DE"/>
  <circle cx="60" cy="44" r="5" fill="#4b7bec"/><circle cx="160" cy="44" r="5" fill="#4b7bec"/>
  <circle cx="260" cy="44" r="5" fill="#4b7bec"/><circle cx="360" cy="44" r="5" fill="#4b7bec"/>
  <circle cx="460" cy="44" r="5" fill="#4b7bec"/><circle cx="560" cy="44" r="5" fill="#4b7bec"/>
  <text class="hdr" x="14" y="86">ARRIVED — bunched and gapped by queuing</text>
  <line x1="14" y1="110" x2="620" y2="110" stroke="#D9D9DE"/>
  <circle cx="60" cy="110" r="5" fill="#1f9d6b"/><circle cx="148" cy="110" r="5" fill="#1f9d6b"/>
  <circle cx="172" cy="110" r="5" fill="#1f9d6b"/><circle cx="390" cy="110" r="5" fill="#1f9d6b"/>
  <circle cx="412" cy="110" r="5" fill="#1f9d6b"/><circle cx="560" cy="110" r="5" fill="#1f9d6b"/>
  <text class="k" x="14" y="148">Average delay can be perfect while jitter makes a call unusable.</text>
  <text class="s" x="14" y="172">A jitter buffer absorbs variation up to a point, then drops packets. Under about 30 ms is usually fine;</text>
  <text class="s" x="14" y="188">consistently over that and users describe it as &#8220;robotic&#8221; or &#8220;choppy&#8221; rather than slow.</text>
</svg>
<p class="walk-say"><span class="walk-title">Jitter is variation, not delay</span>
The packets arrive — every one of them — and the call still sounds bad, because they arrive <b>unevenly</b>. The receiver's jitter buffer smooths small variation and discards anything outside its window.
<br><br>This is why "the link is not congested and the ping times are fine" does not settle a voice complaint. Average delay hides variance completely, and variance is what voice cannot tolerate. IP SLA reports <b>jitter in each direction separately</b>, plus loss and an estimated <b>MOS</b> score, which is a number you can put in front of somebody who does not care about milliseconds.</p>
</div>
<div class="walk-panel">
<svg class="sv5" viewBox="0 0 640 195" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A tracked object turns the probe result into a decision that changes the routing table">
  <style>.sv5 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv5 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv5 .m{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;fill:#17171A}.sv5 .bx{fill:#F1EEE9;stroke:#B5B5BC}.sv5 .ok{fill:rgba(31,157,107,.14);stroke:#1f9d6b}</style>
  <defs><marker id="sm" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#8A8A93"/></marker></defs>
  <rect class="bx" x="14" y="56" width="130" height="34"/><text class="m" x="79" y="77" text-anchor="middle">ip sla 1</text>
  <line x1="148" y1="73" x2="182" y2="73" stroke="#8A8A93" stroke-width="1.5" marker-end="url(#sm)"/>
  <rect class="bx" x="186" y="56" width="130" height="34"/><text class="m" x="251" y="77" text-anchor="middle">track 1</text>
  <line x1="320" y1="73" x2="354" y2="73" stroke="#8A8A93" stroke-width="1.5" marker-end="url(#sm)"/>
  <rect class="ok" x="358" y="56" width="258" height="34"/><text class="m" x="487" y="77" text-anchor="middle" fill="#0f6b47">static route · HSRP · PBR · EEM</text>
  <text class="s" x="79" y="110" text-anchor="middle">measures</text>
  <text class="s" x="251" y="110" text-anchor="middle">converts to up/down</text>
  <text class="s" x="487" y="110" text-anchor="middle">acts</text>
  <text class="k" x="320" y="148" text-anchor="middle">Without the middle box, a probe is only a graph.</text>
  <text class="s" x="320" y="172" text-anchor="middle">The tracked object is the join between measuring something and doing something about it.</text>
</svg>
<p class="walk-say"><span class="walk-title">Track — the part that makes it useful</span>
An IP SLA operation on its own produces statistics. A <b>tracked object</b> turns the result into a boolean that other features can consume, and that is where the value is: a static route that withdraws itself, an HSRP priority that drops, a PBR next hop that is skipped.
<br><br><code>reachability</code> is up or down. <code>state</code> also exposes whether a configured threshold was breached, so you can act on "the path is up but the jitter is unacceptable" — which is a genuinely different condition and one no routing protocol will ever notice for you.</p>
</div>
</div>
</div>

---

## Configuration, word by word

<div class="cmd">
<div class="cmd-line"><span class="t">ip sla</span> <span class="opt">1</span>
 <span class="t">icmp-echo</span> <span class="opt">8.8.8.8</span> <span class="t">source-interface</span> <span class="opt">GigabitEthernet0/1</span>
 <span class="t">frequency</span> <span class="opt">5</span>
 <span class="t">timeout</span> <span class="opt">1000</span>
 <span class="t">threshold</span> <span class="opt">500</span>
 <span class="t">tag</span> <span class="opt">ISP-A-REACHABILITY</span>
<span class="t">ip sla schedule</span> <span class="opt">1</span> <span class="t">life forever start-time now</span>
!
<span class="t">track</span> <span class="opt">1</span> <span class="t">ip sla</span> <span class="opt">1</span> <span class="t">reachability</span>
 <span class="t">delay down</span> <span class="opt">10</span> <span class="t">up</span> <span class="opt">30</span>
!
<span class="t">ip route</span> <span class="opt">0.0.0.0 0.0.0.0 203.0.113.1</span> <span class="t">track</span> <span class="opt">1</span>
<span class="t">ip route</span> <span class="opt">0.0.0.0 0.0.0.0 198.51.100.1</span> <span class="opt">200</span></div>
<dl class="cmd-parts">
<div class="is-key"><dt>icmp-echo … <br>source-interface</dt><dd>Probe something <b>beyond</b> the next hop — the next hop itself only proves the cable is in. And always pin the source, or the probe may take a different path than the traffic it represents and report success while that path is down.</dd></div>
<div class="is-key"><dt>ip sla schedule</dt><dd><b>Nothing runs without this.</b> The operation is defined but idle, <code>show ip sla statistics</code> reports "Operation has not started", and everything else looks configured. It is the most common IP SLA mistake by a wide margin.</dd></div>
<div class="is-key"><dt>frequency 5</dt><dd>How often it runs. <b>The default is 60 seconds</b>, which means up to a minute before a failure is detected — far too slow for failover. Five seconds is a reasonable balance; lower costs CPU and traffic for diminishing returns.</dd></div>
<div><dt>timeout 1000<br>threshold 500</dt><dd><code>timeout</code> (ms) is how long to wait before calling a probe failed. <code>threshold</code> is a softer line that marks the operation as over-threshold without failing it — useful with <code>track … state</code> when you want to act on degradation rather than outage.</dd></div>
<div class="is-key"><dt>track 1 … reachability</dt><dd>Turns the result into up or down. <b><code>reachability</code></b> follows success and failure; <b><code>state</code></b> also reflects threshold breaches. Pick deliberately — most failover uses <code>reachability</code>.</dd></div>
<div class="is-key"><dt>delay down 10 up 30</dt><dd><b>Damping, and it prevents more problems than anything else here.</b> Without it, a path that is flapping drags the routing table with it every few seconds. Going down after 10 s and back up only after 30 s of sustained success means a brief loss does not trigger a failover, and a recovering circuit has to prove itself before traffic returns.</dd></div>
<div class="is-key"><dt>ip route … track 1</dt><dd>The payoff. This static route is withdrawn when the tracked object goes down, which lets the floating static at AD 200 install. <b>Without the tracking, the primary never withdraws</b> — its next hop is on a connected subnet and therefore always "reachable", so the backup never gets its turn.</dd></div>
</dl>
</div>

<div class="cmd">
<div class="cmd-line"><span class="opt">! jitter, and the responder it needs</span>
<span class="t">ip sla</span> <span class="opt">2</span>
 <span class="t">udp-jitter</span> <span class="opt">10.2.0.1 16384</span> <span class="t">codec</span> <span class="opt">g711ulaw</span>
 <span class="t">frequency</span> <span class="opt">30</span>
 <span class="t">history hours-of-statistics-kept</span> <span class="opt">4</span>
<span class="t">ip sla schedule</span> <span class="opt">2</span> <span class="t">life forever start-time now</span>
!
<span class="opt">! on the FAR device</span>
<span class="t">ip sla responder</span></div>
<dl class="cmd-parts">
<div class="is-key"><dt>ip sla responder</dt><dd>Goes on the <b>far</b> device, and jitter operations do not work without it — the probe fails with a timeout that looks like a connectivity problem. A Cisco device only; against a non-Cisco endpoint you are limited to operations that need no responder.</dd></div>
<div><dt>codec g711ulaw</dt><dd>Sets packet size, interval and count to match that codec, so the measurement reflects what a real call would experience and you get a <b>MOS</b> estimate. <code>g729a</code> for the other common one.</dd></div>
<div><dt>history …</dt><dd>Keeps results on the device so you can look back without a collector. Useful for "was it bad at 3am" questions when nothing else was watching.</dd></div>
<div><dt><span class="opt">clock sync</span></dt><dd>One-way delay figures depend on both ends agreeing what time it is. <b>Without NTP the SD and DS numbers are meaningless</b> even though they are reported to microsecond precision — the same trap as syslog timestamps.</dd></div>
</dl>
</div>

---

## Reading it

<div class="term">
<div class="term-bar"><span class="term-dots"><i></i><i></i><i></i></span>R1 — the first line tells you whether it is even running</div>
<pre><span class="p">R1#</span> <span class="c">show ip sla statistics 1</span>
IPSLA operation id: 1
        <span class="g">Latest RTT: 14 milliseconds</span>
Latest operation start time: 10:42:31 IST Thu Sep 25 2026
Latest operation return code: <span class="g">OK</span>
Number of successes: <span class="g">8841</span>
Number of failures: <span class="r">12</span>
Operation time to live: Forever

<span class="o">! "Operation has not started" here means you forgot "ip sla schedule".</span>
<span class="o">! Return codes worth knowing: OK, Timeout, NoConnection, Busy, Error.</span>

<span class="p">R1#</span> <span class="c">show ip sla statistics 2</span>
Type of operation: udp-jitter
<span class="y">RTT Values:</span>  NumOfRTT: 1000   RTTMin/Avg/Max: 12/18/41
<span class="y">Latency one-way time:</span>
        Number of Latency one-way Samples: 1000
        Source to Destination Latency one way Min/Avg/Max: 6/9/22
        Destination to Source Latency one way Min/Avg/Max: <span class="r">6/9/19</span>
<span class="y">Jitter Time:</span>
        Source to Destination Jitter Min/Avg/Max: 0/<span class="g">3</span>/11
        Destination to Source Jitter Min/Avg/Max: 0/<span class="r">27</span>/64      <span class="o">&lt;- one direction is bad</span>
<span class="y">Packet Loss Values:</span>
        Loss Source to Destination: 0    Loss Destination to Source: <span class="r">7</span>
<span class="y">Voice Score Values:</span>
        Calculated Planning Impairment Factor (ICPIF): 12
        MOS score: <span class="r">3.71</span>

<span class="o">! SD is fine, DS is not. A round-trip measurement would have averaged these</span>
<span class="o">! into something unremarkable and you would still be looking.</span>

<span class="p">R1#</span> <span class="c">show track 1</span>
Track 1
  IP SLA 1 reachability
  <span class="g">Reachability is Up</span>
    21 changes, last change 02:14:55
  Delay up 30 secs, down 10 secs
  <span class="y">Tracked by:</span>
    <span class="y">STATIC-IP-ROUTING 0</span>        <span class="o">&lt;- proof something is actually consuming it</span><span class="cur"></span></pre>
</div>
<p class="term-cap"><b>The <code>Tracked by</code> list is the check people skip.</b> A tracked object with nothing tracking it is a probe producing a number nobody reads — and it is the usual reason a carefully built failover does not fail over. If that list is empty, the <code>track</code> keyword is missing from the static route.</p>

<div class="real">
<b>In the real world</b>
The failure that makes IP SLA worth deploying is the <b>grey failure</b>: the circuit is up, the next hop answers, BGP is established — and traffic beyond it is being black-holed by something inside the provider. Every signal your router has says healthy. Users say the internet is down.
<br><br>A probe to an address well beyond the CPE, tracked, attached to the default route, converts that into an automatic failover in seconds. It is one of the highest-value fifteen-minute configurations in networking, and the reason it gets skipped is that nothing in the routing protocols suggests it is needed until the day it is.
</div>

---

## What goes wrong

**`Operation has not started`.** No `ip sla schedule`. The commonest mistake in the topic.

**Jitter probe always times out.** No `ip sla responder` on the far device.

**Probe succeeds while the path is broken.** No `source-interface`, so it is testing a different path — or it is probing the next hop rather than something beyond it.

**Tracked object never changes.** Check `show track` — if `Tracked by` is empty, nothing is consuming it, and the `track` keyword is missing from the route.

**Failover takes a minute.** Default `frequency 60`. Lower it.

**The route flaps with the circuit.** No `delay down/up` damping.

**One-way delay figures look wrong.** The two ends disagree about the time. Fix NTP.

---

<div class="lab">
<div class="lab-head">Lab — detect a failure routing cannot see, and act on it</div>
<div class="lab-body">

<div class="lab-target"><b>Target</b>
Build the grey failure — a link that stays up while everything beyond it is broken — and confirm the routing table does not notice. Then add a probe, a tracked object and a floating static, and watch failover happen automatically. Measure jitter in both directions and find an asymmetry a round-trip figure would have hidden.</div>

**Topology.** R1 with two paths out: a primary via R2 and a backup via R3. A target beyond R2 that you can break independently of the link. A second Cisco device for the jitter responder.

<p class="lab-step"><span class="n">1</span>Build the failure routing cannot see</p>

Configure a primary static default via R2 and a floating static via R3 at AD 200. Then, on **R2**, black-hole the destination — `ip route 8.8.8.8 255.255.255.255 null0` — leaving the R1–R2 link up.

<div class="lab-watch"><b>Things to notice</b>
The primary route stays installed, the floating static never appears, and traffic is discarded. <code>show ip route</code> is entirely healthy. Ping the next hop: it answers.
<br><br>Every signal on R1 says the path is fine. <b>That is the failure mode this feature exists for</b>, and you have now produced it deliberately.</div>

<p class="lab-step"><span class="n">2</span>Add a probe and forget to schedule it</p>

```cisco
ip sla 1
 icmp-echo 8.8.8.8 source-interface Gi0/1
 frequency 5
```

```cisco
R1# show ip sla statistics 1
```

<div class="lab-watch"><b>Things to notice</b>
<b>"Operation has not started"</b> — the operation exists and is doing nothing. Add <code>ip sla schedule 1 life forever start-time now</code> and watch statistics begin immediately.
<br><br>Make a habit of it: define, schedule, then verify with <code>show ip sla statistics</code> before moving on. Half the IP SLA questions ever asked are this.</div>

<p class="lab-step"><span class="n">3</span>Track it and make the route act</p>

```cisco
track 1 ip sla 1 reachability
!
ip route 0.0.0.0 0.0.0.0 <R2> track 1
```

```cisco
R1# show track 1
```

<div class="lab-watch"><b>Things to notice</b>
With the black hole still in place, the probe fails, track 1 goes <b>Down</b>, the primary static is withdrawn and the floating static installs. <b>Automatic failover from a condition no routing protocol could see.</b>
<br><br>Check <code>Tracked by</code> in <code>show track 1</code> and confirm it names the static route. Then remove the <code>track</code> keyword from the route and watch that list go empty while everything else still looks configured — that is the silent version of this fault.</div>

<p class="lab-step"><span class="n">4</span>Make it flap, then damp it</p>

Toggle the black hole every few seconds and watch the routing table.

<div class="lab-issues"><b>Possible issues</b>
<ul>
<li><b>It does not flap</b> — your toggle is slower than the probe frequency. Lower <code>frequency</code> to 2 for the test.</li>
<li><b>The route never comes back</b> — the probe is still failing. Check <code>show ip sla statistics</code> for the return code.</li>
<li><b>Logs are flooded</b> — that is the point of the step.</li>
</ul>
Now add <code>delay down 10 up 30</code> to the tracked object and repeat. Brief failures no longer move the routing table, and recovery requires 30 seconds of sustained success. <b>Time both behaviours</b> and you have the argument for damping in numbers rather than opinion.</div>

<p class="lab-step"><span class="n">5</span>Measure jitter, and find an asymmetry</p>

Enable `ip sla responder` on the far device and build a `udp-jitter` operation with `codec g711ulaw`. Then introduce one-directional impairment — `tc qdisc add dev eth0 root netem delay 20ms 10ms` on an intermediate Linux box, applied to one direction only.

<div class="lab-watch"><b>Things to notice</b>
<code>show ip sla statistics</code> reports <b>SD and DS separately</b>, and only one of them degrades. The round-trip figure barely moves. <b>That is the case for a responder in one screen</b> — without it you would see an unremarkable average and still be looking for the problem.
<br><br>Watch the <b>MOS score</b> fall as you increase the variation, and note the value at which it drops below 4.0. That number is what you show somebody who does not care about milliseconds.</div>

<p class="lab-step"><span class="n">6</span>Probe the wrong thing on purpose</p>

Change the probe target from `8.8.8.8` to R2's own interface address, with the black hole still in place.

<div class="lab-watch"><b>Things to notice</b>
The probe <b>succeeds</b>, the tracked object stays up, the primary route stays installed, and traffic is still being discarded. You have built a monitoring system that confirms the fault is not there.
<br><br>Then remove <code>source-interface</code> and force the probe out of a different path — it succeeds again while the path you care about is broken. <b>Both mistakes produce a probe that reports health it has not measured</b>, and both are extremely common in production.</div>

<div class="lab-earned"><b>What you earned</b>
You have produced a grey failure and watched every routing signal call it healthy, which is the case for IP SLA in one experiment. You know <code>ip sla schedule</code> is the line everybody forgets and what its absence looks like. You can read <code>Tracked by</code> to prove something is actually consuming a tracked object, rather than assuming. You have damped a flapping track and measured the difference. And you have twice built a probe that reports success while the network is broken — probing the next hop, and letting the source float — so you will check both before trusting any measurement.</div>

</div>
</div>

---

## Test yourself

<div class="qz">
<p class="qz-q"><span class="qz-num">Q1</span><code>show ip sla statistics</code> says "Operation has not started". What is missing?</p>
<label class="qz-opt"><input type="radio" name="saq1"><span><code>ip sla schedule</code></span><em class="qz-fb qz-good">Correct — the operation is defined but never scheduled. It is the single most common IP SLA mistake and everything else looks configured.</em></label>
<label class="qz-opt"><input type="radio" name="saq1"><span>The tracked object</span><em class="qz-fb qz-bad">Tracking consumes the result; it does not start the probe.</em></label>
<label class="qz-opt"><input type="radio" name="saq1"><span>The responder</span><em class="qz-fb qz-bad">Only jitter operations need one, and its absence gives timeouts rather than this message.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q2</span>Why does a <code>udp-jitter</code> operation need <code>ip sla responder</code>?</p>
<label class="qz-opt"><input type="radio" name="saq2"><span>The responder timestamps arrival and departure so its processing time can be subtracted, giving one-way measurements</span><em class="qz-fb qz-good">Correct — and separate SD/DS figures are what reveal directional problems that a round-trip average hides.</em></label>
<label class="qz-opt"><input type="radio" name="saq2"><span>To open the UDP port</span><em class="qz-fb qz-bad">Port opening is a side effect; the timestamping is the reason.</em></label>
<label class="qz-opt"><input type="radio" name="saq2"><span>To authenticate the probe</span><em class="qz-fb qz-bad">Authentication is optional and unrelated to why the responder is required.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q3</span>A probe to your ISP's next-hop address succeeds while users cannot reach the internet. What went wrong?</p>
<label class="qz-opt"><input type="radio" name="saq3"><span>The probe tests the wrong thing — it proves the link, not the service beyond it</span><em class="qz-fb qz-good">Correct. Probe something well beyond the next hop, or you have built monitoring that confirms the fault is not where it is.</em></label>
<label class="qz-opt"><input type="radio" name="saq3"><span>The frequency is too low</span><em class="qz-fb qz-bad">Frequency affects how fast you notice, not what is measured.</em></label>
<label class="qz-opt"><input type="radio" name="saq3"><span>Tracking is misconfigured</span><em class="qz-fb qz-bad">Tracking is faithfully reporting a probe that is genuinely succeeding.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q4</span>What does <code>delay down 10 up 30</code> on a tracked object do?</p>
<label class="qz-opt"><input type="radio" name="saq4"><span>Damps it — 10 s of failure before going down, 30 s of success before coming back</span><em class="qz-fb qz-good">Correct, and asymmetric on purpose: fail reasonably fast, recover cautiously, so a flapping circuit does not drag the routing table with it.</em></label>
<label class="qz-opt"><input type="radio" name="saq4"><span>Sets the probe interval</span><em class="qz-fb qz-bad">That is <code>frequency</code> under the operation.</em></label>
<label class="qz-opt"><input type="radio" name="saq4"><span>Delays the schedule start</span><em class="qz-fb qz-bad">That is <code>start-time</code> on the schedule line.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q5</span>Why does a static route need tracking to fail over reliably?</p>
<label class="qz-opt"><input type="radio" name="saq5"><span>It stays valid as long as its next hop is reachable, which on a connected subnet is always</span><em class="qz-fb qz-good">Correct — so the primary never withdraws and the floating static never installs. Tracking is what lets the route notice the far end stopped answering.</em></label>
<label class="qz-opt"><input type="radio" name="saq5"><span>Static routes have no administrative distance</span><em class="qz-fb qz-bad">They have AD 1 by default, which is exactly why a floating static needs a higher one.</em></label>
<label class="qz-opt"><input type="radio" name="saq5"><span>Tracking makes the route converge faster</span><em class="qz-fb qz-bad">It makes it converge <em>at all</em> for failures beyond the next hop.</em></label>
</div>

---

## References

- Cisco — [IP SLAs Configuration Guide](https://www.cisco.com/c/en/us/td/docs/ios-xml/ios/ipsla/configuration/xe-17/sla-xe-17-book.html) — every operation type and the responder.
- Cisco — [Configuring IP SLAs UDP Jitter Operations](https://www.cisco.com/c/en/us/td/docs/ios-xml/ios/ipsla/configuration/xe-17/sla-xe-17-book/sla_udp_jitter.html)
- Cisco — [Reliable Static Routing Backup Using Object Tracking](https://www.cisco.com/c/en/us/td/docs/ios-xml/ios/ipapp/configuration/xe-17/iap-xe-17-book/iap-rel-static-rtg.html)
- **ITU-T G.107** — the E-model, which is where ICPIF and MOS come from.

---

*Related: [How a router chooses](/blog/how-a-router-chooses-routing-table-longest-match-and-ad) · [Policy-based routing](/blog/policy-based-routing-pbr-explained) · [NTP and PTP](/blog/ntp-and-ptp-explained-stratum-offset-and-why-time-matters).*

*Part of the [CCNA, ENCOR and ENARSI topic-by-topic study guide](/blog/ccna-ccnp-study-guide).*
