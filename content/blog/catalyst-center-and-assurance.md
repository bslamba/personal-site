---
title: "Catalyst Center and Assurance: Running the Campus From One Controller"
excerpt: "Catalyst Center is where intent-based networking becomes a product: design once, provision automatically, and then let Assurance watch every device, client and application against a learned baseline — so it tells you which one thing is wrong instead of showing you five hundred alerts."
date: "2026-09-22"
tags: ["Catalyst Center", "DNA Center", "Assurance", "SD-Access", "AIOps", "ENCOR", "ENARSI"]
draft: false
---

> **Blueprint:** ENCOR 350-401 — 4.5 *Describe how Cisco Catalyst Center (formerly Cisco DNA Center) is used to apply network configuration, monitoring, and management using traditional and AI-powered workflows*. ENARSI 300-410 — 4.7 *Troubleshoot network problems using Cisco Catalyst Center Assurance (connectivity, monitoring, device health, network health)*.

## Cheat sheet

| Catalyst Center workflow | Does |
|---|---|
| **Design** | Sites, IP pools, credentials, wireless profiles — the intent, once |
| **Policy** | Group-based (SGT) access policy, applied estate-wide |
| **Provision** | Push design/policy to devices; onboard with **PnP** (zero-touch) |
| **Assurance** | Monitor health of network, clients and apps against a learned baseline |
| **Platform** | The **Intent API** — everything the GUI does, available programmatically |

| Assurance health score | Tells you |
|---|---|
| **Network health** | Are the devices healthy? (CPU, memory, links, fabric) |
| **Client health** | Can clients connect and stay connected? (onboarding, roaming, RF) |
| **Application health** | Are apps performing? (latency, loss, jitter per app) |
| **Path trace** | The hop-by-hop path a flow takes, with ACL/QoS applied |

**The sentence that frames it.** Catalyst Center is two things in one: an **automation controller** that turns design intent into device configuration, and an **assurance platform** that turns telemetry into a small number of actionable problems. The first replaces box-by-box configuration; the second replaces staring at raw graphs and alert storms.

---

## Two halves: automate, then assure

<figure class="fig">
<svg class="sv1" viewBox="0 0 640 230" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Catalyst Center pushes intent down to devices and pulls telemetry back up into assurance">
  <style>
    .sv1 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}
    .sv1 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}
    .sv1 .n{fill:#17171A}.sv1 .nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:9.5px;font-weight:700}
    .sv1 .c{fill:#B80027}
  </style>
  <rect class="c" x="230" y="20" width="180" height="34" rx="3"/><text class="nt" x="320" y="42" text-anchor="middle">Catalyst Center</text>
  <text class="k" x="60" y="96" fill="#2f5fd0">DESIGN / POLICY / PROVISION ↓</text>
  <text class="k" x="400" y="96" fill="#0f6b47">ASSURANCE ↑</text>
  <path d="M 300 54 L 150 118" stroke="#4b7bec" stroke-width="1.5" stroke-dasharray="4 3"/>
  <path d="M 340 54 L 490 118" stroke="#1f9d6b" stroke-width="1.5"/>
  <rect class="n" x="60" y="122" width="80" height="26" rx="2"/><text class="nt" x="100" y="139" text-anchor="middle">switch</text>
  <rect class="n" x="150" y="122" width="80" height="26" rx="2"/><text class="nt" x="190" y="139" text-anchor="middle">router</text>
  <rect class="n" x="240" y="122" width="80" height="26" rx="2"/><text class="nt" x="280" y="139" text-anchor="middle">WLC/AP</text>
  <rect class="n" x="330" y="122" width="80" height="26" rx="2"/><text class="nt" x="370" y="139" text-anchor="middle">client</text>
  <rect class="n" x="420" y="122" width="80" height="26" rx="2"/><text class="nt" x="460" y="139" text-anchor="middle">app flow</text>
  <text class="s" x="60" y="172">intent pushed as config →</text>
  <text class="s" x="330" y="172">← telemetry pulled as health</text>
  <rect x="14" y="188" width="612" height="34" fill="#F1EEE9" stroke="#B5B5BC"/>
  <text class="s" x="26" y="209">Down: you describe what you want and it configures the devices. Up: they report, and it tells you what is wrong.</text>
</svg>
<figcaption><b>Figure 1.</b> One controller, two directions — intent down to the devices, telemetry up into assurance.</figcaption>
</figure>

<div class="why">
<b>Intent-based networking, concretely</b>
The "intent" idea sounds abstract until you see the workflow. You do not configure VLAN 20 on forty switches; you declare in <b>Design</b> that a site exists with these IP pools and wireless settings, declare in <b>Policy</b> that Contractors cannot reach Finance, and <b>Provision</b> renders both into per-device configuration — including onboarding new hardware with <b>Plug and Play</b> (a factory-fresh switch phones home, gets its config, and joins with no console cable). The controller owns the translation from "what" to "how," and — crucially — keeps checking that the devices still match the intent, flagging drift. Everything it does through the GUI is also available through the <b>Intent API</b>, so the same intent can be driven by [automation](/blog/network-automation-orchestration-and-eem).
</div>

---

## Assurance: from telemetry to one problem

<div class="walk">
<div class="walk-head">The four health lenses, and troubleshooting with them <span class="walk-hint">click a step</span></div>
<div class="walk-tabs">
  <input type="radio" name="ccw" id="cc1" checked><label for="cc1"><span class="step-n">1</span>Network health</label>
  <input type="radio" name="ccw" id="cc2"><label for="cc2"><span class="step-n">2</span>Client health</label>
  <input type="radio" name="ccw" id="cc3"><label for="cc3"><span class="step-n">3</span>App health</label>
  <input type="radio" name="ccw" id="cc4"><label for="cc4"><span class="step-n">4</span>Path trace</label>
</div>
<div class="walk-panels">
<div class="walk-panel">
<svg class="sv2" viewBox="0 0 640 150" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Network health scores devices on CPU memory links and fabric against a learned baseline">
  <style>.sv2 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv2 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}</style>
  <text class="k" x="14" y="26">Network health — are the devices themselves healthy?</text>
  <text class="s" x="14" y="50">A rolled-up score per device and site from CPU, memory, interface errors, link state, fabric</text>
  <text class="s" x="14" y="66">reachability, and control-plane health — compared against what is normal for that device.</text>
  <text class="s" x="14" y="98">Drill from a red site → the device dragging it down → the specific metric and its timeline.</text>
  <text class="s" x="14" y="122">Replaces logging into forty boxes running show commands to find the one that is unwell.</text>
</svg>
<p class="walk-say"><span class="walk-title">Network health — the devices</span>
Assurance rolls device telemetry — CPU, memory, interface errors, link and fabric state, control-plane health — into a <b>health score</b> per device and per site, judged against a <b>learned baseline</b> rather than a fixed threshold.
<br><br>The troubleshooting flow is top-down: a site shows red, you drill to the device dragging the score down, then to the exact metric and its timeline. It replaces the manual sweep — logging into device after device running <code>show</code> commands — with a guided path from symptom to cause, for the <b>connectivity, monitoring and device-health</b> problems ENARSI 4.7 names.</p>
</div>
<div class="walk-panel">
<svg class="sv3" viewBox="0 0 640 150" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Client health scores onboarding roaming and RF for wired and wireless clients">
  <style>.sv3 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv3 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}</style>
  <text class="k" x="14" y="26">Client health — can clients connect and stay connected?</text>
  <text class="s" x="14" y="50">Onboarding success (DHCP, 802.1X, DNS), roaming behaviour, RF quality, and per-client history —</text>
  <text class="s" x="14" y="66">so "my laptop keeps dropping" becomes a timeline of exactly where onboarding failed.</text>
  <text class="s" x="14" y="98">It reconstructs the client's experience: which AP, which step of association, which RADIUS reply.</text>
  <text class="s" x="14" y="122">Turns an unreproducible user complaint into evidence you can actually act on.</text>
</svg>
<p class="walk-say"><span class="walk-title">Client health — the user experience</span>
Client health scores whether clients can <b>onboard and stay on</b> — DHCP, 802.1X/RADIUS, DNS, roaming and RF quality — with a per-client timeline. The classic win is turning "my laptop keeps dropping, but not when you're watching" into a <b>recorded sequence</b>: which AP it was on, which step of association failed, what the RADIUS server replied, when the RF degraded.
<br><br>That reconstruction is exactly what makes intermittent wireless complaints solvable — the evidence exists after the fact, which it never does when you are chasing it live. It is the connectivity/monitoring half of ENARSI 4.7 for the client side.</p>
</div>
<div class="walk-panel">
<svg class="sv4" viewBox="0 0 640 150" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Application health scores latency loss and jitter per application">
  <style>.sv4 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv4 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}</style>
  <text class="k" x="14" y="26">Application health — are the apps actually performing?</text>
  <text class="s" x="14" y="50">Per-application latency, loss and jitter, drawn from NetFlow/telemetry — so you can say whether</text>
  <text class="s" x="14" y="66">"the app is slow" is the network or the application, and where on the path it degrades.</text>
  <text class="s" x="14" y="98">Ties app experience to the network path, which is the argument that ends "it's the network" disputes.</text>
  <text class="s" x="14" y="122">Underpinned by the same flow data as [NetFlow](/blog/netflow-flexible-netflow-templates-and-ipfix).</text>
</svg>
<p class="walk-say"><span class="walk-title">Application health — is it the network?</span>
Application health scores per-app <b>latency, loss and jitter</b> from flow telemetry, so the perennial "the app is slow — it's the network" can be answered with data: whether the degradation is on the network path at all, and if so, where.
<br><br>It leans on the same <a href="/blog/netflow-flexible-netflow-templates-and-ipfix">flow data</a> you would collect manually, correlated automatically with the path and the devices. That correlation is what settles the cross-team argument — you can show the network path is clean and hand the problem to the application owners, or show exactly which hop is adding the latency.</p>
</div>
<div class="walk-panel">
<svg class="sv5" viewBox="0 0 640 150" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Path trace shows the hop by hop path a flow takes with ACLs and QoS applied">
  <style>.sv5 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv5 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv5 .n{fill:#17171A}.sv5 .nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:9px;font-weight:700}</style>
  <text class="k" x="14" y="24">Path Trace — the exact route a flow takes, with policy applied</text>
  <rect class="n" x="20" y="44" width="60" height="22" rx="2"/><text class="nt" x="50" y="59" text-anchor="middle">client</text>
  <rect class="n" x="120" y="44" width="60" height="22" rx="2"/><text class="nt" x="150" y="59" text-anchor="middle">access</text>
  <rect class="n" x="220" y="44" width="60" height="22" rx="2"/><text class="nt" x="250" y="59" text-anchor="middle">core</text>
  <rect class="n" x="320" y="44" width="60" height="22" rx="2"/><text class="nt" x="350" y="59" text-anchor="middle">fw</text>
  <rect class="n" x="420" y="44" width="60" height="22" rx="2"/><text class="nt" x="450" y="59" text-anchor="middle">server</text>
  <line x1="80" y1="55" x2="120" y2="55" stroke="#1f9d6b" stroke-width="2"/><line x1="180" y1="55" x2="220" y2="55" stroke="#1f9d6b" stroke-width="2"/><line x1="280" y1="55" x2="320" y2="55" stroke="#1f9d6b" stroke-width="2"/><line x1="380" y1="55" x2="420" y2="55" stroke="#D3002D" stroke-width="2"/>
  <text class="s" x="14" y="92">Highlights where an ACL denies the flow, where QoS is (or isn't) applied, and where it stops.</text>
  <text class="s" x="14" y="116">The "why can host A not reach host B" answer, computed from the devices' actual forwarding state.</text>
</svg>
<p class="walk-say"><span class="walk-title">Path Trace — computed connectivity</span>
Path Trace computes the <b>hop-by-hop path</b> a flow (source, destination, port) takes through the fabric, and overlays what happens at each hop — which <b>ACL</b> permits or denies it, which <b>QoS</b> policy applies, where it is dropped.
<br><br>It answers "why can A not reach B?" from the devices' <b>actual forwarding and policy state</b>, rather than by you tracing it manually across every hop. For the connectivity troubleshooting ENARSI 4.7 asks about, it is the single most useful tool in Assurance — it turns a multi-device investigation into one query.</p>
</div>
</div>
</div>

---

## Traditional and AI-powered workflows

<div class="why">
<b>What "AI-powered" adds on top of automation</b>
The <b>traditional</b> workflow is automation: design, provision, monitor with dashboards and thresholds. The <b>AI-powered</b> workflow adds the machine-learning layer from <a href="/blog/ai-and-ml-in-network-operations">AI/ML in operations</a> — a <b>learned baseline</b> instead of static thresholds, <b>anomaly detection</b> that flags "abnormal for this device at this time," <b>correlation</b> that collapses an alert storm into one incident with a probable root cause, and <b>guided remediation</b> that suggests the fix.
<br><br>The practical difference: traditional monitoring tells you a number crossed a line; AI-powered assurance tells you "clients on this floor are onboarding slowly, correlated with this AP's RF, here is the likely cause." It moves you from reading graphs to being handed a ranked list of problems — while still needing an engineer to confirm and act, because, as always, it advises rather than decides.
</div>

---

## Troubleshooting with Assurance (ENARSI 4.7)

<div class="term">
<div class="term-bar"><span class="term-dots"><i></i><i></i><i></i></span>The Assurance workflow, as a sequence</div>
<pre><span class="o"># ENARSI 4.7 asks you to troubleshoot connectivity, monitoring,</span>
<span class="o"># device health and network health WITH Assurance. The method:</span>

<span class="c">1. Start at the health dashboard</span>
   Network / Client / Application scores, by site. Find the red.

<span class="c">2. Drill into the failing entity</span>
   Red site  → which device      → which metric → its timeline
   Red client→ which onboarding step failed (DHCP / 802.1X / DNS / RF)
   Slow app  → is it the network path, and which hop degrades

<span class="c">3. Use the timeline</span>
   <span class="y">Assurance keeps history</span>, so an intermittent fault that is gone now
   is still on the graph — the thing raw show-commands can never give you.

<span class="c">4. Run Path Trace for connectivity</span>
   source → destination → port: see every hop, and where an ACL/QoS/
   drop stops the flow. Answers "why can A not reach B" from real state.

<span class="c">5. Read the guided insight</span>
   Correlated root cause + suggested remediation. <span class="r">Verify before acting</span> —
   it advises; you decide. Confirm against the device with show commands.

<span class="o"># The shift: from "log into 40 boxes and run show" to "follow the score</span>
<span class="o"># down to the one problem," with history you didn't have to be capturing.</span><span class="cur"></span></pre>
</div>
<p class="term-cap"><b>The exam framing is "troubleshoot <em>using</em> Assurance."</b> The method is always the same: start at the health score, drill to the failing entity, use the retained timeline for intermittent faults, run Path Trace for connectivity, and treat the AI-suggested root cause as a lead to confirm — never as a verdict to action blind.</p>

<div class="real">
<b>In the real world</b>
Catalyst Center's automation half pays off at <b>scale and rate of change</b> — many sites, frequent onboarding, group-based policy. At a handful of static sites the box-by-box approach is often simpler, and that is a fair assessment to make rather than a failing to hide.
<br><br>The <b>Assurance</b> half earns its keep almost everywhere, and its killer feature is <b>history</b>: the intermittent client drop, the 3am latency spike, the fault that vanishes the moment you look — Assurance was recording, so the evidence exists after the fact. That alone changes how wireless and application complaints get resolved.
<br><br>The discipline that keeps it useful is the same as for all [AI-assisted operations](/blog/ai-and-ml-in-network-operations): the correlated root cause and suggested fix are <b>informed leads</b>, confirmed against the devices before you act. The engineer who understands the fundamentals is the one who can tell a correct suggestion from a plausible-but-wrong one.
</div>

---

## What to keep straight

**Automation half vs assurance half.** Design/Policy/Provision push intent down; Assurance pulls telemetry up. Different problems, one platform.

**Health score is relative.** It is judged against a learned baseline, not a fixed threshold — "abnormal for this device," not "over a number."

**History is the point.** Assurance's retained timelines solve the intermittent faults raw `show` commands cannot.

**Path Trace = computed connectivity.** It uses the devices' real forwarding/policy state, so it is authoritative for "why can A not reach B."

**AI advises, you decide.** Guided remediation is a lead to verify. Actioning it blind is how you automate an outage.

**PnP = zero-touch onboarding.** A factory switch phones home and self-provisions — no console cable.

---

## Test yourself

<div class="qz">
<p class="qz-q"><span class="qz-num">Q1</span>What are the two halves of what Catalyst Center does?</p>
<label class="qz-opt"><input type="radio" name="ccq1"><span>Automation (design/policy/provision intent down to devices) and Assurance (telemetry up into health)</span><em class="qz-fb qz-good">Correct — one controller, two directions: configure the devices, then tell you what is wrong.</em></label>
<label class="qz-opt"><input type="radio" name="ccq1"><span>Routing and switching</span><em class="qz-fb qz-bad">It manages devices that route and switch; it is not itself a forwarding device.</em></label>
<label class="qz-opt"><input type="radio" name="ccq1"><span>Firewalling and VPN</span><em class="qz-fb qz-bad">Those are security functions, not Catalyst Center's two halves.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q2</span>An Assurance health score is judged against what?</p>
<label class="qz-opt"><input type="radio" name="ccq2"><span>A learned baseline of normal for that entity — "abnormal for this device at this time"</span><em class="qz-fb qz-good">Correct — it is relative, which is why it catches subtle deviations a fixed threshold misses.</em></label>
<label class="qz-opt"><input type="radio" name="ccq2"><span>A fixed 80% threshold</span><em class="qz-fb qz-bad">That is exactly the static approach a learned baseline improves on.</em></label>
<label class="qz-opt"><input type="radio" name="ccq2"><span>The vendor's global average</span><em class="qz-fb qz-bad">It baselines your environment, not a global figure.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q3</span>Why is Assurance so useful for intermittent faults?</p>
<label class="qz-opt"><input type="radio" name="ccq3"><span>It retains history, so a fault that is gone now is still on the timeline</span><em class="qz-fb qz-good">Correct — the evidence exists after the fact, which live <code>show</code> commands can never provide.</em></label>
<label class="qz-opt"><input type="radio" name="ccq3"><span>It prevents faults from occurring</span><em class="qz-fb qz-bad">It observes and diagnoses; it does not prevent.</em></label>
<label class="qz-opt"><input type="radio" name="ccq3"><span>It reboots the failing device automatically</span><em class="qz-fb qz-bad">It surfaces and suggests; it does not auto-remediate blindly.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q4</span>What does Path Trace answer, and how?</p>
<label class="qz-opt"><input type="radio" name="ccq4"><span>"Why can A not reach B" — by computing the hop-by-hop path with ACL/QoS applied from the devices' real state</span><em class="qz-fb qz-good">Correct — it turns a multi-device manual trace into one authoritative query.</em></label>
<label class="qz-opt"><input type="radio" name="ccq4"><span>The device's CPU usage</span><em class="qz-fb qz-bad">That is network health; Path Trace is about the forwarding path.</em></label>
<label class="qz-opt"><input type="radio" name="ccq4"><span>The wireless RF spectrum</span><em class="qz-fb qz-bad">That falls under client health, not Path Trace.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q5</span>How should you treat Assurance's AI-suggested root cause?</p>
<label class="qz-opt"><input type="radio" name="ccq5"><span>As an informed lead to verify against the devices before acting</span><em class="qz-fb qz-good">Correct — it advises; you confirm and decide. Actioning it blind is how you automate an outage.</em></label>
<label class="qz-opt"><input type="radio" name="ccq5"><span>As a verified verdict to action immediately</span><em class="qz-fb qz-bad">It can be plausibly wrong; verify first.</em></label>
<label class="qz-opt"><input type="radio" name="ccq5"><span>Ignore it entirely</span><em class="qz-fb qz-bad">It is a valuable lead — just not an unverified authority.</em></label>
</div>

---

## References

- Cisco — [Catalyst Center (DNA Center)](https://www.cisco.com/c/en/us/products/cloud-systems-management/dna-center/index.html) and the [Assurance user guide](https://www.cisco.com/c/en/us/support/cloud-systems-management/dna-center/products-user-guide-list.html).
- Cisco — [Catalyst Center Intent API](https://developer.cisco.com/docs/dna-center/) on DevNet.
- [Cisco DevNet sandbox](https://developer.cisco.com/site/sandbox/) — a live Catalyst Center to explore the workflows.

---

*Related: [AI and ML in network operations](/blog/ai-and-ml-in-network-operations) · [Network automation and EEM](/blog/network-automation-orchestration-and-eem) · [Controllers, overlays and fabrics](/blog/sdn-controllers-overlays-sd-access-and-sd-wan) · [NetFlow](/blog/netflow-flexible-netflow-templates-and-ipfix).*

*Part of the [CCNA, ENCOR and ENARSI topic-by-topic study guide](/blog/ccna-ccnp-study-guide).*
