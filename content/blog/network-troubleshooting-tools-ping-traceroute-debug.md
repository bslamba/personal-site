---
title: "The Troubleshooting Toolkit: Ping, Traceroute, Debugs, SNMP and Syslog"
excerpt: "Good troubleshooting is not knowing more commands — it is picking the least invasive tool that answers the question, and working the layers in order. Ping and traceroute locate the fault, syslog and SNMP tell you what happened without you watching, and a conditional debug is the scalpel you reach for last."
date: "2026-09-22"
tags: ["Troubleshooting", "Ping", "Traceroute", "Debug", "SNMP", "Syslog", "ENARSI"]
draft: false
---

> **Blueprint:** ENARSI 300-410 — 4.1 *Diagnose and resolve problems using debugs, conditional debugs, traceroute, ping, SNMP, and syslog*.

## Cheat sheet

| Tool | Answers | Cost |
|---|---|---|
| **ping** | Is it reachable? Round-trip loss/latency? | Trivial — start here |
| **traceroute** | *Where* on the path does it break? | Low |
| **SNMP** | What are the counters/state, now and over time? | Low — pulled, not watched |
| **syslog** | What happened, and when? | Low — recorded automatically |
| **debug** | Exactly what the control plane is doing, live | **High — can overwhelm the CPU** |
| **conditional debug** | The same, but only for one target | Medium — the safe way to debug |

**The method, in one line.** **Locate before you inspect.** Ping and traceroute tell you *where* the fault is; syslog and SNMP tell you *what* changed; and only once you have narrowed it to one device and one condition do you reach for a **conditional** debug. Running `debug all` on a busy router to "see what's happening" is how you turn one outage into two.

---

## The order of operations

<figure class="fig">
<svg class="sv1" viewBox="0 0 640 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Troubleshoot from cheap and broad to expensive and narrow: ping, traceroute, syslog SNMP, then conditional debug">
  <style>
    .sv1 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}
    .sv1 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}
    .sv1 .b1{fill:rgba(31,157,107,.14);stroke:#1f9d6b}
    .sv1 .b2{fill:rgba(75,123,236,.12);stroke:#4b7bec}
    .sv1 .b3{fill:rgba(242,201,76,.18);stroke:#c99700}
    .sv1 .b4{fill:rgba(211,0,45,.12);stroke:#D3002D}
  </style>
  <rect class="b1" x="14" y="30" width="150" height="70"/><text class="k" x="26" y="52" fill="#0f6b47">1 · ping</text><text class="s" x="26" y="72">reachable?</text><text class="s" x="26" y="88">loss / latency?</text>
  <rect class="b2" x="170" y="30" width="150" height="70"/><text class="k" x="182" y="52" fill="#2f5fd0">2 · traceroute</text><text class="s" x="182" y="72">where does it</text><text class="s" x="182" y="88">break?</text>
  <rect class="b3" x="326" y="30" width="150" height="70"/><text class="k" x="338" y="52" fill="#8a6500">3 · syslog / SNMP</text><text class="s" x="338" y="72">what changed,</text><text class="s" x="338" y="88">and when?</text>
  <rect class="b4" x="482" y="30" width="144" height="70"/><text class="k" x="494" y="52" fill="#B80027">4 · cond. debug</text><text class="s" x="494" y="72">exactly what,</text><text class="s" x="494" y="88">live, one target</text>
  <text class="s" x="14" y="128">← cheaper, broader, safer            more invasive, narrower, riskier →</text>
  <rect x="14" y="146" width="612" height="56" fill="#F1EEE9" stroke="#B5B5BC"/>
  <text class="k" x="26" y="167">Move right only when the step before has narrowed the problem.</text>
  <text class="s" x="26" y="187">By the time you debug, you should know the device, the interface and the condition — so you can</text>
  <text class="s" x="26" y="201">scope the debug to exactly that, and never point a broad debug at a production CPU.</text>
</svg>
<figcaption><b>Figure 1.</b> Work left to right. Each tool narrows the problem enough to use the next one safely.</figcaption>
</figure>

<div class="why">
<b>Why the order, not just the tools</b>
Every one of these tools can answer a question, but they differ enormously in <b>cost and blast radius</b>. Ping and traceroute are free and safe. Syslog and SNMP are already running, so reading them costs nothing and — crucially — they hold <b>history</b>, which is the only way to diagnose something that already happened. A <b>debug</b> is live and precise but runs on the <b>CPU</b>, and a broad one on a busy device can spike the processor, drop packets, and cause a second outage on top of the one you are chasing. So the discipline is not "know debug" — it is "exhaust the cheap, safe, historical tools first, and reach for debug last, scoped as tightly as possible."
</div>

---

## The tools, one by one

<div class="walk">
<div class="walk-head">Each tool, what it uniquely tells you <span class="walk-hint">click a step</span></div>
<div class="walk-tabs">
  <input type="radio" name="ttw" id="tt1" checked><label for="tt1"><span class="step-n">1</span>ping</label>
  <input type="radio" name="ttw" id="tt2"><label for="tt2"><span class="step-n">2</span>traceroute</label>
  <input type="radio" name="ttw" id="tt3"><label for="tt3"><span class="step-n">3</span>syslog &amp; SNMP</label>
  <input type="radio" name="ttw" id="tt4"><label for="tt4"><span class="step-n">4</span>debug</label>
</div>
<div class="walk-panels">
<div class="walk-panel">
<svg class="sv2" viewBox="0 0 640 155" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Ping tests reachability and reports loss and latency, and its failure codes carry meaning">
  <style>.sv2 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv2 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv2 .m{font-family:ui-monospace,Menlo,monospace;font-size:11px;fill:#17171A}</style>
  <text class="k" x="14" y="24">ping — the first question, and its answer codes</text>
  <text class="m" x="14" y="50">!!!!!  success   .....  timeout/loss   U  unreachable   .  no reply</text>
  <text class="m" x="14" y="70">M  frag needed + DF set (MTU!)   Q  source quench   ?  unknown</text>
  <text class="s" x="14" y="98">Extended ping sets size, DF bit, count and source — so you can test MTU and test from the</text>
  <text class="s" x="14" y="114">right source subnet, not just the router's default source.</text>
  <text class="s" x="14" y="142">A partial success (!.!.!) is loss; all dots is a black hole; U is a router actively rejecting.</text>
</svg>
<p class="walk-say"><span class="walk-title">ping — start here, and read the codes</span>
Ping answers "reachable?" and quantifies loss and latency — but its <b>output codes carry information</b> most people skim past. <code>!</code> is success, <code>.</code> is no reply (timeout/loss), <code>U</code> is a router sending an unreachable, and <code>M</code> is <b>fragmentation-needed with DF set</b> — an MTU problem, which is otherwise miserable to find.
<br><br><b>Extended ping</b> (size, DF bit, repeat count, and crucially <b>source</b>) is what makes it diagnostic: ping large with DF set to find MTU black holes, and ping <b>from the right source interface/subnet</b> so you test the path the traffic actually takes, not the router's default source. A partial <code>!.!.!</code> is intermittent loss; all dots is a clean black hole — different faults.</p>
</div>
<div class="walk-panel">
<svg class="sv3" viewBox="0 0 640 155" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Traceroute shows the per hop path and where latency or loss begins">
  <style>.sv3 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv3 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv3 .m{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;fill:#17171A}</style>
  <text class="k" x="14" y="24">traceroute — where on the path it breaks</text>
  <text class="m" x="14" y="48">1  10.0.12.2      1 ms</text>
  <text class="m" x="14" y="66">2  10.0.23.3      2 ms</text>
  <text class="m" x="14" y="84">3  * * *          &lt;- stops here, or…</text>
  <text class="m" x="14" y="102">3  10.0.34.4      210 ms  &lt;- …latency jumps here</text>
  <text class="s" x="14" y="132">It works by TTL: each hop that decrements TTL to 0 replies "time exceeded," revealing itself.</text>
</svg>
<p class="walk-say"><span class="walk-title">traceroute — locate the hop</span>
Traceroute reveals the <b>per-hop path</b> by sending packets with increasing TTL; each router that drops one to TTL 0 replies and thereby names itself. It turns "it's slow/broken" into "it breaks <b>at hop 3</b>."
<br><br>Read it carefully: <b>where the latency jumps</b> or <b>where the replies stop</b> is the region of interest — but note that a hop showing <code>* * *</code> is often just a router deprioritising its own control-plane replies ([CoPP](/blog/infrastructure-security-copp-acls-and-ipv6-first-hop) or ICMP rate-limiting), not a failure. And on an [MPLS](/blog/mpls-lsr-ldp-label-switching-and-l3vpn) core the provider may hide hops entirely. So traceroute <b>localises</b>; it rarely delivers the final verdict alone.</p>
</div>
<div class="walk-panel">
<svg class="sv4" viewBox="0 0 640 155" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Syslog and SNMP provide history and state without needing to watch live">
  <style>.sv4 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv4 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}</style>
  <text class="k" x="14" y="24" fill="#8a6500">syslog &amp; SNMP — what happened, without watching</text>
  <text class="s" x="14" y="48">syslog: the event log — link flaps, adjacency changes, config edits, with timestamps.</text>
  <text class="s" x="14" y="64">SNMP: the counters and state — interface errors, CPU, memory — polled over time into graphs.</text>
  <text class="s" x="14" y="96">Together they answer the question a live debug never can: "what happened at 3am when I was asleep?"</text>
  <text class="s" x="14" y="120">This is why they are steps 3, before debug — they cost nothing and they hold the past.</text>
  <text class="s" x="14" y="144">Only useful if you turned them on BEFORE the incident — which is the whole argument for them.</text>
</svg>
<p class="walk-say"><span class="walk-title">syslog &amp; SNMP — the history you did not have to watch</span>
These two share a superpower a debug can never have: they record the <b>past</b>. <a href="/blog/syslog-severities-timestamps-and-conditional-debugging">Syslog</a> is the event stream — a link flapped, an adjacency dropped, someone saved a config — each with a timestamp. <a href="/blog/snmp-v2c-v3-mibs-oids-and-traps">SNMP</a> is the counters and state, polled into graphs over time.
<br><br>So the question "what happened at 3am?" — unanswerable by any live tool — is answered instantly <b>if</b> you were logging and polling beforehand. That "if" is the entire case for deploying them: the intermittent flap, the overnight spike, the fault that clears before you look. Accurate <b>timestamps</b> (NTP-synced) are what let you correlate syslog on one device with SNMP on another into a single timeline.</p>
</div>
<div class="walk-panel">
<svg class="sv5" viewBox="0 0 640 160" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A broad debug can overwhelm the CPU while a conditional debug limits output to one target">
  <style>.sv5 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv5 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv5 .m{font-family:ui-monospace,Menlo,monospace;font-size:10px;fill:#17171A}</style>
  <text class="k" x="14" y="24" fill="#B80027">debug — precise, live, and dangerous if unscoped</text>
  <text class="m" x="14" y="50">debug ip packet          ← every packet, on a busy router → CPU spike, dropped traffic</text>
  <text class="m" x="14" y="72" fill="#0f6b47">debug condition interface Gi0/1   ← FIRST, to scope it</text>
  <text class="m" x="14" y="90" fill="#0f6b47">debug ip ospf adj                 ← now only for that one interface</text>
  <text class="s" x="14" y="118">Always: know your logging destination, scope with a condition, and have "undebug all" ready.</text>
  <text class="s" x="14" y="140">A debug is the scalpel — last, precise, and never pointed at a whole busy device.</text>
</svg>
<p class="walk-say"><span class="walk-title">debug — the scalpel, used last</span>
A debug shows <b>exactly what the control plane is doing, live</b> — the real value when nothing else explains a behaviour. But it runs on the <b>CPU</b> and prints per event, so <code>debug ip packet</code> on a busy router can spike the processor and <b>cause an outage</b>.
<br><br>The safe form is the <b>conditional debug</b>: set a <code>debug condition</code> (an interface, a neighbour, a MAC, a username) <i>first</i>, then enable the debug, so output is limited to the one target you have already localised with steps 1–3. Always know <b>where the output goes</b> (console output on a busy box is its own hazard — prefer the buffer or a syslog server), and keep <code>undebug all</code> ready. If you reach for a debug without first narrowing the problem, you skipped the method.</p>
</div>
</div>
</div>

---

## In practice

<div class="term">
<div class="term-bar"><span class="term-dots"><i></i><i></i><i></i></span>Working a "users can't reach the app" ticket, in order</div>
<pre><span class="c">1. ping — reachable at all? and how does it fail?</span>
<span class="p">R1#</span> ping 10.2.20.9 source Gi0/1 repeat 100 size 1500 df-bit
Success rate is 0 percent (0/100)      <span class="o"># all dots earlier → black hole</span>
<span class="o"># M replies instead would mean MTU; !.!. would mean intermittent loss.</span>

<span class="c">2. traceroute — where does it stop?</span>
<span class="p">R1#</span> traceroute 10.2.20.9 source Gi0/1
  1 10.0.12.2   1 ms
  2 <span class="r">* * *</span>            <span class="o"># stops after hop 1 — focus on the 10.0.12.2 → next-hop link</span>

<span class="c">3. syslog — did something change around when it broke?</span>
<span class="p">R2#</span> show logging | include Gi0/2|OSPF|%LINK
%LINK-3-UPDOWN: Interface Gi0/2, changed state to down <span class="y">at 02:41:07</span>
%OSPF-5-ADJCHG: ... to DOWN at 02:41:08   <span class="o"># the app broke at 02:41 — a link went down</span>

<span class="c">4. SNMP / counters — is the link erroring rather than down?</span>
<span class="p">R2#</span> show interface Gi0/2 | include error|drops|reset
     <span class="r">4821 input errors, 4821 CRC</span>, 0 frame   <span class="o"># physical — a dying link, not routing</span>

<span class="c">5. conditional debug — ONLY now, scoped to the one interface</span>
<span class="p">R2#</span> debug condition interface Gi0/2
<span class="p">R2#</span> debug ip ospf adj          <span class="o"># output limited to Gi0/2, safe on a busy box</span>
<span class="p">R2#</span> undebug all                 <span class="o"># the instant you have your answer</span>

<span class="o"># Five tools, cheapest first, each narrowing the next — and the debug was</span>
<span class="o"># scoped to one interface because steps 1-4 already found it.</span><span class="cur"></span></pre>
</div>
<p class="term-cap"><b>Notice the debug came last and was scoped.</b> By the time it ran, ping had shown a black hole, traceroute had localised it to one link, syslog had timestamped a link-down, and the interface counters had shown CRC errors — so the "debug" was almost a formality. That is the method working: the expensive tool confirms what the cheap ones found.</p>

<div class="real">
<b>In the real world</b>
The engineers who troubleshoot fastest are not the ones who know the most obscure commands — they are the ones who <b>work the layers in order</b> and reach for the cheap, safe, historical tools first. Ping and traceroute cost nothing and localise most faults. Syslog and SNMP answer the questions about the past that live tools cannot — <b>provided you turned them on before the incident</b>, which is why "deploy logging and monitoring" is troubleshooting preparation, not overhead.
<br><br>The debug is where careers get interesting and where outages get caused. The rule that never fails: <b>never run an unscoped debug on a production device you cannot afford to lose</b>. Use <code>debug condition</code>, send output somewhere other than a busy console, and have <code>undebug all</code> typed and ready before you press enter. If you find yourself running <code>debug all</code> to "see what's happening," stop — you have skipped the three steps that would have told you what to debug.
</div>

---

## What goes wrong

**Ping works, app doesn't.** Layer mismatch — you tested reachability, not the service. Test the actual port/path, and check MTU with `df-bit`.

**Ping from the router works, from hosts doesn't.** You pinged from the wrong source — use `source` to test the real path.

**Traceroute shows `* * *` mid-path but traffic works.** A hop deprioritising ICMP replies (CoPP), not a fault. Don't chase it.

**"What happened last night?" has no answer.** Syslog/SNMP were not enabled or not sent off-box. Fix that now, for next time.

**Timestamps don't line up across devices.** No NTP. You cannot correlate logs without synced clocks.

**A debug spiked the CPU.** Unscoped debug on a busy device. Use `debug condition` first, always.

**Debug output never appears.** It is going somewhere you're not looking (buffer vs console vs monitor), or a condition is filtering everything.

---

<div class="lab">
<div class="lab-head">Lab — solve a fault with the cheapest tool that works</div>
<div class="lab-body">

<div class="lab-target"><b>Target</b>
Practise the method, not the commands: locate a fault with ping and traceroute, confirm the cause from syslog and counters, and only then run a <b>conditional</b> debug — scoped, on a device where you can watch the CPU stay calm. The discipline is reaching for each tool in order and stopping as soon as the fault is clear.</div>

**Setup.** A multi-hop lab (three routers, a routing protocol) with somewhere to inject a fault, syslog and NTP configured, and a continuous workload to feel the impact.

<p class="lab-step"><span class="n">1</span>Break something, then ping it properly</p>

Introduce a fault (shut a mid-path link, or black-hole a destination). Use **extended** ping: set the source, a large size, and the DF bit.

<div class="lab-watch"><b>Things to notice</b>
Read the <b>code</b>, not just pass/fail: all dots = black hole, <code>M</code> = MTU, <code>!.!.</code> = loss. Then ping again <b>from the wrong source</b> and watch the result change — proof that "ping works" is meaningless without the right source. You have localised the fault to a direction/path already.</div>

<p class="lab-step"><span class="n">2</span>Localise with traceroute</p>

Traceroute to the destination, with the correct source.

<div class="lab-watch"><b>Things to notice</b>
Find <b>where it stops or where latency jumps</b> — that hop (or the link after it) is your focus. Then deliberately add [CoPP](/blog/infrastructure-security-copp-acls-and-ipv6-first-hop) or ICMP rate-limiting on a transit router and watch a healthy hop show <code>* * *</code> — so you learn not to chase a starred hop that is actually just deprioritising replies.</div>

<p class="lab-step"><span class="n">3</span>Confirm from history, not live</p>

On the suspect device, read syslog and interface counters for the window around the fault.

<div class="lab-issues"><b>Possible issues</b>
<ul>
<li><b>No relevant logs</b> — logging level too low, or the buffer wrapped. Raise it and reproduce.</li>
<li><b>Timestamps useless</b> — no NTP; you cannot correlate. Fix NTP first.</li>
<li><b>Counters all zero</b> — cleared recently, or you are on the wrong interface.</li>
</ul>
The goal is to <b>identify the cause without a debug</b>: a link-down log plus CRC errors is a dying physical link; an adjacency-down log with clean counters is a protocol/config issue. Most faults are solved here, at step 3, for free.</div>

<p class="lab-step"><span class="n">4</span>Now, and only now, a conditional debug</p>

Scope a debug to the one interface or neighbour you have identified, then enable it. Watch the CPU.

```cisco
R2# debug condition interface Gi0/2
R2# debug ip ospf adj
R2# show processes cpu | include CPU
R2# undebug all
```

<div class="lab-watch"><b>Things to notice</b>
Output is limited to the one target, and CPU stays calm. For contrast — <b>carefully, on a device you can afford to reload</b> — run the same debug <i>unconditioned</i> under load and watch the CPU climb and the output flood. That comparison is the entire reason conditional debugs exist, felt once so you never forget it.</div>

<p class="lab-step"><span class="n">5</span>Prove the value of history</p>

Fix the fault. Then re-introduce it briefly and clear it **while not watching**, and try to diagnose it purely from syslog/SNMP afterwards.

<div class="lab-watch"><b>Things to notice</b>
If logging and polling were on, you can reconstruct exactly what happened and when — the intermittent fault is solvable after the fact. Turn logging <b>off</b> and repeat: now it is invisible, and no live tool can recover it. <b>That contrast is the argument for monitoring being part of troubleshooting</b>, not a separate project.</div>

<div class="lab-earned"><b>What you earned</b>
You solved a fault the way fast troubleshooters do — cheapest tool first, each step narrowing the next, and the debug scoped and last because the earlier steps had already found the culprit. You read ping codes and traceroute stops as the signals they are, learned not to chase a CoPP-starred hop, and felt the difference between a conditional and an unscoped debug on the CPU. And you proved that the only tools that answer "what happened while I was asleep" are the ones you enabled beforehand.</div>

</div>
</div>

---

## Test yourself

<div class="qz">
<p class="qz-q"><span class="qz-num">Q1</span>What is the guiding principle of the troubleshooting method here?</p>
<label class="qz-opt"><input type="radio" name="ttq1"><span>Locate before you inspect — cheap/safe/historical tools first, conditional debug last</span><em class="qz-fb qz-good">Correct — each tool narrows the problem enough to use the next one safely.</em></label>
<label class="qz-opt"><input type="radio" name="ttq1"><span>Run debug all to see everything at once</span><em class="qz-fb qz-bad">That risks a CPU spike and a second outage; debug is the last, scoped step.</em></label>
<label class="qz-opt"><input type="radio" name="ttq1"><span>Always start with SNMP graphs</span><em class="qz-fb qz-bad">Graphs help, but ping/traceroute localise faster and cheaper first.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q2</span>An extended ping returns <code>M</code>. What does it mean?</p>
<label class="qz-opt"><input type="radio" name="ttq2"><span>Fragmentation needed but DF set — an MTU problem on the path</span><em class="qz-fb qz-good">Correct, and one of the hardest faults to find any other way. That is why ping codes are worth knowing.</em></label>
<label class="qz-opt"><input type="radio" name="ttq2"><span>The destination is unreachable</span><em class="qz-fb qz-bad">That is <code>U</code>.</em></label>
<label class="qz-opt"><input type="radio" name="ttq2"><span>Success</span><em class="qz-fb qz-bad">Success is <code>!</code>.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q3</span>A traceroute shows <code>* * *</code> at a middle hop, but traffic gets through. Why?</p>
<label class="qz-opt"><input type="radio" name="ttq3"><span>That hop is deprioritising its own ICMP replies (e.g. CoPP) — not a forwarding failure</span><em class="qz-fb qz-good">Correct — don't chase a starred hop when end-to-end traffic works; it is a control-plane reply limit.</em></label>
<label class="qz-opt"><input type="radio" name="ttq3"><span>The path is broken at that hop</span><em class="qz-fb qz-bad">If traffic gets through, forwarding is fine; the router just isn't replying to the probe.</em></label>
<label class="qz-opt"><input type="radio" name="ttq3"><span>Traceroute is unreliable and should be ignored</span><em class="qz-fb qz-bad">It is reliable for localisation; you just have to read starred hops correctly.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q4</span>What can syslog and SNMP do that a live debug cannot?</p>
<label class="qz-opt"><input type="radio" name="ttq4"><span>Answer "what happened when I wasn't watching" — they hold history</span><em class="qz-fb qz-good">Correct, provided they were enabled beforehand and clocks are NTP-synced for correlation.</em></label>
<label class="qz-opt"><input type="radio" name="ttq4"><span>Show live control-plane detail</span><em class="qz-fb qz-bad">That is exactly what debug does and they do not.</em></label>
<label class="qz-opt"><input type="radio" name="ttq4"><span>Nothing — debug is always better</span><em class="qz-fb qz-bad">Debug has no history and is far riskier; these are complementary.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q5</span>Why use a conditional debug?</p>
<label class="qz-opt"><input type="radio" name="ttq5"><span>It scopes output to one target so a live debug won't overwhelm the CPU on a busy device</span><em class="qz-fb qz-good">Correct — set <code>debug condition</code> first, after ping/traceroute/logs have localised the fault.</em></label>
<label class="qz-opt"><input type="radio" name="ttq5"><span>It runs faster</span><em class="qz-fb qz-bad">Speed is not the point; safety and focus are.</em></label>
<label class="qz-opt"><input type="radio" name="ttq5"><span>It records history like syslog</span><em class="qz-fb qz-bad">It is still live; syslog/SNMP are the historical tools.</em></label>
</div>

---

## References

- Cisco — [Understanding the ping and traceroute Commands](https://www.cisco.com/c/en/us/support/docs/ip/routing-information-protocol-rip/13730-ext-ping-trace.html)
- Cisco — [Conditional Debugging and enhanced debug commands](https://www.cisco.com/c/en/us/support/docs/dial-access/integrated-services-digital-networks-isdn-channel-associated-signaling-cas/10374-debug.html)
- The deep dives: [Syslog](/blog/syslog-severities-timestamps-and-conditional-debugging) · [SNMP](/blog/snmp-v2c-v3-mibs-oids-and-traps).

---

*Related: [Syslog](/blog/syslog-severities-timestamps-and-conditional-debugging) · [SNMP](/blog/snmp-v2c-v3-mibs-oids-and-traps) · [Troubleshooting device management](/blog/troubleshooting-device-management) · [Components, topologies and interface errors](/blog/network-components-topologies-cabling-and-interface-errors).*

*Part of the [CCNA, ENCOR and ENARSI topic-by-topic study guide](/blog/ccna-ccnp-study-guide).*
