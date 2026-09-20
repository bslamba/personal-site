---
title: "Network Automation: Config Management, EEM, and Agent vs Agentless"
excerpt: "Automation is not scripting the CLI faster — it is describing the state you want and letting a tool make reality match, every time, on every device. Here is what changes, the tools that do it, the on-box automation you already have in EEM, and how the controller APIs tie it together."
date: "2026-09-22"
tags: ["Automation", "Ansible", "EEM", "Orchestration", "APIs", "DevOps", "CCNA", "ENCOR"]
draft: false
---

> **Blueprint:** CCNA 200-301 — 6.1 *Explain how automation impacts network management*, 6.6 *Recognize the capabilities of configuration management mechanisms such as Puppet, Chef, and Ansible*. ENCOR 350-401 — 6.4 *Describe APIs for Cisco Catalyst Center and vManage*, 6.6 *Construct an EEM applet to automate configuration, troubleshooting, or data collection*, 6.7 *Compare agent vs. agentless orchestration tools*.

## Cheat sheet

| Idea | Traditional | Automated |
|---|---|---|
| **How you change config** | Log in, type, per device | Describe desired state; tool applies it everywhere |
| **Source of truth** | The running-config on each box | A file in version control |
| **Consistency** | Drifts — each device edited by hand | Enforced — the tool re-asserts the state |
| **Change record** | Hopefully a ticket | The git history, with who/what/when |

| Tool | Model | Agent? | Language |
|---|---|---|---|
| **Ansible** | Push, procedural-ish | **Agentless** (SSH/API) | YAML playbooks |
| **Puppet** | Pull, declarative | **Agent** on each node | Puppet DSL (Ruby) |
| **Chef** | Pull, procedural | **Agent** on each node | Ruby "recipes" |
| **Terraform** | Push, declarative | Agentless (API) | HCL |

| On-box / controller | Does |
|---|---|
| **EEM** | Embedded Event Manager — the device automates **itself** on an event |
| **Catalyst Center API** | REST/intent API to the campus controller |
| **vManage API** | REST API to Cisco Catalyst SD-WAN Manager |

**The sentence that reframes it.** Automation's real product is not speed — it is **consistency and a source of truth**. When the intended configuration lives in a version-controlled file and a tool enforces it, "what is this device supposed to look like" has an answer, drift is corrected rather than discovered, and every change carries a who/what/when. Speed is a side effect.

---

## What automation actually changes

<figure class="fig">
<svg class="sv1" viewBox="0 0 640 235" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Traditional per-device configuration drifts while automation enforces one source of truth across all devices">
  <style>
    .sv1 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}
    .sv1 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}
    .sv1 .m{font-family:ui-monospace,Menlo,monospace;font-size:10px;fill:#17171A}
    .sv1 .n{fill:#17171A}.sv1 .nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:9px;font-weight:700}
    .sv1 .src{fill:#B80027}
  </style>
  <text class="k" x="14" y="20" fill="#5C5C64">TRADITIONAL — every box edited by hand, each drifts a little</text>
  <rect class="n" x="14" y="30" width="70" height="26" rx="2"/><text class="nt" x="49" y="47" text-anchor="middle">R1 v?</text>
  <rect class="n" x="94" y="30" width="70" height="26" rx="2"/><text class="nt" x="129" y="47" text-anchor="middle">R2 v?</text>
  <rect class="n" x="174" y="30" width="70" height="26" rx="2"/><text class="nt" x="209" y="47" text-anchor="middle">R3 v?</text>
  <rect class="n" x="254" y="30" width="70" height="26" rx="2"/><text class="nt" x="289" y="47" text-anchor="middle">R4 v?</text>
  <text class="s" x="340" y="47">no two quite the same → drift, surprises</text>
  <text class="k" x="14" y="92" fill="#0f6b47">AUTOMATED — one source of truth, enforced everywhere</text>
  <rect class="src" x="240" y="102" width="160" height="28" rx="3"/><text class="nt" x="320" y="120" text-anchor="middle">git: desired state</text>
  <rect class="n" x="60" y="160" width="70" height="26" rx="2"/><text class="nt" x="95" y="177" text-anchor="middle">R1 ✓</text>
  <rect class="n" x="200" y="160" width="70" height="26" rx="2"/><text class="nt" x="235" y="177" text-anchor="middle">R2 ✓</text>
  <rect class="n" x="340" y="160" width="70" height="26" rx="2"/><text class="nt" x="375" y="177" text-anchor="middle">R3 ✓</text>
  <rect class="n" x="480" y="160" width="70" height="26" rx="2"/><text class="nt" x="515" y="177" text-anchor="middle">R4 ✓</text>
  <line x1="300" y1="130" x2="95" y2="160" stroke="#8A8A93" stroke-dasharray="3 3"/>
  <line x1="310" y1="130" x2="235" y2="160" stroke="#8A8A93" stroke-dasharray="3 3"/>
  <line x1="330" y1="130" x2="375" y2="160" stroke="#8A8A93" stroke-dasharray="3 3"/>
  <line x1="340" y1="130" x2="515" y2="160" stroke="#8A8A93" stroke-dasharray="3 3"/>
  <rect x="14" y="200" width="612" height="30" fill="#F1EEE9" stroke="#B5B5BC"/>
  <text class="s" x="26" y="220">The win is not typing faster — it is that all four are provably identical to a file you can review and roll back.</text>
</svg>
<figcaption><b>Figure 1.</b> Configuration drift is the disease; a version-controlled source of truth the tool enforces is the cure. Speed is incidental.</figcaption>
</figure>

<div class="why">
<b>Idempotence — the word that separates automation from scripting</b>
A script that types <code>configure terminal</code> then a set of commands runs the same way whether or not the change is already there — and can fail or duplicate. An <b>idempotent</b> tool describes the <i>desired state</i> and only makes a change if reality differs, so running it once or a hundred times gives the same result. That is why Ansible/Puppet/Chef are "configuration management," not "remote scripting": you declare "interface Gi0/1 should have this description," and the tool checks, changes only if needed, and reports whether it changed anything. Idempotence is what makes it safe to run the whole thing on a schedule to correct drift.
</div>

---

## Configuration management tools

<div class="walk">
<div class="walk-head">The tools, and the axes they differ on <span class="walk-hint">click a step</span></div>
<div class="walk-tabs">
  <input type="radio" name="auw" id="au1" checked><label for="au1"><span class="step-n">1</span>Agent vs agentless</label>
  <input type="radio" name="auw" id="au2"><label for="au2"><span class="step-n">2</span>Push vs pull</label>
  <input type="radio" name="auw" id="au3"><label for="au3"><span class="step-n">3</span>The three tools</label>
  <input type="radio" name="auw" id="au4"><label for="au4"><span class="step-n">4</span>Declarative</label>
</div>
<div class="walk-panels">
<div class="walk-panel">
<svg class="sv2" viewBox="0 0 640 165" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Agentless tools connect over SSH or API, agent tools run software on each managed node">
  <style>.sv2 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv2 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv2 .m{font-family:ui-monospace,Menlo,monospace;font-size:10px;fill:#17171A}</style>
  <text class="k" x="14" y="24" fill="#0f6b47">Agentless (Ansible) — nothing installed on the device</text>
  <text class="s" x="14" y="46">Connects over SSH or a REST API the device already has. Zero footprint — ideal for network gear</text>
  <text class="s" x="14" y="62">you cannot (or will not) install software on. The control machine does the work.</text>
  <text class="k" x="14" y="98" fill="#2f5fd0">Agent (Puppet, Chef) — software runs on each node</text>
  <text class="s" x="14" y="120">Each managed node runs an agent that pulls its config and enforces it continuously. Powerful for</text>
  <text class="s" x="14" y="136">servers; awkward for switches/routers, which often cannot run a third-party agent.</text>
  <text class="s" x="14" y="160">This is why the network world leans agentless — the devices are closed appliances.</text>
</svg>
<p class="walk-say"><span class="walk-title">Agent vs agentless (ENCOR 6.7)</span>
An <b>agentless</b> tool needs nothing on the managed device — it connects over <b>SSH or an API</b> the device already exposes. <b>Ansible</b> is the archetype, and its zero-footprint model is why it dominates network automation: you cannot install a Puppet agent on a Catalyst switch, but you can SSH to it.
<br><br>An <b>agent</b> tool (<b>Puppet</b>, <b>Chef</b>) runs software on each node that continuously pulls and enforces desired state. That is excellent for a fleet of Linux servers that can run the agent, and a poor fit for closed network appliances. The trade-off: agents give continuous enforcement but need installation, upgrades and their own security footprint; agentless is simpler to adopt but only acts when you run it.</p>
</div>
<div class="walk-panel">
<svg class="sv3" viewBox="0 0 640 160" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Push tools send config on demand, pull tools have nodes fetch config on a schedule">
  <style>.sv3 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv3 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv3 .n{fill:#17171A}.sv3 .nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:9px;font-weight:700}</style>
  <text class="k" x="14" y="24">Push (Ansible) — you run it, config goes out now</text>
  <rect class="n" x="14" y="34" width="90" height="24" rx="2"/><text class="nt" x="59" y="50" text-anchor="middle">control</text>
  <line x1="104" y1="46" x2="240" y2="46" stroke="#4b7bec" stroke-width="2"/>
  <text class="s" x="250" y="50">→ on demand, when YOU decide</text>
  <text class="k" x="14" y="98">Pull (Puppet, Chef) — nodes fetch config on a timer</text>
  <rect class="n" x="14" y="108" width="90" height="24" rx="2"/><text class="nt" x="59" y="124" text-anchor="middle">node agent</text>
  <line x1="240" y1="120" x2="104" y2="120" stroke="#1f9d6b" stroke-width="2"/>
  <text class="s" x="250" y="124">← every 30 min, node asks the server</text>
  <text class="s" x="14" y="154">Pull scales to huge fleets and self-heals on a schedule; push gives you exact, on-demand control.</text>
</svg>
<p class="walk-say"><span class="walk-title">Push vs pull</span>
A <b>push</b> model (Ansible, Terraform) applies changes <b>when you run the tool</b> — you control exactly when and to what. A <b>pull</b> model (Puppet, Chef) has each node's agent <b>fetch and apply</b> its desired state on a timer, so drift is corrected continuously without anyone running anything.
<br><br>Push suits change windows and network gear ("apply this now, to these devices"). Pull suits large, homogeneous fleets that should self-heal ("every server always looks like this"). They are not mutually exclusive — many shops push network changes with Ansible and pull server state with Puppet.</p>
</div>
<div class="walk-panel">
<svg class="sv4" viewBox="0 0 640 165" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Ansible Puppet and Chef compared by model language and footprint">
  <style>.sv4 .s{font-family:ui-sans-serif,system-ui;font-size:10px;fill:#5C5C64}.sv4 .k{font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.sv4 .hdr{font-family:ui-sans-serif,system-ui;font-size:9.5px;font-weight:700;letter-spacing:.05em;fill:#8A8A93}</style>
  <text class="hdr" x="120" y="24">MODEL</text><text class="hdr" x="270" y="24">AGENT</text><text class="hdr" x="400" y="24">LANGUAGE</text>
  <line x1="14" y1="30" x2="620" y2="30" stroke="#D9D9DE"/>
  <text class="k" x="14" y="52">Ansible</text><text class="s" x="120" y="52">push, agentless</text><text class="s" x="270" y="52">none (SSH/API)</text><text class="s" x="400" y="52">YAML playbooks</text>
  <text class="k" x="14" y="82">Puppet</text><text class="s" x="120" y="82">pull, declarative</text><text class="s" x="270" y="82">agent per node</text><text class="s" x="400" y="82">Puppet DSL</text>
  <text class="k" x="14" y="112">Chef</text><text class="s" x="120" y="112">pull, procedural</text><text class="s" x="270" y="112">agent per node</text><text class="s" x="400" y="112">Ruby recipes</text>
  <text class="s" x="14" y="150">For CCNA: recognise the capability and the model. Ansible's agentless/YAML combo is why it wins on networks.</text>
</svg>
<p class="walk-say"><span class="walk-title">The three named tools (CCNA 6.6)</span>
<b>Ansible</b> — agentless, push, playbooks written in <b>YAML</b>. Lowest barrier to entry and the de-facto standard for network automation precisely because it needs nothing on the device.
<br><br><b>Puppet</b> — agent-based, pull, <b>declarative</b> Puppet DSL. You describe end state; the agent makes it so, continuously. Strong for large server estates.
<br><br><b>Chef</b> — agent-based, pull, <b>procedural</b> Ruby "recipes." More programmer-oriented. For the exam, the key recognition is agent vs agentless and declarative vs procedural — and that all three enforce a defined state rather than blindly replaying commands.</p>
</div>
<div class="walk-panel">
<svg class="sv5" viewBox="0 0 640 160" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Declarative describes the desired end state, imperative lists the steps">
  <style>.sv5 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv5 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv5 .m{font-family:ui-monospace,Menlo,monospace;font-size:10px;fill:#17171A}</style>
  <text class="k" x="14" y="24" fill="#2f5fd0">Declarative — describe the destination</text>
  <text class="m" x="14" y="46">interface Gi0/1: description UPLINK, state up</text>
  <text class="s" x="14" y="64">The tool figures out what to change to get there — and does nothing if it is already there.</text>
  <text class="k" x="14" y="98" fill="#8a6500">Imperative/procedural — list the turns</text>
  <text class="m" x="14" y="120">conf t → int Gi0/1 → description UPLINK → no shut</text>
  <text class="s" x="14" y="138">Runs the steps regardless of current state — the essence of scripting, and why it is fragile.</text>
</svg>
<p class="walk-say"><span class="walk-title">Declarative vs imperative</span>
<b>Declarative</b> means you state the <b>end result</b> ("this interface should have this description and be up") and the tool computes the difference and applies only what is needed. <b>Imperative/procedural</b> means you list the <b>steps</b>, which run regardless of the starting point.
<br><br>Declarative is what makes idempotence natural and is where the industry has moved — Puppet and Terraform are declarative, Ansible is largely declarative in practice through its modules. The mental shift from "the commands I type" to "the state I want" is the single biggest one in learning automation, and it is what the blueprint is really testing.</p>
</div>
</div>
</div>

---

## EEM — the device automating itself

**Embedded Event Manager (EEM)** runs *on the device* and reacts to *events* — a syslog message, an SNMP threshold, an interface change, a timer, a CLI command — by running *actions*: run commands, log, send mail, adjust config, or run a Tcl script. It is automation with no external system at all.

<div class="cmd">
<div class="cmd-line"><span class="opt">! EEM applet: when the WAN link goes down, capture state and log it</span>
<span class="t">event manager applet</span> <span class="opt">WAN-DOWN</span>
 <span class="t">event syslog pattern</span> <span class="opt">"Interface GigabitEthernet0/1, changed state to down"</span>
 <span class="t">action</span> <span class="opt">1.0</span> <span class="t">cli command</span> <span class="opt">"enable"</span>
 <span class="t">action</span> <span class="opt">2.0</span> <span class="t">cli command</span> <span class="opt">"show ip route | append flash:wan-down.txt"</span>
 <span class="t">action</span> <span class="opt">3.0</span> <span class="t">cli command</span> <span class="opt">"show ip interface brief | append flash:wan-down.txt"</span>
 <span class="t">action</span> <span class="opt">4.0</span> <span class="t">syslog msg</span> <span class="opt">"WAN-DOWN applet captured state to flash:wan-down.txt"</span>
!
<span class="opt">! EEM applet: run a data-collection every hour</span>
<span class="t">event manager applet</span> <span class="opt">HOURLY-SNAP</span>
 <span class="t">event timer watchdog time</span> <span class="opt">3600</span>
 <span class="t">action</span> <span class="opt">1.0</span> <span class="t">cli command</span> <span class="opt">"enable"</span>
 <span class="t">action</span> <span class="opt">2.0</span> <span class="t">cli command</span> <span class="opt">"show environment all | append flash:env.log"</span></div>
<dl class="cmd-parts">
<div class="is-key"><dt>event …</dt><dd><b>The trigger.</b> A syslog pattern, a timer (`watchdog` = periodic, `countdown` = once), an SNMP object crossing a threshold, an interface event, or `event none` (run manually). This is what makes EEM reactive rather than scheduled-only.</dd></div>
<div class="is-key"><dt>action N.N …</dt><dd><b>The response, run in numeric order.</b> Number with gaps (1.0, 2.0) so you can insert later. <code>cli command</code> runs an exec command; the first is usually <code>"enable"</code> because the applet starts unprivileged.</dd></div>
<div class="is-key"><dt>the automatic-capture pattern</dt><dd><b>EEM's highest-value use is catching transient faults.</b> A link that flaps at 3am is gone by the time you look — an applet that captures <code>show</code> output to flash the instant it happens gives you the evidence a human never could. This is troubleshooting automation, and it is why the blueprint pairs EEM with "troubleshooting or data collection."</dd></div>
<div><dt>cli command "…"</dt><dd>Exact CLI, in quotes. On some platforms you add <code>action X.Y cli command "term length 0"</code> first so paged output does not stall the applet — a classic reason an applet "hangs."</dd></div>
<div class="is-key"><dt>caution: config-changing applets</dt><dd>An applet that <i>changes</i> config in response to an event can create feedback loops (an event triggers a change that triggers the event). Test with <code>event none</code>, and prefer <b>capture-and-alert</b> over <b>auto-remediate</b> until you trust it. Powerful, and a good way to cause an outage if careless.</dd></div>
</dl>
</div>

---

## Controller APIs

Controllers expose their function as **REST APIs**, so automation talks to one controller instead of hundreds of devices — the northbound interface of [controller-based networking](/blog/sdn-controllers-overlays-sd-access-and-sd-wan).

### Catalyst Center API

**Cisco Catalyst Center** (formerly DNA Center) exposes an **Intent API** — a REST/JSON API where you express *what you want* (a site's design, a policy, a template) and the controller renders it to every device. There is also an assurance API to *pull* health and telemetry back out. Authentication is token-based: POST credentials to get a token, then send it as a header on every call. This is [JSON over REST](/blog/json-yaml-and-python-for-network-engineers), the same shape as [RESTCONF](/blog/netconf-restconf-yang-and-rest-apis) but aimed at the controller rather than a single device.

### vManage API

**Cisco Catalyst SD-WAN Manager (vManage)** exposes a REST API for the whole SD-WAN fabric — device inventory, templates, policies, and real-time statistics. It is how you automate an SD-WAN estate: onboard sites, push policy, and pull per-tunnel performance data programmatically instead of clicking through the GUI. Same pattern — authenticate, then JSON REST calls — and the reason to learn it is that at SD-WAN scale the GUI stops being how you operate.

<div class="real">
<b>In the real world</b>
Most network engineers start automating with <b>read-only Ansible or a few API calls</b>: collect versions and interface descriptions into one file, diff last week against this week, generate a report. It cannot break anything and it pays for itself immediately — which is exactly why it is the right place to start.
<br><br><b>EEM</b> is the automation you can adopt today with no external tooling — an applet that captures state on a flap has saved more 3am investigations than any platform. Start with capture-and-alert, never auto-remediate, until you trust it.
<br><br>The controller APIs matter once you have a controller: at a few devices the GUI is fine; at hundreds, the API is how you stay consistent. The through-line of the whole domain is the same as [SDN](/blog/sdn-controllers-overlays-sd-access-and-sd-wan) — express intent once, let software render it everywhere, and keep the intent in version control.
</div>

---

## What goes wrong

**A "script" duplicates or fails on re-run.** It is imperative, not idempotent. Use a config-management tool that checks state first.

**Puppet/Chef won't manage the switches.** They need an agent the appliance cannot run. Use agentless (Ansible/API) for network gear.

**EEM applet hangs.** Paged output — add `term length 0`, and remember the applet starts unprivileged (`enable` first).

**EEM applet loops.** A config-changing action re-triggers its own event. Test with `event none`; prefer capture over remediate.

**API calls fail with 401.** Token expired or not sent as a header — re-authenticate.

**Automation drifted anyway.** Changes were still made by hand on the box. The source of truth must be the file, and manual edits reverted, or the discipline breaks.

---

<div class="lab">
<div class="lab-head">Lab — automate read-only first, then let the device watch itself</div>
<div class="lab-body">

<div class="lab-target"><b>Target</b>
Start where automation is safe: collect state from several devices with an agentless tool and diff it. Then write an EEM applet that captures evidence the instant a link flaps — the automation you can deploy today with nothing external. Finish by pulling inventory from a controller API to see the northbound model.</div>

**Setup.** A few lab devices reachable over SSH, a control machine with Ansible (or just Python + Netmiko), and optionally a [DevNet sandbox](https://developer.cisco.com/site/sandbox/) for the Catalyst Center / vManage API.

<p class="lab-step"><span class="n">1</span>Collect state, read-only</p>

```bash
ansible all -i inventory -m ios_command -a "commands='show version'"   # or a Netmiko loop
```

<div class="lab-watch"><b>Things to notice</b>
One command, every device, structured output — and it <b>cannot change anything</b>. This is the safe entry point: inventory, versions, descriptions. Note that you installed nothing on the devices; Ansible connected over SSH. That is agentless, demonstrated.</div>

<p class="lab-step"><span class="n">2</span>Make it a diff</p>

Save the collection to a file, make a change on one device, collect again, and `diff` the two.

<div class="lab-watch"><b>Things to notice</b>
The diff shows exactly what changed and where — a drift report derived from the devices themselves. <b>This one habit answers "what changed since Friday" in seconds</b>, and it is read-only, so it is the first automation worth having.</div>

<p class="lab-step"><span class="n">3</span>Write an EEM capture applet</p>

Configure the `WAN-DOWN` applet from above (matched to a real interface), then bounce that interface.

```cisco
R1# show event manager history events
R1# more flash:wan-down.txt
```

<div class="lab-issues"><b>Possible issues</b>
<ul>
<li><b>Applet never fires</b> — the syslog pattern does not match; copy the exact message from <code>show logging</code>.</li>
<li><b>Applet fires but captures nothing</b> — missing <code>enable</code>, or paged output; add <code>term length 0</code>.</li>
<li><b>It fires repeatedly</b> — an interface that flaps; that is the applet working, but rate-limit with <code>ratelimit</code> if noisy.</li>
</ul>
The file on flash holds the routing table and interface state <b>from the moment of the failure</b> — evidence you could never gather by hand for a 3am flap. <b>This is EEM's whole value</b>, produced in one applet.</div>

<p class="lab-step"><span class="n">4</span>Pull inventory from a controller API</p>

Against a DevNet sandbox, authenticate and list devices:

```bash
TOKEN=$(curl -sk -u user:pass -X POST https://<dnac>/dna/system/api/v1/auth/token | jq -r .Token)
curl -sk -H "X-Auth-Token: $TOKEN" https://<dnac>/dna/intent/api/v1/network-device | jq '.response[] | {hostname, softwareVersion}'
```

<div class="lab-watch"><b>Things to notice</b>
Authenticate once for a token, then send it as a header on every call — the standard REST pattern. The controller returns the whole estate's inventory in <b>one JSON response</b>. That is the northbound API: talk to the controller, not the devices, and get [JSON](/blog/json-yaml-and-python-for-network-engineers) back.</div>

<div class="lab-earned"><b>What you earned</b>
You automated the safe way first — agentless, read-only collection and a drift diff that cannot break anything. You wrote an EEM applet that captures evidence at the instant of failure, the on-box automation with no dependencies. And you pulled an estate's inventory from a controller's REST API in one call. Across all three you saw the same idea: describe or query intent centrally, let software do the per-device work, and keep the truth in a file.</div>

</div>
</div>

---

## Test yourself

<div class="qz">
<p class="qz-q"><span class="qz-num">Q1</span>What is automation's primary benefit?</p>
<label class="qz-opt"><input type="radio" name="auq1"><span>Consistency and a version-controlled source of truth — drift is enforced away, changes are recorded</span><em class="qz-fb qz-good">Correct. Speed is a side effect; the real product is that every device provably matches a reviewable file.</em></label>
<label class="qz-opt"><input type="radio" name="auq1"><span>Typing commands faster</span><em class="qz-fb qz-bad">Faster typing is incidental; consistency is the point.</em></label>
<label class="qz-opt"><input type="radio" name="auq1"><span>Removing the need to understand the network</span><em class="qz-fb qz-bad">It requires more understanding, not less.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q2</span>Why does network automation lean agentless (Ansible)?</p>
<label class="qz-opt"><input type="radio" name="auq2"><span>Network appliances often cannot run a third-party agent, but they already speak SSH/API</span><em class="qz-fb qz-good">Correct — zero footprint fits closed devices, which is why Ansible dominates network work.</em></label>
<label class="qz-opt"><input type="radio" name="auq2"><span>Agentless is always more powerful</span><em class="qz-fb qz-bad">Agents give continuous enforcement; the driver here is the closed nature of network gear.</em></label>
<label class="qz-opt"><input type="radio" name="auq2"><span>Agents cannot do declarative config</span><em class="qz-fb qz-bad">Puppet is declarative and agent-based.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q3</span>What does an EEM applet do?</p>
<label class="qz-opt"><input type="radio" name="auq3"><span>Runs actions on the device itself in response to an event, with no external system</span><em class="qz-fb qz-good">Correct — event triggers, actions respond; ideal for capturing transient faults.</em></label>
<label class="qz-opt"><input type="radio" name="auq3"><span>Pushes config from a central server</span><em class="qz-fb qz-bad">That is a config-management tool; EEM is on-box.</em></label>
<label class="qz-opt"><input type="radio" name="auq3"><span>Replaces the routing protocol</span><em class="qz-fb qz-bad">It automates responses, not forwarding decisions.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q4</span>What is the difference between declarative and imperative?</p>
<label class="qz-opt"><input type="radio" name="auq4"><span>Declarative describes the desired end state; imperative lists the steps to run</span><em class="qz-fb qz-good">Correct — declarative enables idempotence, doing nothing if the state already matches.</em></label>
<label class="qz-opt"><input type="radio" name="auq4"><span>Declarative is faster to execute</span><em class="qz-fb qz-bad">Speed is not the distinction; state-vs-steps is.</em></label>
<label class="qz-opt"><input type="radio" name="auq4"><span>Imperative cannot make changes</span><em class="qz-fb qz-bad">Imperative makes changes by running steps; that is exactly what it does.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q5</span>How do you authenticate to the Catalyst Center or vManage REST API?</p>
<label class="qz-opt"><input type="radio" name="auq5"><span>POST credentials to get a token, then send the token as a header on each call</span><em class="qz-fb qz-good">Correct — token-based auth, standard REST, JSON responses.</em></label>
<label class="qz-opt"><input type="radio" name="auq5"><span>SNMP community string</span><em class="qz-fb qz-bad">SNMP is a different management plane, not the controller REST API.</em></label>
<label class="qz-opt"><input type="radio" name="auq5"><span>Telnet with a shared password</span><em class="qz-fb qz-bad">The API is HTTPS/REST, not a CLI session.</em></label>
</div>

---

## References

- [Ansible for Network Automation](https://docs.ansible.com/ansible/latest/network/index.html)
- Cisco — [Embedded Event Manager Configuration Guide](https://www.cisco.com/c/en/us/td/docs/ios-xml/ios/eem/configuration/xe-17/eem-xe-17-book.html)
- Cisco — [Catalyst Center Intent API](https://developer.cisco.com/docs/dna-center/) and [Catalyst SD-WAN (vManage) API](https://developer.cisco.com/docs/sdwan/)
- [Cisco DevNet](https://developer.cisco.com/) — sandboxes and learning labs for all of the above.

---

*Related: [NETCONF, RESTCONF and YANG](/blog/netconf-restconf-yang-and-rest-apis) · [JSON, YAML and Python](/blog/json-yaml-and-python-for-network-engineers) · [Controllers, overlays and fabrics](/blog/sdn-controllers-overlays-sd-access-and-sd-wan) · [AI and ML in network operations](/blog/ai-and-ml-in-network-operations).*

*Part of the [CCNA, ENCOR and ENARSI topic-by-topic study guide](/blog/ccna-ccnp-study-guide).*
