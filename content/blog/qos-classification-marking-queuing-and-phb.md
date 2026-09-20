---
title: "QoS: Six Bits That Decide Who Waits"
excerpt: "QoS does not create bandwidth. It decides who suffers when there is not enough — and the entire mechanism comes down to six bits in the IP header plus a queue that reads them. Mark at the edge, trust nothing from users, and remember that a policer throws packets away while a shaper makes them wait."
date: "2026-09-21"
tags: ["QoS", "DSCP", "Queuing", "Policing", "Shaping", "CCNA", "ENCOR"]
draft: false
---

> **Blueprint:** CCNA 200-301 — 4.7 *Explain the forwarding per-hop behavior (PHB) for QoS such as classification, marking, queuing, congestion management, policing, shaping*. ENCOR 350-401 — 1.4 *Interpret QoS configurations*.

## Cheat sheet

| Marking | DSCP | ToS byte | For |
|---|---|---|---|
| **EF** | **46** | `0xB8` | **Voice.** Expedited Forwarding — the priority queue |
| **AF41** | 34 | `0x88` | Interactive video |
| **AF31** | 26 | `0x68` | Call signalling (older designs) |
| **CS6** | 48 | `0xC0` | **Routing protocols.** Never police this away |
| **CS3** | 24 | `0x60` | Call signalling (current) |
| **BE** | 0 | `0x00` | Everything else |

| Step | Does | Where |
|---|---|---|
| **Classification** | Identify the traffic | Edge |
| **Marking** | Write DSCP into the header | **Edge, once** |
| **Queuing** | Decide send order | Every hop |
| **Congestion avoidance** | **WRED** — drop early to prevent worse | Core |
| **Policing** | **Drops or re-marks** excess | Ingress, usually |
| **Shaping** | **Buffers** excess, smooths it out | Egress, usually |

| | |
|---|---|
| **PHB** | Per-Hop Behaviour — what one router does with a marking. **Each hop decides for itself** |
| **Trust boundary** | Where you stop believing other people's markings |
| **LLQ** | Priority queue with a policer on it |
| **DSCP** | 6 bits of the 8-bit ToS/Traffic Class byte |

**The sentence to carry.** DSCP is **not a service level** — it is a **request**, re-evaluated independently at every hop. A packet marked EF that crosses a router with no QoS policy is an ordinary packet on that router. **QoS is only as good as the weakest hop on the path**, and across an ISP your markings are usually rewritten or ignored entirely.

---

## Why this exists at all

<figure class="fig">
<svg class="sv1" viewBox="0 0 640 265" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Without QoS voice packets queue behind a large file transfer and arrive late">
  <style>.sv1 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv1 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv1 .hdr{font-family:ui-sans-serif,system-ui;font-size:10px;font-weight:700;letter-spacing:.06em;fill:#8A8A93}.sv1 .big{fill:#B5B5BC}.sv1 .voice{fill:#D3002D}
  </style>
  <text class="hdr" x="14" y="20">ONE QUEUE, FIRST IN FIRST OUT</text>
  <rect class="big" x="14" y="30" width="70" height="22"/><rect class="big" x="88" y="30" width="70" height="22"/>
  <rect class="big" x="162" y="30" width="70" height="22"/><rect class="big" x="236" y="30" width="70" height="22"/>
  <rect class="voice" x="310" y="30" width="16" height="22"/>
  <rect class="big" x="330" y="30" width="70" height="22"/><rect class="big" x="404" y="30" width="70" height="22"/>
  <rect class="voice" x="478" y="30" width="16" height="22"/>
  <rect class="big" x="498" y="30" width="70" height="22"/>
  <text class="s" x="14" y="68">grey = 1500-byte file transfer     red = 160-byte voice packet</text>
  <text class="s" x="14" y="88">Each big packet ahead of the voice packet adds delay. On a slow link that is milliseconds each.</text>
  <text class="hdr" x="14" y="122">TWO QUEUES, PRIORITY FIRST</text>
  <rect class="voice" x="14" y="132" width="16" height="22"/><rect class="voice" x="34" y="132" width="16" height="22"/>
  <text class="s" x="60" y="148">priority queue — served first, always</text>
  <rect class="big" x="14" y="162" width="70" height="22"/><rect class="big" x="88" y="162" width="70" height="22"/>
  <rect class="big" x="162" y="162" width="70" height="22"/><rect class="big" x="236" y="162" width="70" height="22"/>
  <text class="s" x="320" y="178">everything else waits</text>
  <rect x="14" y="200" width="612" height="56" fill="rgba(31,157,107,.10)" stroke="#1f9d6b"/>
  <text class="k" x="26" y="220" fill="#0f6b47">QoS creates no bandwidth. It chooses who waits.</text>
  <text class="s" x="26" y="240">On an uncongested link it does nothing at all. It only ever matters at the moment packets queue —</text>
  <text class="s" x="26" y="252">which is exactly the moment the complaint arrives.</text>
</svg>
<figcaption><b>Figure 1.</b> A voice packet stuck behind four full-size frames is late. Nothing about the link changed — only the order.</figcaption>
</figure>

<div class="why">
<b>QoS is a losing-gracefully mechanism</b>
If the link is not congested, QoS does nothing — packets go straight out and every queue is empty. It engages only when more traffic arrives than can leave, and then it decides what gets dropped and what gets delayed.
<br><br>Which leads to the honest framing: <b>QoS cannot fix a link that is simply too small.</b> It can keep voice usable on a congested link while file transfers slow down, and that is genuinely valuable. It cannot make everything fast at once. If every class is starved, the answer is more bandwidth, and no policy will substitute for it.
</div>

---

## Six bits, and what happens to them

<div class="walk">
<div class="walk-head">A packet's journey through a QoS policy <span class="walk-hint">click a step</span></div>
<div class="walk-tabs">
  <input type="radio" name="qsw" id="qs1" checked><label for="qs1"><span class="step-n">1</span>The byte</label>
  <input type="radio" name="qsw" id="qs2"><label for="qs2"><span class="step-n">2</span>Trust boundary</label>
  <input type="radio" name="qsw" id="qs3"><label for="qs3"><span class="step-n">3</span>Police vs shape</label>
  <input type="radio" name="qsw" id="qs4"><label for="qs4"><span class="step-n">4</span>The queue</label>
</div>
<div class="walk-panels">
<div class="walk-panel">
<svg class="sv2" viewBox="0 0 640 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The DSCP field occupies the top six bits of the IP type of service byte">
  <style>.sv2 .m{font-family:ui-monospace,Menlo,monospace;font-size:11px;fill:#17171A}.sv2 .s{font-family:ui-sans-serif,system-ui;font-size:10px;fill:#5C5C64}.sv2 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv2 .d{fill:rgba(75,123,236,.20);stroke:#4b7bec}.sv2 .e{fill:#F1EEE9;stroke:#B5B5BC}</style>
  <rect class="d" x="60" y="34" width="60" height="34"/><text class="m" x="90" y="56" text-anchor="middle">1</text>
  <rect class="d" x="122" y="34" width="60" height="34"/><text class="m" x="152" y="56" text-anchor="middle">0</text>
  <rect class="d" x="184" y="34" width="60" height="34"/><text class="m" x="214" y="56" text-anchor="middle">1</text>
  <rect class="d" x="246" y="34" width="60" height="34"/><text class="m" x="276" y="56" text-anchor="middle">1</text>
  <rect class="d" x="308" y="34" width="60" height="34"/><text class="m" x="338" y="56" text-anchor="middle">1</text>
  <rect class="d" x="370" y="34" width="60" height="34"/><text class="m" x="400" y="56" text-anchor="middle">0</text>
  <rect class="e" x="432" y="34" width="60" height="34"/><text class="m" x="462" y="56" text-anchor="middle">0</text>
  <rect class="e" x="494" y="34" width="60" height="34"/><text class="m" x="524" y="56" text-anchor="middle">0</text>
  <text class="s" x="276" y="86" text-anchor="middle">DSCP — 6 bits</text>
  <text class="s" x="493" y="86" text-anchor="middle">ECN — 2 bits</text>
  <text class="m" x="14" y="56">ToS</text>
  <text class="k" x="60" y="124">101110 = 46 = EF.  The whole byte is 0xB8, because DSCP sits in the TOP six bits.</text>
  <text class="s" x="60" y="150">That shift is where the confusion comes from: DSCP 46 is written as a byte value of 184.</text>
  <text class="s" x="60" y="168">A capture shows 0xb8; a router shows dscp ef. Same thing, shifted left by two.</text>
  <text class="s" x="60" y="192">In IPv6 the identical six bits live in the Traffic Class field. Nothing else changes.</text>
</svg>
<p class="walk-say"><span class="walk-title">DSCP is the top six bits of one byte</span>
The old IP Precedence used the top <i>three</i> bits, which is why the Class Selector values (CS1–CS7) are just precedence values shifted into DSCP — <b>CS3 = 24 = precedence 3</b>. Backward compatibility, preserved in the numbering.
<br><br>The bottom two bits are <b>ECN</b>, which is a different mechanism entirely: a router marks them instead of dropping, and the receiver tells the sender to slow down. <b>Rewriting the whole ToS byte destroys ECN</b>, so set DSCP as DSCP rather than writing raw byte values.</p>
</div>
<div class="walk-panel">
<svg class="sv3" viewBox="0 0 640 205" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Markings from untrusted devices are cleared at the access port while trusted phones are believed">
  <style>.sv3 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv3 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv3 .m{font-family:ui-monospace,Menlo,monospace;font-size:10px;fill:#17171A}.sv3 .n{fill:#17171A}.sv3 .nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:10px;font-weight:700}</style>
  <rect class="n" x="20" y="34" width="86" height="26" rx="3"/><text class="nt" x="63" y="52" text-anchor="middle">PC</text>
  <rect class="n" x="20" y="88" width="86" height="26" rx="3"/><text class="nt" x="63" y="106" text-anchor="middle">IP phone</text>
  <rect class="n" x="280" y="60" width="96" height="30" rx="3"/><text class="nt" x="328" y="80" text-anchor="middle">SW1</text>
  <path d="M 106 47 L 280 68" stroke="#D3002D" stroke-width="2" fill="none"/>
  <path d="M 106 101 L 280 82" stroke="#1f9d6b" stroke-width="2" fill="none"/>
  <text class="m" x="150" y="38" fill="#B80027">"I am EF"</text>
  <text class="m" x="150" y="128" fill="#0f6b47">EF (believed)</text>
  <path d="M 376 75 L 560 75" stroke="#8A8A93" stroke-width="2" fill="none"/>
  <text class="m" x="400" y="66">re-marked to 0</text>
  <rect x="14" y="146" width="612" height="52" fill="rgba(211,0,45,.08)" stroke="#D3002D"/>
  <text class="k" x="26" y="166" fill="#B80027">Any PC can mark its own packets EF. A game, a download, anything.</text>
  <text class="s" x="26" y="184">Trust nothing from a user port, and the priority queue stays for the traffic that needs it.</text>
</svg>
<p class="walk-say"><span class="walk-title">The trust boundary is the whole design</span>
Marking is <b>free for anyone to do</b>. An application on a laptop can set EF on every packet it sends, and without a trust boundary your priority queue fills with somebody's download.
<br><br>So the rule: <b>clear markings on user-facing ports, mark deliberately at the edge, and trust markings from there inward.</b> Push it out as far as you can — the earlier you classify, the fewer places need complex policy.
<br><br>The common exception is an <b>IP phone</b>, which is trusted conditionally: the switch trusts it only if CDP confirms a phone is really there, and untrusts the port the moment it is unplugged.</p>
</div>
<div class="walk-panel">
<svg class="sv4" viewBox="0 0 640 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A policer drops traffic above the rate while a shaper buffers it and sends it later">
  <style>.sv4 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv4 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv4 .hdr{font-family:ui-sans-serif,system-ui;font-size:10px;font-weight:700;letter-spacing:.06em;fill:#8A8A93}</style>
  <text class="hdr" x="14" y="18">POLICER — drops the excess</text>
  <line x1="14" y1="76" x2="300" y2="76" stroke="#D3002D" stroke-width="1.5" stroke-dasharray="4 3"/>
  <path d="M 14 96 L 50 96 L 50 46 L 90 46 L 90 96 L 140 96 L 140 40 L 180 40 L 180 96 L 300 96" fill="none" stroke="#B5B5BC" stroke-width="1.5"/>
  <path d="M 14 96 L 50 96 L 50 76 L 90 76 L 90 96 L 140 96 L 140 76 L 180 76 L 180 96 L 300 96" fill="none" stroke="#4b7bec" stroke-width="2.5"/>
  <text class="s" x="200" y="64" fill="#B80027">this is discarded</text>
  <text class="hdr" x="336" y="18">SHAPER — delays the excess</text>
  <line x1="336" y1="76" x2="626" y2="76" stroke="#1f9d6b" stroke-width="1.5" stroke-dasharray="4 3"/>
  <path d="M 336 96 L 372 96 L 372 46 L 412 46 L 412 96 L 462 96 L 462 40 L 502 40 L 502 96 L 626 96" fill="none" stroke="#B5B5BC" stroke-width="1.5"/>
  <path d="M 336 96 L 372 96 L 372 76 L 452 76 L 452 96 L 462 96 L 462 76 L 560 76 L 560 96 L 626 96" fill="none" stroke="#1f9d6b" stroke-width="2.5"/>
  <text class="s" x="470" y="64" fill="#0f6b47">buffered, sent later</text>
  <rect x="14" y="120" width="612" height="80" fill="#F1EEE9" stroke="#B5B5BC"/>
  <text class="k" x="26" y="142">Policing wastes bandwidth with TCP. Shaping costs delay.</text>
  <text class="s" x="26" y="162">A policer drops mid-stream, TCP retransmits, and you pay for the same bytes twice. A shaper queues</text>
  <text class="s" x="26" y="178">instead — better for TCP, worse for voice, and it needs buffer memory.</text>
  <text class="s" x="26" y="194">Rule of thumb: <tspan font-weight="700">shape on egress toward a slower link, police on ingress to enforce a contract.</tspan></text>
</svg>
<p class="walk-say"><span class="walk-title">Drop, or delay — pick deliberately</span>
Both limit a rate; they differ in what happens to the excess. <b>A policer discards it</b> (or re-marks it down). <b>A shaper buffers it</b> and sends it when the token bucket allows.
<br><br>The practical consequence is about TCP. Policing a TCP flow causes retransmissions, so you transmit the same data twice and still lose it once — <b>throughput can end up well below the policed rate</b>. Shaping keeps TCP happy because delay just looks like a slower link.
<br><br>The classic use for shaping: you have a 1 Gbps physical handoff with a <b>200 Mbps contract</b>. Shape to 200 on egress and queue your own traffic sensibly, or the provider polices it and chooses for you — at random.</p>
</div>
<div class="walk-panel">
<svg class="sv5" viewBox="0 0 640 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Low latency queuing serves the priority queue first but polices it so other classes are not starved">
  <style>.sv5 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv5 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv5 .m{font-family:ui-monospace,Menlo,monospace;font-size:10px;fill:#17171A}.sv5 .pq{fill:rgba(211,0,45,.16);stroke:#D3002D}.sv5 .q{fill:#F1EEE9;stroke:#B5B5BC}</style>
  <rect class="pq" x="14" y="30" width="230" height="30"/><text class="m" x="129" y="50" text-anchor="middle">PRIORITY — voice (EF)</text>
  <rect class="q" x="14" y="66" width="230" height="26"/><text class="m" x="129" y="84" text-anchor="middle">video (AF41)  ·  30%</text>
  <rect class="q" x="14" y="98" width="230" height="26"/><text class="m" x="129" y="116" text-anchor="middle">signalling (CS3)  ·  5%</text>
  <rect class="q" x="14" y="130" width="230" height="26"/><text class="m" x="129" y="148" text-anchor="middle">class-default  ·  the rest</text>
  <text class="k" x="266" y="50" fill="#B80027">served first, always</text>
  <text class="s" x="266" y="74">but capped by a built-in policer</text>
  <text class="s" x="266" y="92">— otherwise it could starve</text>
  <text class="s" x="266" y="110">everything below it</text>
  <rect x="14" y="170" width="612" height="34" fill="rgba(211,0,45,.08)" stroke="#D3002D"/>
  <text class="k" x="26" y="191" fill="#B80027">Keep the priority queue under ~33%. Above that, everything else starves during congestion.</text>
</svg>
<p class="walk-say"><span class="walk-title">LLQ — a priority queue with a limit on it</span>
<b>Low Latency Queuing</b> is CBWFQ plus one strict-priority queue. Voice goes in the priority queue and is always served first, so its delay stays low no matter what else is happening.
<br><br>The catch is that a strict-priority queue would starve everything else if it were unbounded — so <b>LLQ polices it</b>. Traffic above the configured priority rate is dropped, not queued. <b>Undersize the priority bandwidth and you are dropping voice</b>, which is the worst possible outcome and shows up as <code>(drops)</code> in the priority class of <code>show policy-map interface</code>.
<br><br>Keep the priority class under about a third of the link. Above that, the classes below it get nothing when it matters.</p>
</div>
</div>
</div>

---

## Configuration, word by word

<div class="cmd">
<div class="cmd-line"><span class="opt">! 1 — classify</span>
<span class="t">class-map match-any</span> <span class="opt">VOICE</span>
 <span class="t">match dscp</span> <span class="opt">ef</span>
<span class="t">class-map match-any</span> <span class="opt">VIDEO</span>
 <span class="t">match dscp</span> <span class="opt">af41 af42 af43</span>
<span class="t">class-map match-any</span> <span class="opt">SIGNALLING</span>
 <span class="t">match dscp</span> <span class="opt">cs3 af31</span>
!
<span class="opt">! 2 — decide what happens to each class</span>
<span class="t">policy-map</span> <span class="opt">WAN-OUT</span>
 <span class="t">class</span> <span class="opt">VOICE</span>
  <span class="t">priority percent</span> <span class="opt">20</span>
 <span class="t">class</span> <span class="opt">VIDEO</span>
  <span class="t">bandwidth percent</span> <span class="opt">30</span>
  <span class="t">random-detect dscp-based</span>
 <span class="t">class</span> <span class="opt">SIGNALLING</span>
  <span class="t">bandwidth percent</span> <span class="opt">5</span>
 <span class="t">class class-default</span>
  <span class="t">fair-queue</span>
  <span class="t">random-detect</span>
!
<span class="opt">! 3 — shape to the contract, apply the policy inside it</span>
<span class="t">policy-map</span> <span class="opt">WAN-SHAPE</span>
 <span class="t">class class-default</span>
  <span class="t">shape average</span> <span class="opt">200000000</span>
  <span class="t">service-policy</span> <span class="opt">WAN-OUT</span>
!
<span class="t">interface</span> <span class="opt">GigabitEthernet0/1</span>
 <span class="t">service-policy output</span> <span class="opt">WAN-SHAPE</span></div>
<dl class="cmd-parts">
<div><dt>class-map match-any</dt><dd><b><code>match-any</code></b> = any one condition matches. <b><code>match-all</code></b> (the default) = every condition must. Getting this backwards silently classifies nothing, and nothing warns you.</dd></div>
<div class="is-key"><dt>priority percent 20</dt><dd><b>Strict priority — and an implicit policer.</b> Voice is always served first, and anything above 20% of the link is <b>dropped, not queued</b>. That is the trade: bounded delay for the class, at the cost of hard drops if you size it too small. <b>Keep the total priority under about a third of the link.</b></dd></div>
<div><dt>bandwidth percent 30</dt><dd>A <b>guaranteed minimum</b> during congestion, not a cap. If other classes are idle this class may use more. People read it as a limit and then wonder why a class exceeds it.</dd></div>
<div class="is-key"><dt>random-detect</dt><dd><b>WRED — drop a few packets early, deliberately.</b> Without it a full queue tail-drops, every TCP flow backs off at the same instant, then all ramp up together: <b>global synchronisation</b>, a sawtooth, and a link that is alternately full and idle. Dropping a little early and randomly keeps flows out of step. <b>Never apply it to voice</b> — UDP does not back off, so you are simply destroying calls.</dd></div>
<div><dt>fair-queue</dt><dd>In class-default, shares fairly among flows so one big transfer cannot dominate everything else unclassified.</dd></div>
<div class="is-key"><dt>shape average 200000000</dt><dd><b>The hierarchical bit, and it is the part people miss.</b> On a 1 Gbps physical port with a 200 Mbps contract, the interface never appears congested — so the queuing policy never engages, and the provider polices you instead. <b>Shaping to the contract creates the congestion point on your own router</b>, where your policy can manage it.</dd></div>
<div><dt>service-policy WAN-OUT<br>(nested)</dt><dd>The child policy runs <i>inside</i> the shaper. Classes compete for the shaped 200 Mbps rather than the physical 1 Gbps. Without nesting, the percentages are calculated against the wrong number.</dd></div>
</dl>
</div>

<div class="cmd">
<div class="cmd-line"><span class="opt">! the trust boundary, at the access port</span>
<span class="t">interface</span> <span class="opt">GigabitEthernet1/0/10</span>
 <span class="t">switchport access vlan</span> <span class="opt">20</span>
 <span class="t">switchport voice vlan</span> <span class="opt">110</span>
 <span class="t">trust device cisco-phone</span>
 <span class="t">service-policy input</span> <span class="opt">MARK-AT-EDGE</span></div>
<dl class="cmd-parts">
<div class="is-key"><dt>trust device cisco-phone</dt><dd><b>Conditional trust.</b> The port trusts incoming DSCP only while CDP confirms a Cisco phone is attached; unplug it and the port stops trusting immediately. Without this, whatever the PC behind the phone marks is believed.</dd></div>
<div><dt>switchport voice vlan</dt><dd>Separates phone traffic into its own VLAN while the PC stays untagged in the access VLAN — one cable, two VLANs, and a clean place to apply different policy.</dd></div>
<div class="is-key"><dt>service-policy input</dt><dd><b>Mark once, at the edge.</b> Every hop afterwards classifies on DSCP alone, which is cheap. Re-classifying on ports and addresses at every hop is expensive, fragile, and breaks the moment an application changes port.</dd></div>
</dl>
</div>

---

## Reading it

<div class="term">
<div class="term-bar"><span class="term-dots"><i></i><i></i><i></i></span>R1 — one command answers almost everything</div>
<pre><span class="p">R1#</span> <span class="c">show policy-map interface GigabitEthernet0/1</span>
 GigabitEthernet0/1
  Service-policy output: WAN-SHAPE

    Class-map: class-default (match-any)
      Queueing
      queue limit 416 packets
      <span class="y">(queue depth/total drops/no-buffer drops) 0/1204/0</span>
      shape (average) cir 200000000, bc 800000, be 800000
      <span class="g">target shape rate 200000000</span>

      Service-policy : WAN-OUT

        Class-map: VOICE (match-any)
          <span class="g">Match:  dscp ef (46)</span>
          <span class="g">1884221 packets, 301475360 bytes</span>
          Priority: 20% (40000 kbps), burst bytes 1000000,
          <span class="r">Priority Queue: Conversion drops 0, (drops) 3841</span>
                                                 <span class="o">^^^^^^ voice being DROPPED</span>
                                                 <span class="o">priority bandwidth too small</span>

        Class-map: VIDEO (match-any)
          Match:  dscp af41 (34) af42 (36) af43 (38)
          <span class="r">0 packets, 0 bytes</span>          <span class="o">&lt;- nothing matching. Marking is wrong upstream.</span>
          bandwidth 30% (60000 kbps)

        Class-map: class-default (match-any)
          <span class="y">18449201 packets</span>
          <span class="y">(drops) 44821</span>                <span class="o">&lt;- normal. This is QoS working.</span><span class="cur"></span></pre>
</div>
<p class="term-cap"><b>Two numbers tell you nearly everything.</b> <b>Zero packets in a class</b> means your classification does not match reality — traffic is not marked the way you assumed, which is usually a trust-boundary problem. <b>Drops in the priority class</b> means you are discarding voice: the priority bandwidth is too small. Drops in class-default are expected and are the policy doing its job.</p>

<div class="real">
<b>In the real world</b>
QoS is mostly deployed for one reason: <b>voice on a WAN link</b>. Everything else is usually left to best effort, and that is a defensible design.
<br><br>The part that surprises people is <b>the DSCP you set does not survive the internet</b>. Providers re-mark or ignore it, usually flattening everything to zero, sometimes honouring a small agreed set if you pay for it. QoS is enforceable on links you control — your LAN, your WAN edge, your MPLS service where the contract says so. Across the public internet it is a hope.
<br><br>Which is why the highest-value QoS work is almost always at <b>the WAN edge</b>, shaped to the contract rate, with a priority queue sized for the actual number of concurrent calls — not a percentage somebody copied from a design guide.
</div>

---

## What goes wrong

**A class shows 0 packets.** Classification does not match what is arriving. Check markings upstream and the trust boundary.

**Drops in the priority class.** Priority bandwidth too small. You are dropping voice.

**Policy configured, never engages.** The physical interface is never congested — shape to the contract rate.

**`match-all` instead of `match-any`.** Silently matches nothing.

**Users mark their own traffic EF.** No trust boundary on access ports.

**TCP throughput below the policed rate.** Policing causes retransmissions. Shape instead.

**Everything degraded together.** The link is genuinely too small. QoS cannot fix that.

---

<div class="lab">
<div class="lab-head">Lab — congest a link, then fix only the traffic that matters</div>
<div class="lab-body">

<div class="lab-target"><b>Target</b>
Saturate a slow link and measure what happens to a voice-like stream with no QoS. Add a policy and measure the difference in jitter and loss. Then break it three ways on purpose: undersize the priority queue, forget the shaper, and mark from an untrusted host.</div>

**Topology.** Two routers with a deliberately slow link between them (`clock rate 512000` on serial, or shape to 2 Mbps on Ethernet). Linux hosts each side with `iperf3`.

<p class="lab-step"><span class="n">1</span>Measure the damage first</p>

Start a UDP stream shaped like voice, and a TCP flood alongside it.

```bash
iperf3 -c <far> -u -b 128k -l 160 -t 60      # the "call"
iperf3 -c <far> -P 8 -t 60                   # the flood
```

<div class="lab-watch"><b>Things to notice</b>
Run the UDP stream alone first and record jitter and loss — both near zero. Then start the flood and watch <b>jitter climb and loss appear</b>.
<br><br>This is the baseline, and it is worth having in numbers. <b>"The calls are bad when people use the internet" is now a measurement</b> rather than a report. Correlate it with <a href="/blog/ip-sla-probes-jitter-and-tracking-objects">an IP SLA jitter probe</a> for the same picture from the router's own perspective.</div>

<p class="lab-step"><span class="n">2</span>Mark, classify, prioritise</p>

Mark the voice stream EF at the ingress edge, build the class-map and policy-map, apply outbound on the congested link.

```cisco
R1# show policy-map interface <link>
```

<div class="lab-watch"><b>Things to notice</b>
The VOICE class counter should climb. <b>If it shows 0 packets, your marking is not arriving</b> — check the ingress policy before touching anything else.
<br><br>Re-run both streams. <b>Jitter and loss on the voice stream should collapse to near zero while TCP throughput drops.</b> That is the trade, measured: you did not create bandwidth, you chose who waits.</div>

<p class="lab-step"><span class="n">3</span>Undersize the priority queue on purpose</p>

Set `priority percent 1` and re-run.

<div class="lab-issues"><b>Possible issues</b>
<ul>
<li><b>No drops appear</b> — your stream fits within 1%. Increase its rate or lower the percentage further.</li>
<li><b>Everything is bad</b> — the flood is saturating beyond what the policy can help; that is a separate lesson.</li>
<li><b>Counters do not move</b> — clear them with <code>clear counters</code> between runs.</li>
</ul>
Watch <b><code>Priority Queue: … (drops)</code></b> increment. <b>You are now dropping voice deliberately, with a QoS policy in place.</b> Users would report worse quality than with no QoS at all — which is why that counter is the first place to look when "QoS made it worse".</div>

<p class="lab-step"><span class="n">4</span>Forget the shaper</p>

On a gigabit link with a 10 Mbps bottleneck downstream, apply the queuing policy directly to the interface.

<div class="lab-watch"><b>Things to notice</b>
<b>The policy never engages.</b> All counters show packets matched and no drops, because the gigabit interface is never congested — the congestion is downstream, where you have no control.
<br><br>Wrap it in <code>shape average 10000000</code> and re-apply. <b>Now the queue forms on your router</b>, your policy manages it, and the voice stream recovers. This is the single most common reason a correct-looking QoS config does nothing.</div>

<p class="lab-step"><span class="n">5</span>Mark your own traffic EF from a PC</p>

```bash
iperf3 -c <far> -P 8 --tos 0xb8 -t 60
```

<div class="lab-watch"><b>Things to notice</b>
With no trust boundary, <b>the flood enters the priority queue</b> and destroys the real voice stream — which is also in there, now competing and being policed.
<br><br><code>0xb8</code> is DSCP 46 shifted left by two. Any user can do this from a laptop with no special privileges. Add an ingress policy on the access port that re-marks everything from the PC to 0, re-run, and watch the flood drop back into class-default where it belongs.</div>

<p class="lab-step"><span class="n">6</span>Police versus shape, measured</p>

Limit the TCP flow to 5 Mbps with `police` on ingress. Record throughput. Then do it with `shape` on egress instead.

<div class="lab-watch"><b>Things to notice</b>
The policed TCP flow typically achieves <b>noticeably less than 5 Mbps</b>, because drops cause retransmissions and repeated backoff. The shaped one sits much closer to the target.
<br><br><b>Same rate limit, different throughput</b> — that is the case for shaping TCP in a single measurement. Then check latency on the shaped path: it is higher, because the excess is queued rather than discarded. Both costs are real; pick the one you can afford.</div>

<div class="lab-earned"><b>What you earned</b>
You have measured voice quality degrading under congestion and then recovering under policy, so QoS is a number rather than a belief. You know the two diagnostic signals in <code>show policy-map interface</code>: a class with zero packets, and drops in the priority queue. You have seen a correct policy do nothing because the interface was never congested, and fixed it with a shaper. You have marked your own traffic EF from a laptop, which is the trust-boundary argument in one command. And you have measured policing costing more throughput than shaping at the same rate.</div>

</div>
</div>

---

## Test yourself

<div class="qz">
<p class="qz-q"><span class="qz-num">Q1</span>What is the difference between policing and shaping?</p>
<label class="qz-opt"><input type="radio" name="qq1"><span>A policer drops or re-marks excess; a shaper buffers it and sends it later</span><em class="qz-fb qz-good">Correct — which is why policing hurts TCP throughput and shaping costs delay instead.</em></label>
<label class="qz-opt"><input type="radio" name="qq1"><span>Policing is egress, shaping is ingress</span><em class="qz-fb qz-bad">Usually the other way round, and it is a convention rather than the defining difference.</em></label>
<label class="qz-opt"><input type="radio" name="qq1"><span>Shaping applies only to voice</span><em class="qz-fb qz-bad">Shaping suits TCP well; voice prefers low delay, so it belongs in a priority queue.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q2</span>Which DSCP value is EF, and what is the resulting ToS byte?</p>
<label class="qz-opt"><input type="radio" name="qq2"><span>DSCP 46, ToS byte 0xB8</span><em class="qz-fb qz-good">Correct — DSCP occupies the top six bits, so 46 shifted left by two gives 184 (0xB8).</em></label>
<label class="qz-opt"><input type="radio" name="qq2"><span>DSCP 46, ToS byte 0x2E</span><em class="qz-fb qz-bad">0x2E is 46 unshifted — that is the DSCP value, not the byte on the wire.</em></label>
<label class="qz-opt"><input type="radio" name="qq2"><span>DSCP 34, ToS byte 0x88</span><em class="qz-fb qz-bad">That is AF41.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q3</span>A QoS class shows 0 packets matched. What does that mean?</p>
<label class="qz-opt"><input type="radio" name="qq3"><span>Traffic is not arriving marked the way the class-map expects</span><em class="qz-fb qz-good">Correct — usually a missing or wrong marking upstream, or a trust boundary clearing it.</em></label>
<label class="qz-opt"><input type="radio" name="qq3"><span>The class has no bandwidth allocated</span><em class="qz-fb qz-bad">Bandwidth affects treatment, not matching.</em></label>
<label class="qz-opt"><input type="radio" name="qq3"><span>The link is not congested</span><em class="qz-fb qz-bad">Matching counts happen regardless of congestion.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q4</span>Why does a priority queue have a built-in policer?</p>
<label class="qz-opt"><input type="radio" name="qq4"><span>Otherwise strict priority would starve every other class during congestion</span><em class="qz-fb qz-good">Correct — and the consequence is that undersizing the priority bandwidth means dropping voice.</em></label>
<label class="qz-opt"><input type="radio" name="qq4"><span>To re-mark voice traffic</span><em class="qz-fb qz-bad">Re-marking is a separate action.</em></label>
<label class="qz-opt"><input type="radio" name="qq4"><span>To reduce jitter</span><em class="qz-fb qz-bad">Priority handling reduces jitter; the policer is there to protect the other classes.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q5</span>A correct-looking policy on a 1 Gbps interface never engages. The real bottleneck is a 50 Mbps contract. What is missing?</p>
<label class="qz-opt"><input type="radio" name="qq5"><span>A shaper at the contract rate, with the queuing policy nested inside it</span><em class="qz-fb qz-good">Correct — the interface is never congested, so no queue ever forms where your policy can act.</em></label>
<label class="qz-opt"><input type="radio" name="qq5"><span>More priority bandwidth</span><em class="qz-fb qz-bad">The policy is not engaging at all, so its sizing is irrelevant.</em></label>
<label class="qz-opt"><input type="radio" name="qq5"><span>The policy should be applied inbound</span><em class="qz-fb qz-bad">Queuing happens on egress; inbound cannot manage an outbound queue.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q6</span>What does WRED prevent, and where must it never go?</p>
<label class="qz-opt"><input type="radio" name="qq6"><span>Global TCP synchronisation — and never on voice, because UDP does not back off</span><em class="qz-fb qz-good">Correct. Dropping voice packets early achieves nothing except worse calls.</em></label>
<label class="qz-opt"><input type="radio" name="qq6"><span>Packet reordering, and never on TCP</span><em class="qz-fb qz-bad">Backwards — WRED exists precisely to manage TCP behaviour.</em></label>
<label class="qz-opt"><input type="radio" name="qq6"><span>Buffer exhaustion, and never in class-default</span><em class="qz-fb qz-bad">class-default is exactly where it belongs.</em></label>
</div>

---

## References

- **RFC 2474** — *Definition of the Differentiated Services Field (DS Field)*. Where DSCP is defined.
- **RFC 2475** — *An Architecture for Differentiated Services*. Where "per-hop behaviour" comes from.
- **RFC 3246** — *An Expedited Forwarding PHB*.
- **RFC 2597** — *Assured Forwarding PHB Group*.
- Cisco — [Enterprise QoS Solution Reference Network Design Guide](https://www.cisco.com/c/en/us/td/docs/solutions/Enterprise/WAN_and_MAN/QoS_SRND/QoS-SRND-Book.html) — the source of most of the marking conventions above.

---

*Related: [IP SLA: jitter and tracking](/blog/ip-sla-probes-jitter-and-tracking-objects) · [Wireless principles](/blog/wireless-principles-rf-channels-and-ap-modes) · [Policy-based routing](/blog/policy-based-routing-pbr-explained).*

*Part of the [CCNA, ENCOR and ENARSI topic-by-topic study guide](/blog/ccna-ccnp-study-guide).*
