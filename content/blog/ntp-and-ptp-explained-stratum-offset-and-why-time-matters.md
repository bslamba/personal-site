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

Every exchange collects **four timestamps**.

<figure class="fig">
<svg viewBox="0 0 640 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="NTP four timestamp exchange between client and server">
  <style>
    .ln{stroke:#232327;stroke-width:1.5}
    .pk{stroke:#D3002D;stroke-width:2;marker-end:url(#p)}
    .pk2{stroke:#1f9d6b;stroke-width:2;marker-end:url(#q)}
    .h{font-family:ui-sans-serif,system-ui;font-size:12px;font-weight:800;fill:#17171A}
    .t{font-family:ui-monospace,monospace;font-size:11px;font-weight:700;fill:#D3002D}
    .t2{font-family:ui-monospace,monospace;font-size:11px;font-weight:700;fill:#1f9d6b}
    .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}
  </style>
  <defs>
    <marker id="p" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#D3002D"/></marker>
    <marker id="q" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#1f9d6b"/></marker>
  </defs>
  <text class="h" x="70" y="24" text-anchor="middle">CLIENT</text>
  <text class="h" x="500" y="24" text-anchor="middle">SERVER</text>
  <line class="ln" x1="70" y1="34" x2="70" y2="190"/>
  <line class="ln" x1="500" y1="34" x2="500" y2="190"/>
  <line class="pk" x1="76" y1="58" x2="494" y2="96"/>
  <text class="t" x="40" y="58">t1</text><text class="s" x="120" y="52">request leaves</text>
  <text class="t" x="516" y="98">t2</text><text class="s" x="516" y="112">arrives</text>
  <line class="pk2" x1="494" y1="130" x2="76" y2="170"/>
  <text class="t2" x="516" y="130">t3</text><text class="s" x="400" y="128">reply leaves</text>
  <text class="t2" x="40" y="172">t4</text><text class="s" x="96" y="186">reply arrives</text>
  <text class="s" x="320" y="206" text-anchor="middle">delay = (t4 − t1) − (t3 − t2)          offset = ((t2 − t1) + (t3 − t4)) / 2</text>
</svg>
<figcaption><b>Figure 1.</b> Round-trip time minus the server's own processing time gives the network delay. Halve it, and you know how stale the timestamp was when it arrived.</figcaption>
</figure>

- **Delay** = `(t4 − t1) − (t3 − t2)` — total elapsed, minus the time the server spent thinking. What is left is time on the wire.
- **Offset** = `((t2 − t1) + (t3 − t4)) / 2` — how far the client's clock is from the server's, assuming the path is symmetric.

That assumption is NTP's one weakness. If the forward path is 5 ms and the return path is 15 ms, NTP splits the difference and is wrong by 5 ms with no way to detect it. Asymmetric routing, a congested queue in one direction, or a WAN link with different upstream and downstream rates all produce this. **It is also exactly what PTP's hardware timestamping is designed to eliminate.**

NTP then does something important: **it does not just apply the offset.** It collects many samples, discards outliers, and *slews* the clock — speeding it up or slowing it down slightly until it converges. A clock that jumps backwards breaks databases and log ordering, so NTP avoids stepping unless the error is large (128 ms by default) and refuses entirely beyond 1000 seconds — at which point it logs and gives up, waiting for a human.

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

## Configuration

```cisco
! ---- Client: point at two or three sources ----
ntp server 10.0.0.10 prefer
ntp server 10.0.0.11
ntp server 216.239.35.0

! ---- Authenticate, so nobody can move your clock ----
ntp authentication-key 1 md5 <secret>
ntp authenticate
ntp trusted-key 1
ntp server 10.0.0.10 key 1

! ---- Restrict who may query or sync from you ----
access-list 20 permit 10.0.0.0 0.0.0.255
ntp access-group peer 20

! ---- Source from a loopback so the address never changes ----
ntp source Loopback0

! ---- Timestamps on everything, in UTC, with milliseconds ----
service timestamps log datetime msec localtime show-timezone
service timestamps debug datetime msec localtime show-timezone
clock timezone IST 5 30
```

Four of these deserve emphasis.

**Two or three servers, not one and not two.** One server cannot be checked. Two that disagree give you no way to know which is right. Three lets NTP discard the outlier — this is the actual reason for the recommendation, and it is a statistical argument, not a redundancy one.

**`prefer`** marks a source as preferred when several are otherwise equally good. It does not override a source that is clearly better.

**`ntp source Loopback0`** — if the router sources NTP from whichever interface the route happens to use, the source address changes when routing changes, and any server filtering by address stops accepting it.

**`service timestamps log datetime msec`** — without this, your logs are stamped with uptime (`00:04:12`) rather than a date. Correlating that against another device is guesswork. This one line is often worth more than the NTP configuration itself.

### Making a router a server

```cisco
! Distribute time to the rest of the estate
ntp master 3
```

`ntp master` makes the router an authoritative source at the stratum you specify, **using its own hardware clock** if nothing better is available. Useful at a branch that loses its WAN. Dangerous if you forget it: a router with a wrong clock will confidently serve wrong time to everything downstream.

### Reading it

```text
R1# show ntp status
Clock is synchronized, stratum 3, reference is 10.0.0.10
nominal freq is 250.0000 Hz, actual freq is 249.9999 Hz, precision is 2**18
reference time is E9A4F2C1.7B3D0A21 (14:22:09.481 IST Sun Sep 20 2026)
clock offset is 1.8420 msec, root delay is 24.51 msec
root dispersion is 41.22 msec, peer dispersion is 2.10 msec
```

```text
R1# show ntp associations
  address         ref clock       st   when   poll reach  delay  offset   disp
*~10.0.0.10       .GPS.            2     31     64   377  24.51   1.842   2.10
+~10.0.0.11       .GPS.            2     44     64   377  26.03   2.115   2.44
 ~216.239.35.0    .GOOG.           1    102   1024   357  88.14  -3.902  14.90
```

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
