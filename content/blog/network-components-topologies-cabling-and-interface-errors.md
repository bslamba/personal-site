---
title: "Components, Topologies and the Cable: Reading What an Interface Is Telling You"
excerpt: "Counters are the most under-read diagnostic in networking. CRC errors without collisions mean a physical fault; collisions on a modern link mean a duplex mismatch; input drops mean the buffer ran out. Each points somewhere specific, and almost nobody looks."
date: "2026-09-21"
tags: ["Fundamentals", "Cabling", "Fiber", "Duplex", "Troubleshooting", "CCNA"]
draft: false
---

> **Blueprint:** CCNA 200-301 — 1.1 *Explain the role and function of network components*, 1.2 *Describe characteristics of network topology architectures*, 1.3 *Compare physical interface and cabling types*, 1.4 *Identify interface and cable issues (collisions, errors, mismatch duplex, and/or speed)*.

## Cheat sheet

| Counter | Almost always means |
|---|---|
| **CRC errors**, no collisions | **Physical** — bad cable, connector, SFP, or EMI |
| **Collisions** on a modern link | **Duplex mismatch.** Full duplex has no collisions |
| **Late collisions** | Cable too long, or duplex mismatch |
| **Input errors** = CRC + frame + overrun | Look at the breakdown, not the total |
| **Input drops** | Buffer full — the device could not keep up |
| **Output drops** | **Congestion.** Normal in small numbers; this is a QoS question |
| **Runts** | Frames under 64 bytes — collisions or a faulty NIC |
| **Giants** | Over MTU — usually an unexpected tag or jumbo mismatch |
| **Interface resets** | The link is flapping |

| Cable | Distance | Note |
|---|---|---|
| **Cat5e** | 100 m | 1 Gbps |
| **Cat6 / 6a** | 100 m (55 m for 10G on Cat6) | Cat6a does 10G to 100 m |
| **MMF (OM3/OM4)** | ~300–400 m at 10G | **Short reach**, cheaper optics |
| **SMF (OS2)** | **Kilometres** | Long reach, costlier optics |

| Topology | Is |
|---|---|
| **2-tier (collapsed core)** | Access + distribution/core. Most enterprises |
| **3-tier** | Access, distribution, core. Large campus |
| **Spine-leaf** | Every leaf to every spine. **Equal hops** — data centre |
| **WAN / SOHO** | Branch, hub, small office |

**The sentence worth carrying.** **Auto-negotiation failing is not the same as auto-negotiation being off.** Hard-code one side and leave the other on auto, and the auto side falls back to **half duplex** — the link comes up, ping works, and throughput is dreadful under load. It is the classic fault and it still happens constantly.

---

## What the counters are telling you

<figure class="fig">
<svg class="sv1" viewBox="0 0 640 275" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Different interface counters point to different layers of problem">
  <style>.sv1 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv1 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv1 .m{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;fill:#17171A}.sv1 .phy{fill:rgba(211,0,45,.10);stroke:#D3002D}.sv1 .dup{fill:rgba(242,201,76,.20);stroke:#c99700}.sv1 .cong{fill:rgba(75,123,236,.12);stroke:#4b7bec}
  </style>
  <rect class="phy" x="14" y="26" width="196" height="96"/>
  <text class="k" x="26" y="48" fill="#B80027">PHYSICAL</text>
  <text class="m" x="26" y="70">CRC errors</text>
  <text class="m" x="26" y="88">input errors</text>
  <text class="s" x="26" y="110">cable · connector · SFP · EMI</text>
  <rect class="dup" x="222" y="26" width="196" height="96"/>
  <text class="k" x="234" y="48" fill="#8a6500">DUPLEX</text>
  <text class="m" x="234" y="70">collisions</text>
  <text class="m" x="234" y="88">late collisions</text>
  <text class="s" x="234" y="110">mismatch — one side half</text>
  <rect class="cong" x="430" y="26" width="196" height="96"/>
  <text class="k" x="442" y="48" fill="#2f5fd0">CONGESTION</text>
  <text class="m" x="442" y="70">output drops</text>
  <text class="m" x="442" y="88">input drops</text>
  <text class="s" x="442" y="110">more traffic than capacity</text>
  <rect x="14" y="140" width="612" height="58" fill="#F1EEE9" stroke="#B5B5BC"/>
  <text class="k" x="26" y="160">Three different problems, three different fixes, and one command shows all of them.</text>
  <text class="s" x="26" y="180">Replacing a cable will not fix a duplex mismatch. Fixing duplex will not fix congestion. Reading</text>
  <text class="s" x="26" y="194">which counter is rising is the whole diagnosis — and it takes about four seconds.</text>
  <rect x="14" y="212" width="612" height="52" fill="rgba(31,157,107,.10)" stroke="#1f9d6b"/>
  <text class="k" x="26" y="232" fill="#0f6b47">Always clear counters before believing them.</text>
  <text class="s" x="26" y="252">A router up for three years shows errors from an incident in 2023. Clear, wait, look again.</text>
</svg>
<figcaption><b>Figure 1.</b> <code>show interface</code> is the most information-dense command in IOS, and the one people skim.</figcaption>
</figure>

<div class="why">
<b>Why a duplex mismatch produces collisions on a switch port</b>
A half-duplex device follows CSMA/CD: listen before transmitting, and if you detect another transmission while sending, that is a collision — back off and retry. A full-duplex device does none of that; it transmits whenever it likes, because the pair is dedicated.
<br><br>So when one side is full and the other half, the full side transmits <b>while the half side is transmitting</b>. The half side detects this and counts a collision. It is behaving correctly; the other end is simply not playing the same game.
<br><br>Which gives you the tell: <b>collisions on one side, CRC/runts on the other</b>, on a link that appears perfectly up. And the throughput impact is worst under load, which is why it always seems to be intermittent.
</div>

---

## Reading an interface

<div class="walk">
<div class="walk-head">Four counters and what each one means <span class="walk-hint">click a step</span></div>
<div class="walk-tabs">
  <input type="radio" name="ifw" id="if1" checked><label for="if1"><span class="step-n">1</span>CRC</label>
  <input type="radio" name="ifw" id="if2"><label for="if2"><span class="step-n">2</span>Duplex</label>
  <input type="radio" name="ifw" id="if3"><label for="if3"><span class="step-n">3</span>Drops</label>
  <input type="radio" name="ifw" id="if4"><label for="if4"><span class="step-n">4</span>Fibre</label>
</div>
<div class="walk-panels">
<div class="walk-panel">
<svg class="sv2" viewBox="0 0 640 190" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A frame arriving with a bad checksum indicates corruption somewhere on the physical path">
  <style>.sv2 .m{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;fill:#17171A}.sv2 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv2 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv2 .f{fill:#F1EEE9;stroke:#B5B5BC}.sv2 .bad{fill:rgba(211,0,45,.16);stroke:#D3002D}</style>
  <rect class="f" x="14" y="34" width="120" height="32"/><text class="m" x="74" y="55" text-anchor="middle">dst / src</text>
  <rect class="f" x="138" y="34" width="300" height="32"/><text class="m" x="288" y="55" text-anchor="middle">payload — one bit flipped</text>
  <rect class="bad" x="442" y="34" width="120" height="32"/><text class="m" x="502" y="55" text-anchor="middle">FCS ✗</text>
  <text class="s" x="502" y="82" text-anchor="middle">does not match</text>
  <text class="k" x="14" y="118">The frame is discarded. Nothing upstream is told. TCP eventually retransmits.</text>
  <text class="s" x="14" y="144">So the symptom is not &#8220;errors&#8221; — it is <tspan font-weight="700">slowness</tspan>. Throughput collapses while every</text>
  <text class="s" x="14" y="160">application still works, and only the interface counter says why.</text>
  <text class="s" x="14" y="184">A handful of CRCs over months is noise. A rising count since you cleared it is a fault.</text>
</svg>
<p class="walk-say"><span class="walk-title">CRC errors — something corrupted the frame</span>
The frame's checksum does not match its contents, so it is dropped silently. The causes are all physical: a damaged cable, a poorly seated connector, a dying SFP, a dirty fibre end face, or interference from something running alongside the cable.
<br><br>The reason it is worth catching early: <b>nothing reports it as an error at any higher layer.</b> TCP retransmits, throughput drops, and users report "the network is slow". Only the counter names the cause.
<br><br>Discipline: <b>clear the counters, wait a few minutes under load, look again.</b> Absolute totals on a long-uptime device tell you almost nothing.</p>
</div>
<div class="walk-panel">
<svg class="sv3" viewBox="0 0 640 195" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="One side full duplex and one side half duplex produces collisions on the half duplex side">
  <style>.sv3 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv3 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv3 .m{font-family:ui-monospace,Menlo,monospace;font-size:10px;fill:#17171A}.sv3 .n{fill:#17171A}.sv3 .nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:10px;font-weight:700}</style>
  <rect class="n" x="30" y="56" width="110" height="30" rx="3"/><text class="nt" x="85" y="76" text-anchor="middle">SW1  full</text>
  <rect class="n" x="490" y="56" width="110" height="30" rx="3"/><text class="nt" x="545" y="76" text-anchor="middle">SW2  half</text>
  <path d="M 140 64 L 490 64" stroke="#4b7bec" stroke-width="2" fill="none"/>
  <circle r="4" fill="#4b7bec"><animateMotion dur="1.4s" repeatCount="indefinite" path="M 140 64 L 490 64"/></circle>
  <path d="M 490 80 L 140 80" stroke="#D3002D" stroke-width="2" fill="none"/>
  <circle r="4" fill="#D3002D"><animateMotion dur="1.4s" repeatCount="indefinite" path="M 490 80 L 140 80"/></circle>
  <text class="m" x="315" y="106" text-anchor="middle">both transmitting at once</text>
  <text class="k" x="14" y="142">SW1 sees CRC errors and runts. SW2 sees collisions and late collisions.</text>
  <text class="s" x="14" y="166">Different symptoms at each end of the same cable, and the link shows up/up throughout. Check both</text>
  <text class="s" x="14" y="182">ends — a one-sided look will send you hunting for a cable fault that does not exist.</text>
</svg>
<p class="walk-say"><span class="walk-title">Collisions on a switch port means duplex</span>
On a modern switched link there is no shared medium, so <b>a properly negotiated full-duplex link cannot have collisions</b>. Any collision counter that is climbing means one side thinks it is half duplex.
<br><br>The usual cause is asymmetric configuration: somebody hard-coded <code>speed 1000 / duplex full</code> on one side to "fix" something. <b>Hard-coding disables auto-negotiation on that side</b>, the other side gets no negotiation partner, and it falls back to half duplex. The link comes up, so it looks fine.
<br><br>Fix: <b>auto on both sides, or hard-code both sides.</b> Never one of each. And note that many 1 Gbps and all 10 Gbps copper links <i>require</i> auto-negotiation, so hard-coding is not even an option.</p>
</div>
<div class="walk-panel">
<svg class="sv4" viewBox="0 0 640 195" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Output drops indicate congestion while input drops indicate the device could not process fast enough">
  <style>.sv4 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv4 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv4 .m{font-family:ui-monospace,Menlo,monospace;font-size:10px;fill:#17171A}.sv4 .hdr{font-family:ui-sans-serif,system-ui;font-size:10px;font-weight:700;letter-spacing:.06em;fill:#8A8A93}.sv4 .q{fill:#E4E4E9;stroke:#B5B5BC}.sv4 .full{fill:rgba(211,0,45,.20);stroke:#D3002D}</style>
  <text class="hdr" x="14" y="20">OUTPUT DROPS — the queue for a slower link filled up</text>
  <rect class="full" x="14" y="30" width="26" height="24"/><rect class="full" x="44" y="30" width="26" height="24"/>
  <rect class="full" x="74" y="30" width="26" height="24"/><rect class="full" x="104" y="30" width="26" height="24"/>
  <rect class="full" x="134" y="30" width="26" height="24"/>
  <text class="m" x="176" y="47">queue full → new arrivals discarded</text>
  <text class="s" x="14" y="76">Normal in small numbers. Rising steadily = you need QoS, or more bandwidth.</text>
  <text class="hdr" x="14" y="112">INPUT DROPS — the device could not process fast enough</text>
  <rect class="q" x="14" y="122" width="26" height="24"/><rect class="q" x="44" y="122" width="26" height="24"/>
  <text class="m" x="86" y="139">CPU-bound, or punted to software</text>
  <text class="s" x="14" y="168">Usually means traffic is being process-switched rather than hardware-forwarded — check what</text>
  <text class="s" x="14" y="184">feature caused the punt. This is a different problem from congestion and needs a different fix.</text>
</svg>
<p class="walk-say"><span class="walk-title">Drops are not errors</span>
A drop is a frame the device chose to discard because it had nowhere to put it. That is <b>not a fault</b> in the way a CRC error is.
<br><br><b>Output drops</b> mean the egress queue filled — traffic arriving faster than the link can send it, typically at a speed step-down like 10G into 1G. A steady trickle is normal. A climbing rate means you need <a href="/blog/qos-classification-marking-queuing-and-phb">QoS</a> to choose <i>what</i> gets dropped, or more bandwidth.
<br><br><b>Input drops</b> are different and more interesting: the device could not process arrivals fast enough, usually because something is being punted to the CPU instead of switched in hardware. <b>Investigate the punt, not the cable.</b></p>
</div>
<div class="walk-panel">
<svg class="sv5" viewBox="0 0 640 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Single mode and multimode fibre differ in core size distance and optic cost">
  <style>.sv5 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv5 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv5 .m{font-family:ui-monospace,Menlo,monospace;font-size:10px;fill:#17171A}.sv5 .hdr{font-family:ui-sans-serif,system-ui;font-size:10px;font-weight:700;letter-spacing:.06em;fill:#8A8A93}</style>
  <text class="hdr" x="14" y="20">MULTIMODE — wide core, light bounces, dispersion limits distance</text>
  <rect x="14" y="30" width="480" height="30" fill="rgba(242,201,76,.25)" stroke="#c99700"/>
  <path d="M 14 45 Q 80 32, 140 45 Q 200 58, 260 45 Q 320 32, 380 45 Q 440 58, 494 45" fill="none" stroke="#c99700" stroke-width="1.5"/>
  <text class="s" x="510" y="49">~400 m at 10G</text>
  <text class="hdr" x="14" y="92">SINGLE-MODE — narrow core, one path, goes for kilometres</text>
  <rect x="14" y="102" width="480" height="18" fill="rgba(75,123,236,.20)" stroke="#4b7bec"/>
  <line x1="14" y1="111" x2="494" y2="111" stroke="#4b7bec" stroke-width="1.5"/>
  <text class="s" x="510" y="115">10 km and beyond</text>
  <text class="k" x="14" y="152">Fibre type and optic must match at BOTH ends. They usually do not fail cleanly.</text>
  <text class="s" x="14" y="176">A single-mode optic on multimode fibre may link up and then show CRC errors, which sends you</text>
  <text class="s" x="14" y="192">chasing a cable fault. Check <tspan font-family="ui-monospace,Menlo,monospace">show interface transceiver</tspan> for the light levels first.</text>
</svg>
<p class="walk-say"><span class="walk-title">Fibre — and the fault that looks like a bad cable</span>
<b>Multimode</b> has a wide core (50 or 62.5 µm), uses cheap optics, and is limited by dispersion to a few hundred metres. <b>Single-mode</b> has a ~9 µm core, one light path, costlier optics, and reaches kilometres.
<br><br>The trap is mismatching. A single-mode transceiver on multimode fibre often <b>links up</b> and then produces errors — so you replace the patch lead, and the problem persists.
<br><br><code>show interface transceiver</code> gives you the actual <b>Rx power in dBm</b>, and that number ends the argument. Too low means attenuation — a dirty end face, a bad splice, too long a run. Too high means you need an attenuator. Either way it is a measurement rather than a guess, and dirty connectors are by a wide margin the most common cause.</p>
</div>
</div>
</div>

---

## Topologies, briefly and honestly

<figure class="fig">
<svg class="sv6" viewBox="0 0 640 265" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Two tier and three tier campus designs compared with spine and leaf">
  <style>.sv6 .s{font-family:ui-sans-serif,system-ui;font-size:10px;fill:#5C5C64}.sv6 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv6 .hdr{font-family:ui-sans-serif,system-ui;font-size:10px;font-weight:700;letter-spacing:.06em;fill:#8A8A93}.sv6 .n{fill:#17171A}
  </style>
  <text class="hdr" x="14" y="18">3-TIER CAMPUS</text>
  <rect class="n" x="80" y="28" width="40" height="16" rx="2"/><rect class="n" x="140" y="28" width="40" height="16" rx="2"/>
  <rect class="n" x="50" y="62" width="40" height="16" rx="2"/><rect class="n" x="110" y="62" width="40" height="16" rx="2"/><rect class="n" x="170" y="62" width="40" height="16" rx="2"/>
  <rect class="n" x="30" y="96" width="30" height="16" rx="2"/><rect class="n" x="70" y="96" width="30" height="16" rx="2"/>
  <rect class="n" x="110" y="96" width="30" height="16" rx="2"/><rect class="n" x="150" y="96" width="30" height="16" rx="2"/>
  <rect class="n" x="190" y="96" width="30" height="16" rx="2"/>
  <line x1="100" y1="44" x2="70" y2="62" stroke="#8A8A93"/><line x1="100" y1="44" x2="130" y2="62" stroke="#8A8A93"/>
  <line x1="160" y1="44" x2="130" y2="62" stroke="#8A8A93"/><line x1="160" y1="44" x2="190" y2="62" stroke="#8A8A93"/>
  <text class="s" x="20" y="132">core / distribution / access</text>
  <text class="hdr" x="256" y="18">2-TIER (COLLAPSED CORE)</text>
  <rect class="n" x="300" y="44" width="44" height="16" rx="2"/><rect class="n" x="364" y="44" width="44" height="16" rx="2"/>
  <rect class="n" x="276" y="96" width="30" height="16" rx="2"/><rect class="n" x="316" y="96" width="30" height="16" rx="2"/>
  <rect class="n" x="356" y="96" width="30" height="16" rx="2"/><rect class="n" x="396" y="96" width="30" height="16" rx="2"/>
  <line x1="322" y1="60" x2="291" y2="96" stroke="#8A8A93"/><line x1="322" y1="60" x2="411" y2="96" stroke="#8A8A93"/>
  <line x1="386" y1="60" x2="291" y2="96" stroke="#8A8A93"/><line x1="386" y1="60" x2="411" y2="96" stroke="#8A8A93"/>
  <text class="s" x="268" y="132">most enterprises live here</text>
  <text class="hdr" x="466" y="18">SPINE-LEAF</text>
  <rect class="n" x="480" y="44" width="40" height="16" rx="2"/><rect class="n" x="540" y="44" width="40" height="16" rx="2"/>
  <rect class="n" x="466" y="96" width="34" height="16" rx="2"/><rect class="n" x="516" y="96" width="34" height="16" rx="2"/><rect class="n" x="566" y="96" width="34" height="16" rx="2"/>
  <line x1="500" y1="60" x2="483" y2="96" stroke="#4b7bec"/><line x1="500" y1="60" x2="533" y2="96" stroke="#4b7bec"/><line x1="500" y1="60" x2="583" y2="96" stroke="#4b7bec"/>
  <line x1="560" y1="60" x2="483" y2="96" stroke="#4b7bec"/><line x1="560" y1="60" x2="533" y2="96" stroke="#4b7bec"/><line x1="560" y1="60" x2="583" y2="96" stroke="#4b7bec"/>
  <text class="s" x="460" y="132">every leaf to every spine</text>
  <rect x="14" y="152" width="612" height="46" fill="rgba(75,123,236,.08)" stroke="#4b7bec"/>
  <text class="k" x="26" y="172" fill="#2f5fd0">Spine-leaf exists because of east-west traffic.</text>
  <text class="s" x="26" y="190">Any leaf reaches any other in exactly two hops, so latency is predictable regardless of where a</text>
  <rect x="14" y="208" width="612" height="46" fill="rgba(31,157,107,.10)" stroke="#1f9d6b"/>
  <text class="k" x="26" y="228" fill="#0f6b47">Campus designs assume north-south: users talking to servers elsewhere.</text>
  <text class="s" x="26" y="246">Data centres stopped looking like that when applications started talking mostly to each other.</text>
</svg>
<figcaption><b>Figure 2.</b> The shape follows the traffic. Campus hierarchies suit users reaching out; spine-leaf suits servers talking to each other.</figcaption>
</figure>

---

## Reading it

<div class="term">
<div class="term-bar"><span class="term-dots"><i></i><i></i><i></i></span>SW1 — the four seconds that solve most physical problems</div>
<pre><span class="p">SW1#</span> <span class="c">show interface GigabitEthernet1/0/24</span>
GigabitEthernet1/0/24 is up, line protocol is up
  Hardware is Gigabit Ethernet, address is 00aa.bbcc.dd18
  MTU 1500 bytes, BW 1000000 Kbit/sec, DLY 10 usec
  <span class="y">Full-duplex, 1000Mb/s, media type is 10/100/1000BaseTX</span>
  <span class="o">! Note "Full-duplex" with NO "(auto)" — someone hard-coded this side.</span>
  Last clearing of "show interface" counters <span class="y">00:14:22</span>
  <span class="o">! Good. Recent. These numbers mean something.</span>
     5 minute input rate 48210000 bits/sec, 6120 packets/sec
     412009 packets input, 502881214 bytes, 0 no buffer
     Received 1841 broadcasts (0 multicasts)
     0 runts, 0 giants, 0 throttles
     <span class="r">4412 input errors, 4412 CRC, 0 frame</span>, 0 overrun, 0 ignored
     <span class="o">! input errors == CRC exactly. Purely physical. Not duplex.</span>
     0 watchdog, 0 multicast, 0 pause input
     388210 packets output, 41209881 bytes, 0 underruns
     <span class="r">0 output errors, 0 collisions</span>, <span class="y">2 interface resets</span>
     <span class="o">! Zero collisions here, but check the OTHER END — that is where</span>
     <span class="o">! a duplex mismatch shows its collisions.</span>

<span class="p">SW1#</span> <span class="c">show interface GigabitEthernet1/0/24 transceiver</span>
                             Optical   Optical
           Temperature  Voltage  Tx Power  Rx Power
Port       (Celsius)    (Volts)  (dBm)     (dBm)
---------  -----------  -------  --------  --------
Gi1/0/24      34.2       3.29     -2.4     <span class="r">-31.8</span>
<span class="o">! Rx -31.8 dBm is far too low. Dirty end face, bad splice, or too long a run.</span>
<span class="o">! That number is why the CRCs are happening. Not a guess — a measurement.</span>

<span class="p">SW1#</span> <span class="c">show interface counters errors | exclude  0        0</span>
Port         Align-Err  FCS-Err  Xmit-Err  Rcv-Err  UnderSize
Gi1/0/24             0     4412         0     4412          0

<span class="o">! One command, every port, only the ones with problems. Start here.</span><span class="cur"></span></pre>
</div>
<p class="term-cap"><b>Two habits are worth building.</b> Check <b>"Last clearing of counters"</b> before you believe any number. And check <b>both ends of the link</b> — a duplex mismatch shows collisions at one end and CRCs at the other, so a one-sided look reliably sends you hunting for the wrong thing.</p>

<div class="real">
<b>In the real world</b>
Physical faults cluster in predictable places: <b>patch leads that have been stepped on</b>, <b>fibre end faces that were never cleaned</b>, and <b>connectors that were never seated properly</b>. Before replacing a switch, clean the fibre and reseat both ends — it resolves a genuinely surprising proportion of "the link is bad" tickets.
<br><br>Duplex mismatches are rarer than they were, because gigabit copper effectively requires auto-negotiation. They still appear on 100 Mbps links, on old hardware, and wherever somebody hard-coded one side years ago and nobody has touched it since.
<br><br>And the habit that costs nothing: <b><code>show interface counters errors</code> across the whole switch</b>, once, after any "the network is slow" report. It takes seconds and it either points you straight at a port or definitively rules the switch out.
</div>

---

## What goes wrong

**CRC errors, no collisions.** Physical. Cable, connector, SFP, fibre cleanliness, EMI.

**Collisions on a switch port.** Duplex mismatch. Check both ends.

**Link up but very slow under load.** Duplex mismatch — throughput collapses only when both sides transmit.

**Counters look alarming.** Check `Last clearing`. Clear them, wait, look again.

**Output drops rising.** Congestion. A QoS or bandwidth question, not a fault.

**Input drops rising.** Traffic being punted to CPU. Find the feature causing it.

**Fibre links up then errors.** Optic/fibre-type mismatch, or low Rx power. Check `transceiver`.

**Giants.** An unexpected tag, or a jumbo-frame mismatch.

---

<div class="lab">
<div class="lab-head">Lab — create a duplex mismatch and measure what it costs</div>
<div class="lab-body">

<div class="lab-target"><b>Target</b>
Build the classic duplex mismatch deliberately and measure the throughput loss, so it stops being a story. Learn what each counter looks like when it is the one that matters. Then read optical power on a fibre link and find out what your own cable plant is actually delivering.</div>

**Setup.** Two switches with a copper link between them, plus hosts each side for `iperf3`. A fibre link with real optics if you have one.

<p class="lab-step"><span class="n">1</span>Baseline, with counters cleared</p>

```cisco
SW1# clear counters
SW1# show interface Gi1/0/24 | include duplex|errors|collisions
```

Run `iperf3` and record throughput.

<div class="lab-watch"><b>Things to notice</b>
Everything should read zero. Note that the duplex line says <b>"Full-duplex … (auto)"</b> — the <code>(auto)</code> is the part that matters, and it disappears the moment somebody hard-codes the port.
<br><br>Write the baseline throughput down. You need a number to compare against.</div>

<p class="lab-step"><span class="n">2</span>Break it on one side only</p>

```cisco
SW1(config-if)# speed 100
SW1(config-if)# duplex full
```

Leave SW2 on auto.

<div class="lab-watch"><b>Things to notice</b>
<b>The link stays up.</b> Ping works perfectly. Everything looks fine — which is exactly why this fault survives in production for years.
<br><br>Check SW2: it has fallen back to <b>half duplex</b>, because hard-coding SW1 removed its negotiation partner. <b>Two switches, one cable, disagreeing about the rules, and no alarm anywhere.</b></div>

<p class="lab-step"><span class="n">3</span>Measure what it costs</p>

Run `iperf3` again, ideally in both directions simultaneously.

<div class="lab-issues"><b>Possible issues</b>
<ul>
<li><b>Throughput looks fine</b> — you are testing one direction only. A mismatch hurts when both sides transmit.</li>
<li><b>No counters move</b> — not enough load; run several parallel streams.</li>
<li><b>The link goes down</b> — speed mismatch rather than duplex. Match speeds, mismatch only duplex.</li>
</ul>
Throughput should be <b>dramatically worse</b> than baseline, and worse still bidirectionally. Now check both ends: <b>SW2 shows collisions and late collisions, SW1 shows CRC errors and runts.</b> Same cable, completely different symptoms — which is the single most useful thing to have seen once.</div>

<p class="lab-step"><span class="n">4</span>Read the light on a fibre link</p>

```cisco
SW1# show interface Te1/1/1 transceiver detail
```

<div class="lab-watch"><b>Things to notice</b>
Record <b>Rx power in dBm</b> and compare it to the optic's documented sensitivity. A healthy short MMF run is typically in the −3 to −7 dBm range; near the low warning threshold means you are one dirty connector away from errors.
<br><br>Unplug, clean both end faces properly, reseat, and measure again. <b>An improvement of several dB from cleaning alone is common</b>, and it is the cheapest fix in networking.</div>

<p class="lab-step"><span class="n">5</span>Produce output drops on purpose</p>

Send more traffic into a 1 Gbps port than it can forward — several sources into one destination.

<div class="lab-watch"><b>Things to notice</b>
<b>Output drops climb; error counters do not.</b> That distinction is the point: this is congestion, not corruption, and no cable replacement will change it.
<br><br>Then apply a QoS policy from <a href="/blog/qos-classification-marking-queuing-and-phb">the QoS article</a> and watch the drops move from "whatever arrived last" to "whatever you chose". <b>Same number of drops, different victims</b> — which is the honest description of what QoS does.</div>

<p class="lab-step"><span class="n">6</span>Sweep the whole switch</p>

```cisco
SW1# show interface counters errors
SW1# show interface status | include notconnect|err-disabled
```

<div class="lab-watch"><b>Things to notice</b>
Two commands give you every problem port on the switch. On a production switch you will find <b>ports with errors nobody has ever looked at</b> — usually old, usually not currently causing complaints, occasionally the answer to a long-running mystery.
<br><br>Make this your first move on any "network is slow" report. <b>It takes seconds and either finds the fault or clears the switch definitively.</b></div>

<div class="lab-earned"><b>What you earned</b>
You have built a duplex mismatch and measured what it costs, so it is a number rather than a warning. You know it shows collisions at one end and CRCs at the other, and that the link stays up throughout. You can separate errors (corruption) from drops (congestion) and know that they need entirely different fixes. You have read optical power in dBm and seen what cleaning a connector does to it. And you have two commands that sweep an entire switch for physical problems in seconds.</div>

</div>
</div>

---

## Test yourself

<div class="qz">
<p class="qz-q"><span class="qz-num">Q1</span>CRC errors climbing, zero collisions. What is it?</p>
<label class="qz-opt"><input type="radio" name="iq1"><span>A physical problem — cable, connector, SFP, dirty fibre or interference</span><em class="qz-fb qz-good">Correct. CRC without collisions points at the physical path, not at duplex.</em></label>
<label class="qz-opt"><input type="radio" name="iq1"><span>Duplex mismatch</span><em class="qz-fb qz-bad">That produces collisions at one end; you would see them.</em></label>
<label class="qz-opt"><input type="radio" name="iq1"><span>Congestion</span><em class="qz-fb qz-bad">Congestion causes drops, not corrupted frames.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q2</span>You hard-code speed and duplex on one side only. What happens?</p>
<label class="qz-opt"><input type="radio" name="iq2"><span>The other side loses its negotiation partner and falls back to half duplex</span><em class="qz-fb qz-good">Correct — the link comes up, ping works, and throughput collapses under load.</em></label>
<label class="qz-opt"><input type="radio" name="iq2"><span>The link will not come up</span><em class="qz-fb qz-bad">It comes up, which is exactly what makes this fault persist.</em></label>
<label class="qz-opt"><input type="radio" name="iq2"><span>Both sides use the hard-coded setting</span><em class="qz-fb qz-bad">There is no mechanism to communicate it — that is what negotiation was for.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q3</span>What is the difference between output drops and input errors?</p>
<label class="qz-opt"><input type="radio" name="iq3"><span>Drops are discarded for lack of buffer (congestion); errors are corrupted frames (physical)</span><em class="qz-fb qz-good">Correct, and they need completely different fixes — bandwidth or QoS versus a cable.</em></label>
<label class="qz-opt"><input type="radio" name="iq3"><span>They are the same thing counted differently</span><em class="qz-fb qz-bad">Different causes entirely.</em></label>
<label class="qz-opt"><input type="radio" name="iq3"><span>Drops are inbound, errors outbound</span><em class="qz-fb qz-bad">Both counters exist in both directions.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q4</span>Why check "Last clearing of counters" first?</p>
<label class="qz-opt"><input type="radio" name="iq4"><span>Totals may span years of uptime, including incidents long since resolved</span><em class="qz-fb qz-good">Correct. Clear, apply load, look again — otherwise the numbers are archaeology.</em></label>
<label class="qz-opt"><input type="radio" name="iq4"><span>Counters reset themselves every 24 hours</span><em class="qz-fb qz-bad">They do not; they persist until cleared or the device reloads.</em></label>
<label class="qz-opt"><input type="radio" name="iq4"><span>It shows when the interface last flapped</span><em class="qz-fb qz-bad">That is "Last input/output" and the interface reset counter.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q5</span>A fibre link comes up then shows CRC errors. What do you check?</p>
<label class="qz-opt"><input type="radio" name="iq5"><span>Rx power with <code>show interface transceiver</code>, and whether optic and fibre type match</span><em class="qz-fb qz-good">Correct — low Rx from a dirty end face is extremely common and it is a measurement, not a guess.</em></label>
<label class="qz-opt"><input type="radio" name="iq5"><span>Duplex settings</span><em class="qz-fb qz-bad">Fibre links of this type are full duplex only.</em></label>
<label class="qz-opt"><input type="radio" name="iq5"><span>The MTU</span><em class="qz-fb qz-bad">An MTU mismatch gives giants, not CRCs.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q6</span>Why does spine-leaf exist?</p>
<label class="qz-opt"><input type="radio" name="iq6"><span>East-west traffic — any leaf reaches any other in the same two hops, so latency is predictable</span><em class="qz-fb qz-good">Correct. Campus hierarchies assume north-south; data centre traffic stopped looking like that.</em></label>
<label class="qz-opt"><input type="radio" name="iq6"><span>It uses fewer cables</span><em class="qz-fb qz-bad">It uses considerably more.</em></label>
<label class="qz-opt"><input type="radio" name="iq6"><span>It removes the need for routing</span><em class="qz-fb qz-bad">It is typically fully routed, often with BGP.</em></label>
</div>

---

## References

- **IEEE 802.3** — Ethernet, including auto-negotiation and the collision rules.
- **TIA/EIA-568** — structured cabling categories and distance limits.
- Cisco — [Troubleshooting Switch Port and Interface Problems](https://www.cisco.com/c/en/us/support/docs/switches/catalyst-6500-series-switches/12027-53.html) — the counter-by-counter reference.
- Cisco — [Campus LAN Design Guide (CVD)](https://www.cisco.com/c/en/us/solutions/design-zone/networking-design-guides/campus-wired-wireless.html)

---

*Related: [Switching concepts and VLANs](/blog/switching-concepts-vlans-and-inter-vlan-routing) · [EtherChannel](/blog/etherchannel-lacp-pagp-and-load-balancing-explained) · [QoS](/blog/qos-classification-marking-queuing-and-phb).*

*Part of the [CCNA, ENCOR and ENARSI topic-by-topic study guide](/blog/ccna-ccnp-study-guide).*
