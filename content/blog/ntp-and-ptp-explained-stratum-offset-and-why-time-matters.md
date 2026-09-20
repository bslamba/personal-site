---
title: "NTP and PTP: Stratum, Offset, and Why Nothing Works When the Clock Is Wrong"
excerpt: "Certificates expire, logs cannot be correlated, Kerberos refuses to authenticate and your packet capture lies to you. Time is infrastructure. Here is how NTP measures the network's own delay to correct for it, what stratum really means, and where PTP earns its hardware."
date: "2026-09-20"
tags: ["NTP", "PTP", "Time", "IP Services", "CCNA", "ENCOR"]
draft: false
---

> **Blueprint:** CCNA 200-301 — 4.2 *Configure and verify NTP operating in a client and server mode*. ENCOR 350-401 — 3.3.a *Interpret network time protocol configurations such as NTP and PTP*.

## Cheat sheet

| | NTP | PTP (IEEE 1588) |
|---|---|---|
| **Transport** | UDP **123** | UDP 319 (event) / 320 (general), or Layer 2 |
| **Accuracy** | 1–50 ms over a WAN | **Sub-microsecond** on supporting hardware |
| **Hierarchy** | Stratum 0–15 | Grandmaster → boundary → transparent → slave |
| **Who corrects delay** | Software, statistically, over many samples | Hardware timestamps at the physical port |
| **Typical use** | Everything | Finance, broadcast, industrial, mobile RAN |
| **Stratum 0** | The reference itself — atomic clock, GPS. Never on the network. |
| **Stratum 1** | Directly attached to a stratum 0 source. |
| **Stratum 16** | **Unsynchronised.** Not "very bad" — completely unusable. |
| **Modes** | Client/server, symmetric active/passive, broadcast |
| **Cisco default** | A synced router advertises at its own stratum + 1 |

---

## Why an engineer should care about a clock

Time feels like a nicety until the day it is not.

**Certificates.** TLS, 802.1X with EAP-TLS, and every PKI check compares "now" against a validity window. A device whose clock is a year out rejects a perfectly good certificate, or accepts a revoked one. This is the single most common cause of "it worked yesterday" in certificate-based authentication.

**Kerberos.** Active Directory refuses authentication if the clock skew exceeds five minutes, by design, because the protocol uses timestamps to prevent replay. A switch that cannot authenticate to AD is very often just a clock problem.

**Correlating logs.** An incident spans a firewall, a switch, a server and a proxy. If their clocks disagree by twenty seconds you cannot establish what happened first — and "what happened first" is the entire question in an investigation.

**Your own troubleshooting.** Every `show logging` line, every debug, every packet capture carries a timestamp. If it is wrong you will reach wrong conclusions confidently.

<div class="why">
<b>Why this is harder than it sounds</b>
You cannot simply ask a server for the time and set your clock to the answer, because the answer took time to arrive and is already stale by an unknown amount. Worse, the delay is not symmetric — the path there may be faster than the path back. NTP's real work is not fetching the time; it is <em>measuring the network's own delay and correcting for it</em>, repeatedly, and rejecting samples that look wrong.
</div>

---

## How NTP measures a moving target

Four numbers, collected by one exchange, and every one of them matters.

<div class="walk">
<div class="walk-head">The four timestamps <span class="walk-hint">click a step</span></div>
<div class="walk-tabs">
  <input type="radio" name="ntpw" id="nt1" checked><label for="nt1"><span class="step-n">1</span>T1</label>
  <input type="radio" name="ntpw" id="nt2"><label for="nt2"><span class="step-n">2</span>T2</label>
  <input type="radio" name="ntpw" id="nt3"><label for="nt3"><span class="step-n">3</span>T3</label>
  <input type="radio" name="ntpw" id="nt4"><label for="nt4"><span class="step-n">4</span>T4</label>
  <input type="radio" name="ntpw" id="nt5"><label for="nt5"><span class="step-n">5</span>The arithmetic</label>
</div>
<div class="walk-panels">
<div class="walk-panel">
<svg class="sv1" viewBox="0 0 640 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The client stamps the moment it sends — by its own, possibly wrong, clock.">
  <style>.sv1 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv1 .m{font-family:ui-monospace,Menlo,monospace;font-size:11px;fill:#17171A}.sv1 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv1 .lbl{font-family:ui-sans-serif,system-ui;font-size:10px;font-weight:700;fill:#8A8A93;letter-spacing:.06em}</style>
  <defs><marker id="tm" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#4b7bec"/></marker></defs>
  <text class="lbl" x="14" y="26">CLIENT</text>
  <text class="lbl" x="560" y="26">SERVER</text>
  <line x1="60" y1="34" x2="60" y2="178" stroke="#17171A" stroke-width="2"/>
  <line x1="580" y1="34" x2="580" y2="178" stroke="#17171A" stroke-width="2"/>
  <line x1="60" y1="56" x2="580" y2="96" stroke="#4b7bec" stroke-width="2.5" opacity="1" marker-end="url(#tm)"/>
  <line x1="580" y1="116" x2="60" y2="156" stroke="#4b7bec" stroke-width="2.5" opacity="0.2" marker-end="url(#tm)"/>
  <circle cx="60" cy="56" r="5" fill="#D3002D" opacity="1"/>
  <text class="m" x="74" y="52" opacity="1">T1  12:00:00.000  client transmit</text>
  <circle cx="580" cy="96" r="5" fill="#D3002D" opacity="0.2"/>
  <text class="m" x="566" y="92" text-anchor="end" opacity="0.2">T2  12:00:00.012  server receive</text>
  <circle cx="580" cy="116" r="5" fill="#D3002D" opacity="0.2"/>
  <text class="m" x="566" y="132" text-anchor="end" opacity="0.2">T3  12:00:00.012  server transmit</text>
  <circle cx="60" cy="156" r="5" fill="#D3002D" opacity="0.2"/>
  <text class="m" x="74" y="172" opacity="0.2">T4  12:00:00.025  client receive</text>
  <text class="k" x="14" y="202" fill="#5C5C64">The client stamps the moment it sends — by its own, possibly wrong, clock.</text>
</svg>
<p class="walk-say"><span class="walk-title">T1 — the client writes down when it asked</span>
This timestamp goes into the packet's Transmit field. It is measured by the clock the client is trying to correct, so it may be wildly wrong — and that is fine, because the arithmetic at the end only ever uses <b>differences</b>.</p>
</div>
<div class="walk-panel">
<svg class="sv2" viewBox="0 0 640 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The server stamps arrival, by the good clock.">
  <style>.sv2 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv2 .m{font-family:ui-monospace,Menlo,monospace;font-size:11px;fill:#17171A}.sv2 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv2 .lbl{font-family:ui-sans-serif,system-ui;font-size:10px;font-weight:700;fill:#8A8A93;letter-spacing:.06em}</style>
  <defs><marker id="tm" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#4b7bec"/></marker></defs>
  <text class="lbl" x="14" y="26">CLIENT</text>
  <text class="lbl" x="560" y="26">SERVER</text>
  <line x1="60" y1="34" x2="60" y2="178" stroke="#17171A" stroke-width="2"/>
  <line x1="580" y1="34" x2="580" y2="178" stroke="#17171A" stroke-width="2"/>
  <line x1="60" y1="56" x2="580" y2="96" stroke="#4b7bec" stroke-width="2.5" opacity="1" marker-end="url(#tm)"/>
  <line x1="580" y1="116" x2="60" y2="156" stroke="#4b7bec" stroke-width="2.5" opacity="0.2" marker-end="url(#tm)"/>
  <circle cx="60" cy="56" r="5" fill="#D3002D" opacity="1"/>
  <text class="m" x="74" y="52" opacity="1">T1  12:00:00.000  client transmit</text>
  <circle cx="580" cy="96" r="5" fill="#D3002D" opacity="1"/>
  <text class="m" x="566" y="92" text-anchor="end" opacity="1">T2  12:00:00.012  server receive</text>
  <circle cx="580" cy="116" r="5" fill="#D3002D" opacity="0.2"/>
  <text class="m" x="566" y="132" text-anchor="end" opacity="0.2">T3  12:00:00.012  server transmit</text>
  <circle cx="60" cy="156" r="5" fill="#D3002D" opacity="0.2"/>
  <text class="m" x="74" y="172" opacity="0.2">T4  12:00:00.025  client receive</text>
  <text class="k" x="14" y="202" fill="#5C5C64">The server stamps arrival, by the good clock.</text>
</svg>
<p class="walk-say"><span class="walk-title">T2 — the server writes down when it heard</span>
Now there are two clocks in play. <b>T2 minus T1 contains both the network delay and the error between the clocks</b>, mixed together and impossible to separate from this one number. Separating them is what the other two timestamps are for.</p>
</div>
<div class="walk-panel">
<svg class="sv3" viewBox="0 0 640 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The server stamps its reply. The gap T3 - T2 is time the server spent thinking.">
  <style>.sv3 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv3 .m{font-family:ui-monospace,Menlo,monospace;font-size:11px;fill:#17171A}.sv3 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv3 .lbl{font-family:ui-sans-serif,system-ui;font-size:10px;font-weight:700;fill:#8A8A93;letter-spacing:.06em}</style>
  <defs><marker id="tm" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#4b7bec"/></marker></defs>
  <text class="lbl" x="14" y="26">CLIENT</text>
  <text class="lbl" x="560" y="26">SERVER</text>
  <line x1="60" y1="34" x2="60" y2="178" stroke="#17171A" stroke-width="2"/>
  <line x1="580" y1="34" x2="580" y2="178" stroke="#17171A" stroke-width="2"/>
  <line x1="60" y1="56" x2="580" y2="96" stroke="#4b7bec" stroke-width="2.5" opacity="1" marker-end="url(#tm)"/>
  <line x1="580" y1="116" x2="60" y2="156" stroke="#4b7bec" stroke-width="2.5" opacity="1" marker-end="url(#tm)"/>
  <circle cx="60" cy="56" r="5" fill="#D3002D" opacity="1"/>
  <text class="m" x="74" y="52" opacity="1">T1  12:00:00.000  client transmit</text>
  <circle cx="580" cy="96" r="5" fill="#D3002D" opacity="1"/>
  <text class="m" x="566" y="92" text-anchor="end" opacity="1">T2  12:00:00.012  server receive</text>
  <circle cx="580" cy="116" r="5" fill="#D3002D" opacity="1"/>
  <text class="m" x="566" y="132" text-anchor="end" opacity="1">T3  12:00:00.012  server transmit</text>
  <circle cx="60" cy="156" r="5" fill="#D3002D" opacity="0.2"/>
  <text class="m" x="74" y="172" opacity="0.2">T4  12:00:00.025  client receive</text>
  <text class="k" x="14" y="202" fill="#5C5C64">The server stamps its reply. The gap T3 - T2 is time the server spent thinking.</text>
</svg>
<p class="walk-say"><span class="walk-title">T3 — and the reason there are four, not three</span>
The server stamps the moment it transmits. The gap between T2 and T3 is the server's own processing time, and it is included in the packet <b>precisely so the client can subtract it</b>. Without T3, a slow or busy server would look like a distant one and the delay calculation would be wrong.</p>
</div>
<div class="walk-panel">
<svg class="sv4" viewBox="0 0 640 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The client stamps arrival. This one is never in any packet.">
  <style>.sv4 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv4 .m{font-family:ui-monospace,Menlo,monospace;font-size:11px;fill:#17171A}.sv4 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv4 .lbl{font-family:ui-sans-serif,system-ui;font-size:10px;font-weight:700;fill:#8A8A93;letter-spacing:.06em}</style>
  <defs><marker id="tm" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#4b7bec"/></marker></defs>
  <text class="lbl" x="14" y="26">CLIENT</text>
  <text class="lbl" x="560" y="26">SERVER</text>
  <line x1="60" y1="34" x2="60" y2="178" stroke="#17171A" stroke-width="2"/>
  <line x1="580" y1="34" x2="580" y2="178" stroke="#17171A" stroke-width="2"/>
  <line x1="60" y1="56" x2="580" y2="96" stroke="#4b7bec" stroke-width="2.5" opacity="1" marker-end="url(#tm)"/>
  <line x1="580" y1="116" x2="60" y2="156" stroke="#4b7bec" stroke-width="2.5" opacity="1" marker-end="url(#tm)"/>
  <circle cx="60" cy="56" r="5" fill="#D3002D" opacity="1"/>
  <text class="m" x="74" y="52" opacity="1">T1  12:00:00.000  client transmit</text>
  <circle cx="580" cy="96" r="5" fill="#D3002D" opacity="1"/>
  <text class="m" x="566" y="92" text-anchor="end" opacity="1">T2  12:00:00.012  server receive</text>
  <circle cx="580" cy="116" r="5" fill="#D3002D" opacity="1"/>
  <text class="m" x="566" y="132" text-anchor="end" opacity="1">T3  12:00:00.012  server transmit</text>
  <circle cx="60" cy="156" r="5" fill="#D3002D" opacity="1"/>
  <text class="m" x="74" y="172" opacity="1">T4  12:00:00.025  client receive</text>
  <text class="k" x="14" y="202" fill="#B80027">The client stamps arrival. This one is never in any packet.</text>
</svg>
<p class="walk-say"><span class="walk-title">T4 — the one the packet does not carry</span>
The client records this itself when the reply lands. <b>Only the client ever holds all four numbers</b>, which is why only the client can compute the answer — and why the server keeps no state about the client at all. That is what lets one NTP server handle enormous numbers of clients.</p>
</div>
<div class="walk-panel">
<svg class="sv5" viewBox="0 0 640 248" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="offset = -0.20 ms  ·  delay = 25.20 ms">
  <style>.sv5 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv5 .m{font-family:ui-monospace,Menlo,monospace;font-size:11px;fill:#17171A}.sv5 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv5 .lbl{font-family:ui-sans-serif,system-ui;font-size:10px;font-weight:700;fill:#8A8A93;letter-spacing:.06em}</style>
  <defs><marker id="tm" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#4b7bec"/></marker></defs>
  <text class="lbl" x="14" y="26">CLIENT</text>
  <text class="lbl" x="560" y="26">SERVER</text>
  <line x1="60" y1="34" x2="60" y2="178" stroke="#17171A" stroke-width="2"/>
  <line x1="580" y1="34" x2="580" y2="178" stroke="#17171A" stroke-width="2"/>
  <line x1="60" y1="56" x2="580" y2="96" stroke="#4b7bec" stroke-width="2.5" opacity="1" marker-end="url(#tm)"/>
  <line x1="580" y1="116" x2="60" y2="156" stroke="#4b7bec" stroke-width="2.5" opacity="1" marker-end="url(#tm)"/>
  <circle cx="60" cy="56" r="5" fill="#D3002D" opacity="1"/>
  <text class="m" x="74" y="52" opacity="1">T1  12:00:00.000  client transmit</text>
  <circle cx="580" cy="96" r="5" fill="#D3002D" opacity="1"/>
  <text class="m" x="566" y="92" text-anchor="end" opacity="1">T2  12:00:00.012  server receive</text>
  <circle cx="580" cy="116" r="5" fill="#D3002D" opacity="1"/>
  <text class="m" x="566" y="132" text-anchor="end" opacity="1">T3  12:00:00.012  server transmit</text>
  <circle cx="60" cy="156" r="5" fill="#D3002D" opacity="1"/>
  <text class="m" x="74" y="172" opacity="1">T4  12:00:00.025  client receive</text>
  <text class="k" x="14" y="212" fill="#0f6b47">offset = -0.20 ms  ·  delay = 25.20 ms</text>
  <rect x="300" y="186" width="326" height="52" fill="#fff" stroke="#1f9d6b"/><text class="m" x="314" y="206" fill="#0f6b47">offset = ((T2-T1) + (T3-T4)) / 2</text><text class="m" x="314" y="228" fill="#0f6b47">delay  = (T4-T1) - (T3-T2)</text>
</svg>
<p class="walk-say"><span class="walk-title">Two answers from four numbers</span>
<b>Offset</b> is how wrong the client's clock is, and it is what gets corrected — slewed gradually if small, stepped if large. <b>Delay</b> is how long the round trip took, and it is used to <em>weigh</em> the answer: a source with a long or variable delay is trusted less than a close, steady one.
<br><br>The division by two is the whole assumption: it takes the path to be <b>symmetric</b>. When it is not, the error is half the asymmetry, and nothing in the exchange can detect it. That is the ceiling on NTP's accuracy and the reason PTP timestamps in hardware instead.</p>
</div>
</div>
</div>



- **Delay** = `(t4 − t1) − (t3 − t2)` — total elapsed, minus the time the server spent thinking. What is left is time on the wire.
- **Offset** = `((t2 − t1) + (t3 − t4)) / 2` — how far the client's clock is from the server's, assuming the path is symmetric.

That assumption is NTP's one weakness. If the forward path is 5 ms and the return path is 15 ms, NTP splits the difference and is wrong by 5 ms with no way to detect it. Asymmetric routing, a congested queue in one direction, or a WAN link with different upstream and downstream rates all produce this. **It is also exactly what PTP's hardware timestamping is designed to eliminate.**

NTP then does something important: **it does not just apply the offset.** It collects many samples, discards outliers, and *slews* the clock — speeding it up or slowing it down slightly until it converges. A clock that jumps backwards breaks databases and log ordering, so NTP avoids stepping unless the error is large (128 ms by default) and refuses entirely beyond 1000 seconds — at which point it logs and gives up, waiting for a human.

### The four timestamps, on the wire

Every number the article has just described lives in one 48-byte packet.

<div class="cap">
<div class="cap-head">Capture · server reply to a client poll <span class="cap-filter">ntp</span></div>
<div class="cap-tree"><pre>&#9662; Network Time Protocol (NTP Version 4, server)
    <span class="f">Flags:</span> <span class="v"><mark>0x24</mark></span>
      <span class="f">00.. ....</span> = <span class="v">Leap Indicator: no warning (0)</span>
      <span class="f">..10 0...</span> = <span class="v">Version number: NTP Version 4 (4)</span>
      <span class="f">.... .100</span> = <span class="v">Mode: <mark>server (4)</mark></span>
    <span class="f">Peer Clock Stratum:</span> <span class="v"><mark>secondary reference (2)</mark></span>
    <span class="f">Peer Polling Interval:</span> <span class="v">6 (64 sec)</span>
    <span class="f">Peer Clock Precision:</span> <span class="v">-23 (0.1 usec)</span>
    <span class="f">Root Delay / Dispersion:</span> <span class="v">4.88 ms / 10.03 ms</span>
    <span class="f">Reference ID:</span> <span class="v">17.253.34.253</span>      &#8592; who <em>this</em> server follows
    <span class="f">Reference Timestamp:</span> <span class="v">12:58:56</span>       &#8592; when it last synchronised
    <span class="f">Origin Timestamp:</span> <span class="v"><mark>12:00:00.000</mark></span>   &#8592; <b>T1</b>, echoed straight back
    <span class="f">Receive Timestamp:</span> <span class="v"><mark>12:00:00.012</mark></span>  &#8592; <b>T2</b>
    <span class="f">Transmit Timestamp:</span> <span class="v"><mark>12:00:00.012</mark></span> &#8592; <b>T3</b></pre></div>
<div class="cap-hex"><pre>0000  45 b8 00 4c 00 00 00 00  <mark>ff</mark> 11 a4 b4 0a 01 01 01   E..L............
0010  0a 01 01 32 <mark>00 7b 00 7b</mark>  00 38 00 00 <mark>24</mark> <mark>02</mark> 06 e9   ...2.{.{.8..$...
0020  00 00 01 38 00 00 02 91  11 fd 22 fd ee 5b 9a 80   ...8......"..[..
0030  00 00 00 00 <mark>ee 5b 9a c0</mark>  00 00 00 00 ee 5b 9a c0   .....[.......[..
0040  03 2c a8 00 ee 5b 9a c0  03 4d 68 00               .,...[...Mh.</pre></div>
<div class="cap-note"><b>The fourth timestamp is not in the packet.</b> T1, T2 and T3 are all here — you can see the three 8-byte timestamps starting at offset 0x34 — but <b>T4 is recorded by the client when this packet arrives</b>. That is the whole trick: only the client ever holds all four numbers, so only the client can compute the answer, and the server keeps no state at all.
<br><br><code>00 7b 00 7b</code> is UDP port 123 in both directions. <code>24</code> decodes as leap 0, version 4, mode 4. <code>02</code> is the stratum. And <code>ee 5b 9a c0</code> repeats three times — the integer part of the NTP seconds, identical because all three events happened inside the same second; the 32-bit fractions after each are where the milliseconds live.</div>
</div>

With those four numbers the client computes both answers with arithmetic and no assumptions except one:

```text
T1  client transmit  12:00:00.000
T2  server receive   12:00:00.012
T3  server transmit  12:00:00.012
T4  client receive   12:00:00.025

offset = ((T2 - T1) + (T3 - T4)) / 2  =  -0.20 ms   ← how wrong my clock is
delay  = (T4 - T1) - (T3 - T2)        =  25.20 ms   ← how long the round trip took
```

<div class="warn">
<b>The assumption, and where it breaks</b>
Dividing by two assumes the path is <b>symmetric</b> — that the packet took as long going out as coming back. When that is false, the error is <em>half the asymmetry</em>, and no amount of polling will find it because nothing in the exchange can detect it. A satellite link, an asymmetric DSL circuit, or a queue that only builds in one direction will leave a router confidently synchronised and quietly wrong. This is also precisely the problem PTP's hardware timestamping exists to remove.
</div>

### Stratum

Stratum is **distance from the reference, measured in hops of trust**, not quality.

| Stratum | What it is |
|---|---|
| **0** | The reference clock itself — GPS, atomic, radio. Not addressable on a network. |
| **1** | A server directly attached to a stratum 0 device. |
| **2** | Syncs from stratum 1. And so on. |
| **15** | The last usable value. |
| **16** | **Unsynchronised.** A device advertising 16 is telling you it does not know the time. |

Each hop adds error. Beyond stratum 3 or 4 in an enterprise, you are accumulating inaccuracy for no reason.

<div class="warn">
<b>Stratum 16 is not "poor quality" — it is "no time at all"</b>
<code>show ntp status</code> reading <code>clock is unsynchronized, stratum 16</code> means the device has no usable time source. Clients will refuse it. This is the state to look for first, and it usually means the upstream server is unreachable, an ACL is blocking UDP 123, or authentication is failing.
</div>

---

## Configuration, word by word

<div class="cmd">
<div class="cmd-line"><span class="t">ntp server</span> <span class="opt">10.0.0.10</span> <span class="t">prefer</span>
<span class="t">ntp server</span> <span class="opt">10.0.0.11</span>
<span class="t">ntp server</span> <span class="opt">216.239.35.0</span>
!
<span class="t">ntp authentication-key</span> <span class="opt">1</span> <span class="t">md5</span> <span class="opt">&lt;secret&gt;</span>
<span class="t">ntp authenticate</span>
<span class="t">ntp trusted-key</span> <span class="opt">1</span>
<span class="t">ntp server</span> <span class="opt">10.0.0.10</span> <span class="t">key</span> <span class="opt">1</span>
!
<span class="t">ntp source</span> <span class="opt">Loopback0</span>
<span class="t">ntp access-group peer</span> <span class="opt">20</span></div>
<dl class="cmd-parts">
<div class="is-key"><dt>ntp server × 3</dt><dd><b>Configure three, never two.</b> With one source you cannot tell whether it is wrong. With two you can tell they disagree but not which to believe. With three, NTP's intersection algorithm can discard the outlier — this is the single most important design decision on the page, and it costs nothing.</dd></div>
<div><dt>prefer</dt><dd>A tie-break, not an override. Among sources the algorithm considers equally good, take this one. It does <b>not</b> force selection of a source that fails the sanity checks, which is exactly the behaviour you want.</dd></div>
<div class="is-key"><dt>authentication-key 1<br>md5 &lt;secret&gt;</dt><dd>Defines the key. On its own it does <b>nothing</b> — all three of <code>authentication-key</code>, <code>authenticate</code> and <code>trusted-key</code> must be present, plus <code>key 1</code> on the server line. Configure one and miss another and the router carries on syncing happily with no authentication at all, which is the worst outcome: you believe it is protected.</dd></div>
<div><dt>ntp authenticate</dt><dd>Turns the checking on. Without it the keys are defined and ignored.</dd></div>
<div><dt>ntp trusted-key 1</dt><dd>Says which defined keys are acceptable. A key that is defined but not trusted will not authenticate anything.</dd></div>
<div><dt>ntp source Loopback0</dt><dd>Sends from a stable address rather than whichever interface the packet leaves by. Essential when the far end filters by source address, and it stops your identity changing when a link fails over.</dd></div>
<div class="is-key"><dt>ntp access-group peer 20</dt><dd>Controls who may sync <em>with</em> you and who may query you. NTP is a well-known <b>reflection and amplification vector</b> — an open device answering <code>monlist</code> or ordinary queries from the internet can be used to attack somebody else. Restrict it, and on anything internet-facing also add <code>no ntp allow mode control</code>.</dd></div>
</dl>
</div>

### Making a router a server

```cisco
! Distribute time to the rest of the estate
ntp master 3
```

`ntp master` makes the router an authoritative source at the stratum you specify, **using its own hardware clock** if nothing better is available. Useful at a branch that loses its WAN. Dangerous if you forget it: a router with a wrong clock will confidently serve wrong time to everything downstream.

### Reading it

<div class="term">
<div class="term-bar"><span class="term-dots"><i></i><i></i><i></i></span>R1 — two commands, read in this order</div>
<pre><span class="p">R1#</span> <span class="c">show ntp status</span>
<span class="g">Clock is synchronized</span>, stratum 3, reference is 10.0.0.10
nominal freq is 250.0000 Hz, actual freq is 249.9999 Hz, precision is 2**18
reference time is E9A4F2C1.7B3D0A21 (14:22:09.481 IST Sun Sep 20 2026)
clock offset is <span class="y">1.8420 msec</span>, root delay is 24.51 msec
root dispersion is 41.22 msec, peer dispersion is 2.10 msec

<span class="o">! If this says "Clock is unsynchronized", stop. Nothing below matters yet.</span>

<span class="p">R1#</span> <span class="c">show ntp associations</span>
  address         ref clock       st   when   poll <span class="y">reach</span>  delay  offset   disp
<span class="g">*</span>~10.0.0.10       .GPS.            2     31     64   <span class="g">377</span>  24.51   1.842   2.10
<span class="g">+</span>~10.0.0.11       .GPS.            2     44     64   <span class="g">377</span>  26.03   2.115   2.44
 ~216.239.35.0    .GOOG.           1    102   1024   <span class="r">357</span>  88.14  -3.902  14.90

<span class="o">! *  selected    +  candidate that passed the checks    (blank) rejected</span>
<span class="o">! reach is OCTAL — 377 is all eight of the last eight polls answered.</span>
<span class="o">! 357 means one was missed. Watch it, do not panic at it.</span>
<span class="o">! Note the third peer is stratum 1 and still not selected: NTP prefers a close,</span>
<span class="o">! consistent stratum 2 over a distant stratum 1. Lower stratum does not mean better.</span><span class="cur"></span></pre>
</div>
<p class="term-cap"><b>The <code>reach</code> column is octal and that trips people every time.</b> It is a bitmap of the last eight polls, so <code>377</code> is 11111111 — all present. A value dropping through <code>376</code>, <code>374</code>, <code>370</code> is packet loss in progress, and <code>0</code> means nothing is getting through at all. Convert it to binary once and the column becomes the single most informative number in NTP.</p>

Read it in this order:

1. **`Clock is synchronized`** — anything else and stop here; nothing below matters.
2. **The symbol in column one.** `*` is the selected source. `+` is a candidate that passed the sanity checks. A blank means rejected. `x` means it failed the intersection test — it disagrees with the others.
3. **`reach`** — an octal bitmap of the last eight polls. **`377` is all eight received**, which is what you want. `377` dropping to `376`, `374`, `370` shows packets being lost. `0` means nothing is getting through.
4. **`offset`** — milliseconds from that peer. Single-digit on a LAN, tens over a WAN.
5. **`st`** — their stratum. Yours will be one more than the selected peer's.

---

## PTP, and when you need it

NTP's software timestamps are taken when the operating system gets around to it. Interrupt latency, queueing and scheduler delay all add jitter that is large compared to a microsecond.

**PTP timestamps in hardware, at the physical port**, the instant the packet crosses it. That removes the entire software stack from the measurement.

Three device roles do the rest:

| Role | What it does |
|---|---|
| **Grandmaster** | The best clock in the domain, chosen by the Best Master Clock Algorithm. |
| **Boundary clock** | Slaves to the master on one port, acts as master on others. Re-times, so error does not accumulate. |
| **Transparent clock** | Forwards PTP messages but **writes its own queueing delay into a correction field**, so the receiver can subtract it. |

That correction field is the key idea. A switch is a variable, unpredictable delay in the middle of the path — exactly the thing NTP cannot see. A transparent clock measures how long it personally held the packet and says so.

**Use PTP when** you need sub-microsecond: financial trade timestamping (MiFID II requires it), broadcast video, industrial control, mobile base station synchronisation. **Use NTP for everything else**, and note that PTP needs support in every switch along the path — one ordinary switch in the middle reintroduces the jitter you paid to remove.

---

<div class="real">
<b>In the real world</b>
The reason to care is that <b>every security control you own depends on the clock</b>, and they fail in ways that do not mention time. A certificate is not yet valid, so TLS fails with a confusing error. Kerberos rejects a ticket outside its five-minute skew window and users cannot log in. Logs from two devices interleave in the wrong order and an incident timeline becomes unreadable. A RADIUS session appears to end before it began. In every one of those cases the alert points at the application, and the fault is a router whose battery-backed clock drifted after a power cut and never resynchronised because somebody filtered UDP 123 at the firewall. <b>Check <code>show ntp status</code> before you debug anything time-adjacent</b> — it costs five seconds and it is right more often than it has any business being.
</div>

## What goes wrong

**Stratum 16, never syncs.** The server is unreachable, an ACL blocks UDP 123 (check both directions), or authentication is mismatched. `show ntp associations` with `reach 0` confirms packets are not arriving.

**Synced but the time is wrong.** Someone configured `ntp master` on a device with a bad clock, and it is serving that confidently. Look for `.LOCL.` as a reference clock — that means "my own hardware clock", and it is almost always a mistake.

**Offset is large and will not converge.** NTP refuses to step more than 1000 seconds. Set the clock manually once with `clock set`, then let NTP take over.

**Logs still show uptime instead of dates.** `service timestamps` is missing. NTP is working; the logging is not using it.

**Time is right but certificates still fail.** Check the **timezone and daylight saving**. A device in UTC and a server in local time are hours apart while both being "correct".

**It syncs, then drifts, then resyncs.** A single source with high dispersion, or asymmetric routing making the offset calculation unstable. Add sources.

---

<div class="lab">
<div class="lab-head">Lab — build a time hierarchy, then poison it</div>
<div class="lab-body">

<div class="lab-target"><b>Target</b>
Build a three-tier NTP hierarchy, read every column of <code>show ntp associations</code> with confidence, prove that authentication prevents an attacker moving your clock, and produce the two failure states — stratum 16 and confidently-wrong time — so you recognise each from its symptom.</div>

**Topology.** R1 is the time source for the site. R2 and R3 are clients. A switch connects all three. R4 plays the attacker on the same segment.

<p class="lab-step"><span class="n">1</span>Start from unsynchronised</p>

On R2, `show ntp status` before configuring anything.

<div class="lab-watch"><b>Things to notice</b>
It reads <code>clock is unsynchronized</code> and <b>stratum 16</b>. Fix this image in your memory — it is the state you will find on a broken device, and it means "no time", not "bad time".</div>

<p class="lab-step"><span class="n">2</span>Make R1 authoritative</p>

```cisco
! R1
clock timezone IST 5 30
clock set 14:00:00 20 Sep 2026
ntp master 3
```

`show ntp status` on R1. It reports stratum 3, synchronised, reference `.LOCL.` — its own hardware clock.

<p class="lab-step"><span class="n">3</span>Point the clients at it</p>

```cisco
! R2 and R3
clock timezone IST 5 30
ntp server 10.0.0.1
service timestamps log datetime msec localtime show-timezone
```

Wait. **NTP is deliberately slow** — expect one to five minutes before it selects a peer, and do not conclude it is broken before then. Poll every 30 seconds with `show ntp associations`.

<div class="lab-watch"><b>Things to notice</b>
Watch the <code>reach</code> column climb: <code>1</code>, <code>3</code>, <code>7</code>, <code>17</code>, <code>37</code>, <code>77</code>, <code>177</code>, <code>377</code>. It is an octal shift register of the last eight polls, filling from the right. Reaching <code>377</code> means eight consecutive successes. Watch the <code>*</code> appear against the peer at the moment it is selected. R2's stratum becomes 4 — one more than R1's 3.</div>

<p class="lab-step"><span class="n">4</span>Break it with an ACL</p>

On the switch or on R2's interface, block UDP 123 inbound. Wait through several polls.

<div class="lab-watch"><b>Things to notice</b>
<code>reach</code> decays the way it climbed — <code>377</code> → <code>376</code> → <code>374</code> → <code>370</code>. The clock does not immediately go wrong; it free-runs, and dispersion grows. Eventually the peer is dropped and the device returns to stratum 16. This slow decay is why NTP problems are often noticed days after the change that caused them.</div>

Remove the ACL and watch it recover.

<p class="lab-step"><span class="n">5</span>Poison the clock</p>

With no authentication configured, on R4:

```cisco
clock set 09:00:00 20 Sep 2019
ntp master 1
```

R4 now claims **stratum 1** — better than R1's 3 — with a clock three years wrong.

<div class="lab-watch"><b>Things to notice</b>
If R2 has <code>ntp server</code> pointing only at R1 it will not switch. But configure R2 to accept broadcasts, or point it at R4, and watch what happens: the lower stratum wins, and R2 adopts a date in 2019. Now think about what that does to certificate validation across the estate.</div>

<p class="lab-step"><span class="n">6</span>Defend it</p>

```cisco
! R1 and the clients
ntp authentication-key 1 md5 TimeIsMoney
ntp authenticate
ntp trusted-key 1
! On the clients only
ntp server 10.0.0.1 key 1
! And restrict who may peer at all
access-list 20 permit 10.0.0.0 0.0.0.255
ntp access-group peer 20
```

Repeat step 5. R4's announcements are now ignored. Confirm with `show ntp associations detail` — the rejected peer shows an authentication failure.

<div class="lab-issues"><b>Possible issues</b>
<ul>
<li><b>Nothing syncs and you are certain the config is right</b> — you did not wait long enough. Five minutes is normal. This is the commonest false alarm in the whole lab.</li>
<li><b>Authentication configured and now nothing syncs</b> — <code>ntp trusted-key</code> is missing on one side, or the key number differs. Both ends need the same number <em>and</em> the same string.</li>
<li><b>Offset is enormous and never converges</b> — more than 1000 seconds out. Set the clock manually once with <code>clock set</code>, then let NTP take it from there.</li>
<li><b>Logs still show uptime</b> — <code>service timestamps</code> missing. NTP is fine; logging is not using it.</li>
<li><b>Times differ by exactly 5:30 (or whatever your offset is)</b> — a timezone problem, not an NTP problem. Check <code>clock timezone</code> on every device.</li>
<li><b>Simulated routers drift badly</b> — virtual machines keep poor time. Expect larger offsets in EVE-NG than on real hardware; the behaviour is still correct.</li>
</ul></div>

<p class="lab-step"><span class="n">7</span>Capture the four timestamps</p>

Mirror R2's port to Wireshark and filter `ntp`. Open one request and one reply. Find, in the packet detail: the **Reference Timestamp**, **Origin Timestamp (t1)**, **Receive Timestamp (t2)** and **Transmit Timestamp (t3)**. Wireshark computes t4 itself. Do the arithmetic by hand and compare your answer with the offset in `show ntp associations`.

<div class="lab-earned"><b>What you earned</b>
You can look at <code>show ntp associations</code> and say immediately whether a source is selected, reachable and sane — and what a decaying <code>reach</code> value means. You know stratum 16 is "no time" rather than "bad time". You have seen an unauthenticated clock moved by an attacker on the same segment, which is the argument you will need when somebody asks whether NTP authentication is worth configuring. And you have calculated an offset by hand from a real capture, so the formula is no longer something you take on trust.</div>

</div>
</div>

---

## Test yourself

<div class="qz">
<p class="qz-q"><span class="qz-num">Q1</span><code>show ntp status</code> reports stratum 16. What does that mean?</p>
<label class="qz-opt"><input type="radio" name="t1"><span>Time is being taken from a distant, low-quality source</span><em class="qz-fb qz-bad">16 is not a poor source — it is the reserved value meaning none.</em></label>
<label class="qz-opt"><input type="radio" name="t1"><span>The device has no usable time source at all</span><em class="qz-fb qz-good">Correct. Stratum 16 means unsynchronised, and clients will refuse it. Check reachability, ACLs on UDP 123, and authentication.</em></label>
<label class="qz-opt"><input type="radio" name="t1"><span>The device is a stratum 1 server 15 hops away</span><em class="qz-fb qz-bad">Stratum counts trust hops from the reference, and 16 is the reserved unsynchronised value.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q2</span>Why is a symmetric path assumed, and what breaks when it is not true?</p>
<label class="qz-opt"><input type="radio" name="t2"><span>NTP halves the round-trip delay, so asymmetry produces an undetectable error</span><em class="qz-fb qz-good">Exactly. If forward and return differ, the offset is wrong by half the difference and NTP cannot tell. PTP's hardware timestamping and transparent clocks exist to remove this.</em></label>
<label class="qz-opt"><input type="radio" name="t2"><span>NTP only works on symmetric Ethernet links</span><em class="qz-fb qz-bad">It works over anything; the assumption is about delay, not media.</em></label>
<label class="qz-opt"><input type="radio" name="t2"><span>Nothing breaks — NTP measures each direction separately</span><em class="qz-fb qz-bad">It cannot. Only four timestamps are available and the split is assumed even.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q3</span>What does a transparent clock contribute in PTP?</p>
<label class="qz-opt"><input type="radio" name="t3"><span>It re-times the stream as a new master</span><em class="qz-fb qz-bad">That is a boundary clock.</em></label>
<label class="qz-opt"><input type="radio" name="t3"><span>It writes its own queueing delay into a correction field so the receiver can subtract it</span><em class="qz-fb qz-good">Right. It makes the switch's variable delay visible — which is precisely the error NTP cannot see.</em></label>
<label class="qz-opt"><input type="radio" name="t3"><span>It blocks PTP to prevent loops</span><em class="qz-fb qz-bad">No such function exists.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q4</span><code>show ntp associations</code> shows <code>reach 377</code>. What is that telling you?</p>
<label class="qz-opt"><input type="radio" name="t4"><span>All eight of the last eight polls were answered</span><em class="qz-fb qz-good">Correct — it is an octal shift register of the last eight attempts, and 377 octal is eight ones. A decaying value means packet loss.</em></label>
<label class="qz-opt"><input type="radio" name="t4"><span>The peer is 377 milliseconds away</span><em class="qz-fb qz-bad">That is the delay column.</em></label>
<label class="qz-opt"><input type="radio" name="t4"><span>377 polls have been sent since boot</span><em class="qz-fb qz-bad">It is a bitmap, not a counter, and it never exceeds 377 octal.</em></label>
</div>

---

## References

- **RFC 5905** — Network Time Protocol Version 4: Protocol and Algorithms Specification.
- **RFC 8915** — Network Time Security for NTP.
- **IEEE 1588-2019** — Precision Time Protocol.
- Cisco — [Configuring NTP](https://www.cisco.com/c/en/us/td/docs/ios-xml/ios/bsm/configuration/xe-16/bsm-xe-16-book/bsm-time-calendar-set.html)
- Cisco — [Use Best Practices for NTP](https://www.cisco.com/c/en/us/support/docs/availability/high-availability/19643-ntpm.html)

---

*Part of the [CCNA, ENCOR and ENARSI topic-by-topic study guide](/blog/ccna-ccnp-study-guide).*
