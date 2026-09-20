---
title: "Layer 2 Security: Port Security, DHCP Snooping and Dynamic ARP Inspection"
excerpt: "Everything above Layer 2 assumes Layer 2 is honest, and by default it is not. Anyone on a switch port can hand out addresses, claim to be your default gateway, or exhaust the MAC table until the switch floods every frame to them. Three features fix it, they depend on each other in a specific order, and turning the middle one on without understanding option 82 will take your DHCP down."
date: "2026-09-23"
tags: ["Port Security", "DHCP Snooping", "Dynamic ARP Inspection", "Layer 2", "Security", "CCNA"]
draft: false
---

> **Blueprint:** CCNA 200-301 — 5.7 *Configure and verify Layer 2 security features (DHCP snooping, dynamic ARP inspection, and port security)*.

## Cheat sheet

| | Port security | DHCP snooping | Dynamic ARP inspection |
|---|---|---|---|
| **Stops** | MAC flooding, unauthorised devices | Rogue DHCP servers | ARP poisoning |
| **Works on** | Source MAC per port | DHCP messages | ARP messages |
| **Needs** | Nothing | Nothing | **DHCP snooping's binding table** |
| **Default max MACs** | **1** | — | — |
| **Default violation** | **shutdown** (err-disable) | — | — |
| **Trust model** | — | **All ports untrusted** once enabled | All ports untrusted |
| **Trust the uplink** | — | **Mandatory** | **Mandatory** |

| | |
|---|---|
| **MAC aging default** | **300 seconds** |
| **Violation modes** | `protect` (drop silently) · `restrict` (drop + log + counter) · **`shutdown`** (err-disable) |
| **Option 82** | Inserted by default, and **`giaddr` stays `0.0.0.0`** — see the warning below |
| **Binding table** | `show ip dhcp snooping binding` — MAC, IP, lease, VLAN, port |
| **Static hosts** | Need `ip source binding` or an ARP ACL — they never appear in the binding table |

**The dependency that decides your rollout order.** DAI validates ARP against the DHCP snooping binding table. **No snooping means no bindings means DAI drops everything**, including the traffic you wanted to keep. Snooping goes first, always, and you let the table populate before DAI goes anywhere near the VLAN.

---

## Three attacks a switch permits by default

<figure class="fig">
<svg class="sv1" viewBox="0 0 640 260" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Three layer two attacks: MAC flooding, a rogue DHCP server, and ARP poisoning">
  <style>.sv1 .n{fill:#17171A}.sv1 .nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:10.5px;font-weight:700}.sv1 .s{font-family:ui-sans-serif,system-ui;font-size:10px;fill:#5C5C64}.sv1 .k{font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.sv1 .bad{fill:#D3002D}.sv1 .hdr{font-family:ui-sans-serif,system-ui;font-size:10px;font-weight:700;letter-spacing:.06em}
  </style>
  <text class="hdr" x="14" y="18" fill="#D3002D">1 · MAC FLOODING</text>
  <rect class="n" x="14" y="30" width="56" height="26" rx="3"/><text class="nt" x="42" y="47" text-anchor="middle">SW</text>
  <rect class="bad" x="120" y="30" width="72" height="26" rx="3"/><text class="nt" x="156" y="47" text-anchor="middle">attacker</text>
  <line x1="70" y1="43" x2="120" y2="43" stroke="#D3002D" stroke-width="2.5"/>
  <circle r="3.5" class="bad"><animateMotion dur="1s" repeatCount="indefinite" path="M 120 43 L 70 43"/></circle>
  <circle r="3.5" class="bad"><animateMotion dur="1s" begin="0.3s" repeatCount="indefinite" path="M 120 43 L 70 43"/></circle>
  <circle r="3.5" class="bad"><animateMotion dur="1s" begin="0.6s" repeatCount="indefinite" path="M 120 43 L 70 43"/></circle>
  <text class="s" x="206" y="40">thousands of fake source MACs fill the table</text>
  <text class="s" x="206" y="54" fill="#D3002D">table full → switch floods every frame → attacker sees everything</text>
  <text class="hdr" x="14" y="98" fill="#D3002D">2 · ROGUE DHCP SERVER</text>
  <rect class="n" x="14" y="110" width="56" height="26" rx="3"/><text class="nt" x="42" y="127" text-anchor="middle">SW</text>
  <rect class="bad" x="120" y="110" width="72" height="26" rx="3"/><text class="nt" x="156" y="127" text-anchor="middle">attacker</text>
  <rect class="n" x="240" y="110" width="56" height="26" rx="3"/><text class="nt" x="268" y="127" text-anchor="middle">PC</text>
  <line x1="70" y1="123" x2="120" y2="123" stroke="#8A8A93" stroke-width="1.5"/>
  <line x1="70" y1="123" x2="14" y2="123" stroke="#8A8A93" stroke-width="1.5"/>
  <line x1="192" y1="123" x2="240" y2="123" stroke="#D3002D" stroke-width="2.5"/>
  <circle r="4" class="bad"><animateMotion dur="1.6s" repeatCount="indefinite" path="M 192 123 L 240 123"/></circle>
  <text class="s" x="316" y="120">answers faster than the real server</text>
  <text class="s" x="316" y="134" fill="#D3002D">hands out itself as the default gateway</text>
  <text class="hdr" x="14" y="178" fill="#D3002D">3 · ARP POISONING</text>
  <rect class="n" x="14" y="190" width="56" height="26" rx="3"/><text class="nt" x="42" y="207" text-anchor="middle">SW</text>
  <rect class="bad" x="120" y="190" width="72" height="26" rx="3"/><text class="nt" x="156" y="207" text-anchor="middle">attacker</text>
  <line x1="70" y1="203" x2="120" y2="203" stroke="#D3002D" stroke-width="2.5"/>
  <circle r="4" class="bad"><animateMotion dur="1.5s" repeatCount="indefinite" path="M 120 203 L 70 203"/></circle>
  <text class="s" x="206" y="200">&#8220;10.1.10.1 is at my MAC&#8221; — unsolicited, unverified</text>
  <text class="s" x="206" y="214" fill="#D3002D">every host updates its cache and sends the attacker its traffic</text>
  <rect x="14" y="228" width="612" height="26" fill="#F1EEE9" stroke="#D9D9DE"/>
  <text class="k" x="26" y="246">None of these is an exploit. All three are the protocols working exactly as designed.</text>
</svg>
<figcaption><b>Figure 1.</b> Ethernet, DHCP and ARP were all designed for a network where everybody is cooperative. Each of the three features below adds the verification the original protocol left out.</figcaption>
</figure>

<div class="why">
<b>Why ARP poisoning is the one that matters most</b>
MAC flooding gives an attacker a copy of traffic. A rogue DHCP server gives them the next hop for <em>new</em> clients. <b>ARP poisoning redirects traffic that is already flowing</b>, from hosts that are already configured, with no reboot and no lease renewal — and because ARP has no authentication and hosts accept unsolicited replies, it takes one packet. Everything encrypted survives it; everything else does not. DAI is the control that stops it, and DAI is the one that needs the most setup.
</div>

---

## Port security — how many MACs, and what happens when

<div class="cmd">
<div class="cmd-line">interface GigabitEthernet1/0/5
 switchport mode access
 <span class="t">switchport port-security</span>
 <span class="t">switchport port-security maximum</span> <span class="opt">3</span>
 <span class="t">switchport port-security violation</span> <span class="opt">restrict</span>
 <span class="t">switchport port-security mac-address sticky</span>
 <span class="t">switchport port-security aging time</span> <span class="opt">60</span>
 <span class="t">switchport port-security aging type inactivity</span></div>
<dl class="cmd-parts">
<div class="is-key"><dt>switchport port-security</dt><dd>Enables it, with a default maximum of <b>1</b> MAC and a violation mode of <b>shutdown</b>. The port must already be an access port or a trunk — it is rejected on a dynamic port, which is one more reason to hard-code <code>switchport mode access</code>.</dd></div>
<div class="is-key"><dt>maximum 3</dt><dd>How many source MACs the port will accept. <b>One is almost always wrong in practice</b>: a PC behind an IP phone is two, and a phone that also passes a second device is three. Count what is actually on the port, then add one.</dd></div>
<div class="is-key"><dt>violation restrict</dt><dd>Three behaviours, and the default is the harshest.
<br><b><code>shutdown</code></b> (default) — err-disable the port. It stays down until someone bounces it, or until <code>errdisable recovery</code> brings it back.
<br><b><code>restrict</code></b> — drop the offending frames, increment a counter, send an SNMP trap and a syslog message. <b>The port keeps working for legitimate MACs.</b>
<br><b><code>protect</code></b> — drop silently. No counter, no log. Almost never what you want, because you will never know it happened.
<br><br>In production <code>restrict</code> is usually the right answer: you get the alert without an outage caused by somebody plugging in a second laptop.</dd></div>
<div><dt>mac-address sticky</dt><dd>Learn the MAC dynamically, then write it into the running configuration as if you had typed it. Convenient — and remember it is only in <code>running-config</code> until you <code>write memory</code>, so a reload loses every sticky address and relearns whatever is plugged in at the time.</dd></div>
<div class="is-key"><dt>aging time 60<br>aging type inactivity</dt><dd>Without aging, a secured MAC is remembered for ever — so a meeting-room port secured to a visitor's laptop rejects the next visitor. <b><code>inactivity</code></b> ages an address out only after it has been silent for that long, which is what you want; the default <code>absolute</code> removes it after the time regardless of whether it is still in use.</dd></div>
</dl>
</div>

<div class="warn">
<b>Port security is not authentication</b>
A MAC address is four keystrokes to change. Port security stops the <em>accidental</em> — a second switch plugged into a wall port, a user swapping their PC — and it stops MAC flooding, which is its real security value. It does not stop anybody who knows what they are doing, because they will simply clone the MAC of the device they unplugged. If you need to know <em>who</em> is on a port rather than <em>how many</em>, that is <b>802.1X</b>, and port security is not a substitute for it.
</div>

---

## DHCP snooping, and the one that breaks your DHCP

<div class="walk">
<div class="walk-head">A rogue server, and what snooping does about it <span class="walk-hint">click a step</span></div>
<div class="walk-tabs">
  <input type="radio" name="dsw" id="ds1" checked><label for="ds1"><span class="step-n">1</span>The attack</label>
  <input type="radio" name="dsw" id="ds2"><label for="ds2"><span class="step-n">2</span>Trust</label>
  <input type="radio" name="dsw" id="ds3"><label for="ds3"><span class="step-n">3</span>Blocked</label>
  <input type="radio" name="dsw" id="ds4"><label for="ds4"><span class="step-n">4</span>The binding table</label>
  <input type="radio" name="dsw" id="ds5"><label for="ds5"><span class="step-n">5</span>DAI uses it</label>
</div>
<div class="walk-panels">
<div class="walk-panel">
<svg class="sv2" viewBox="0 0 640 195" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A rogue DHCP server on an access port answers a client before the real server does">
  <style>.sv2 .n{fill:#17171A}.sv2 .nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.sv2 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv2 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv2 .bad{stroke:#D3002D;stroke-width:2.5;fill:none}.sv2 .ok{stroke:#8A8A93;stroke-width:1.5;fill:none}</style>
  <rect class="n" x="20" y="72" width="76" height="32" rx="3"/><text class="nt" x="58" y="93" text-anchor="middle">PC</text>
  <rect class="n" x="250" y="72" width="66" height="32" rx="3"/><text class="nt" x="283" y="93" text-anchor="middle">SW</text>
  <rect class="n" x="480" y="26" width="130" height="30" rx="3"/><text class="nt" x="545" y="45" text-anchor="middle">real DHCP</text>
  <rect class="n" x="480" y="124" width="130" height="30" rx="3" fill="#D3002D"/><text class="nt" x="545" y="143" text-anchor="middle">rogue DHCP</text>
  <path class="ok" d="M 96 88 L 250 88"/>
  <path class="ok" d="M 316 80 L 480 44"/>
  <path class="bad" d="M 480 138 L 316 96"/>
  <circle r="5" fill="#D3002D"><animateMotion dur="1.6s" repeatCount="indefinite" path="M 480 138 L 316 96 L 96 88"/></circle>
  <text class="s" x="400" y="170" text-anchor="middle" fill="#D3002D">closer, so it answers first — and the client takes the first offer it gets</text>
  <text class="k" x="320" y="190" text-anchor="middle" fill="#B80027">Default gateway, DNS and lease all now come from the attacker.</text>
</svg>
<p class="walk-say"><span class="walk-title">The client takes the first offer, not the best one</span>
DHCP has no authentication and no preference. A client broadcasts a Discover and <b>uses whichever Offer arrives first</b> — and a rogue server on the same switch is closer than the real one two hops away, so it usually wins.
<br><br>It does not even have to be malicious. The commonest cause by far is somebody plugging a home router into a wall port <b>the wrong way round</b>, so its LAN side faces your network and it starts serving 192.168.1.x to your users.</p>
</div>
<div class="walk-panel">
<svg class="sv3" viewBox="0 0 640 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Enabling snooping makes every port untrusted so the uplink must be trusted explicitly">
  <style>.sv3 .n{fill:#17171A}.sv3 .nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.sv3 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv3 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv3 .m{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;fill:#17171A}</style>
  <rect class="n" x="270" y="78" width="80" height="36" rx="3"/><text class="nt" x="310" y="101" text-anchor="middle">SW</text>
  <rect x="30" y="40" width="150" height="26" fill="#FFF1F3" stroke="#D3002D"/>
  <text class="m" x="40" y="58" fill="#B80027">access ports — untrusted</text>
  <rect x="30" y="76" width="150" height="26" fill="#FFF1F3" stroke="#D3002D"/>
  <text class="m" x="40" y="94" fill="#B80027">everything, by default</text>
  <rect x="440" y="58" width="170" height="26" fill="rgba(31,157,107,.14)" stroke="#1f9d6b"/>
  <text class="m" x="450" y="76" fill="#0f6b47">uplink — you must trust it</text>
  <line x1="180" y1="56" x2="270" y2="88" stroke="#D3002D" stroke-width="2"/>
  <line x1="180" y1="90" x2="270" y2="96" stroke="#D3002D" stroke-width="2"/>
  <line x1="350" y1="90" x2="440" y2="72" stroke="#1f9d6b" stroke-width="2.5"/>
  <text class="k" x="320" y="150" text-anchor="middle" fill="#B80027">Turn snooping on and forget the uplink, and you have blocked your own DHCP server.</text>
  <text class="s" x="320" y="174" text-anchor="middle">Untrusted ports may send Discover and Request. They may <tspan font-weight="700">not</tspan> send Offer, ACK or NAK.</text>
  <text class="s" x="320" y="192" text-anchor="middle">The real server's replies arrive over the uplink — which is untrusted until you say otherwise.</text>
</svg>
<p class="walk-say"><span class="walk-title">Everything is untrusted, including the path to your real server</span>
The moment <code>ip dhcp snooping</code> is enabled for a VLAN, <b>every port in it becomes untrusted</b>. An untrusted port may carry client messages — Discover, Request, Release — but any server message arriving on one is dropped.
<br><br>That is the whole protection, and it is also the outage: your legitimate DHCP replies come <em>in</em> over the uplink, which is untrusted by default. <b>Trust the uplink in the same change</b>, or you take DHCP down for the whole switch.</p>
</div>
<div class="walk-panel">
<svg class="sv4" viewBox="0 0 640 190" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The rogue offer arriving on an untrusted port is dropped">
  <style>.sv4 .n{fill:#17171A}.sv4 .nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.sv4 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv4 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv4 .ok{stroke:#1f9d6b;stroke-width:2.5;fill:none}.sv4 .bad{stroke:#D3002D;stroke-width:2.5;fill:none}</style>
  <rect class="n" x="20" y="76" width="76" height="32" rx="3"/><text class="nt" x="58" y="97" text-anchor="middle">PC</text>
  <rect class="n" x="250" y="76" width="66" height="32" rx="3"/><text class="nt" x="283" y="97" text-anchor="middle">SW</text>
  <rect class="n" x="480" y="30" width="130" height="30" rx="3"/><text class="nt" x="545" y="49" text-anchor="middle">real DHCP</text>
  <rect class="n" x="480" y="124" width="130" height="30" rx="3" fill="#D3002D"/><text class="nt" x="545" y="143" text-anchor="middle">rogue DHCP</text>
  <path class="ok" d="M 480 48 L 316 84 L 96 92"/>
  <circle r="4.5" fill="#1f9d6b"><animateMotion dur="1.8s" repeatCount="indefinite" path="M 480 48 L 316 84 L 96 92"/></circle>
  <path class="bad" d="M 480 138 L 340 104" stroke-dasharray="5 4"/>
  <line x1="326" y1="94" x2="344" y2="112" stroke="#D3002D" stroke-width="2.5"/>
  <line x1="344" y1="94" x2="326" y2="112" stroke="#D3002D" stroke-width="2.5"/>
  <text class="k" x="320" y="176" text-anchor="middle" fill="#0f6b47">Dropped at the switch, and logged — with the port and VLAN named.</text>
  <text class="s" x="200" y="140">%DHCP_SNOOPING-5-DHCP_SNOOPING_UNTRUSTED_PORT</text>
</svg>
<p class="walk-say"><span class="walk-title">Blocked, and it tells you where</span>
The rogue Offer never reaches the client. The log message names the <b>interface and VLAN</b>, which means this is one of the few security controls that also does your fault-finding for you — you get the port number of the wall socket someone plugged a home router into.
<br><br>Add <code>ip dhcp snooping limit rate</code> on untrusted ports and you also stop DHCP starvation, where an attacker exhausts the pool by requesting every address with a different MAC.</p>
</div>
<div class="walk-panel">
<svg class="sv5" viewBox="0 0 640 195" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Snooping records every successful lease in a binding table of MAC IP VLAN and port">
  <style>.sv5 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv5 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv5 .m{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;fill:#17171A}.sv5 .hdr{font-family:ui-sans-serif,system-ui;font-size:10px;font-weight:700;letter-spacing:.06em;fill:#8A8A93}</style>
  <text class="hdr" x="14" y="22">THE BINDING TABLE — BUILT BY WATCHING LEASES SUCCEED</text>
  <rect x="14" y="32" width="612" height="96" fill="#fff" stroke="#1f9d6b"/>
  <text class="m" x="26" y="52" fill="#0f6b47">MacAddress          IpAddress      Lease(sec)  Type            VLAN  Interface</text>
  <text class="m" x="26" y="72">00:50:56:A1:B2:C3   10.1.10.50     85312       dhcp-snooping   10    Gi1/0/5</text>
  <text class="m" x="26" y="90">00:50:56:D4:E5:F6   10.1.10.51     85320       dhcp-snooping   10    Gi1/0/6</text>
  <text class="m" x="26" y="112" fill="#B80027">00:0C:29:DE:AD:01   —              —           (never recorded)      Gi1/0/9</text>
  <text class="k" x="14" y="154">This is the switch's record of which MAC legitimately holds which IP, on which port.</text>
  <text class="s" x="14" y="178">It is a side effect of snooping — and it is the entire foundation of the next step.</text>
</svg>
<p class="walk-say"><span class="walk-title">The binding table is the real output</span>
Blocking rogue servers is what snooping is <em>for</em>; the binding table is what makes it valuable. Every time a client successfully completes a lease, the switch records <b>MAC, IP, lease time, VLAN and port</b>.
<br><br>That table is a statement of fact about your access layer, and three other features consume it: DAI, IP Source Guard, and IPv6 first-hop security. It is also genuinely useful operationally — <code>show ip dhcp snooping binding | include 10.1.10.50</code> tells you which wall port an address is on, without touching any other system.</p>
</div>
<div class="walk-panel">
<svg class="sv6" viewBox="0 0 640 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Dynamic ARP inspection checks each ARP message against the binding table and drops mismatches">
  <style>.sv6 .n{fill:#17171A}.sv6 .nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.sv6 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv6 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv6 .m{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;fill:#17171A}</style>
  <rect class="n" x="20" y="76" width="90" height="32" rx="3" fill="#D3002D"/><text class="nt" x="65" y="97" text-anchor="middle">attacker</text>
  <rect class="n" x="280" y="70" width="80" height="44" rx="3"/><text class="nt" x="320" y="97" text-anchor="middle">SW · DAI</text>
  <line x1="110" y1="92" x2="280" y2="92" stroke="#D3002D" stroke-width="2.5"/>
  <circle r="5" fill="#D3002D"><animateMotion dur="1.6s" repeatCount="indefinite" path="M 110 92 L 272 92"/></circle>
  <line x1="262" y1="82" x2="280" y2="102" stroke="#D3002D" stroke-width="2.5"/>
  <line x1="280" y1="82" x2="262" y2="102" stroke="#D3002D" stroke-width="2.5"/>
  <text class="m" x="120" y="66">&#8220;10.1.10.1 is at 00:0C:29:DE:AD:01&#8221;</text>
  <rect x="400" y="60" width="226" height="64" fill="#fff" stroke="#1f9d6b"/>
  <text class="s" x="412" y="80" fill="#0f6b47">binding table says:</text>
  <text class="m" x="412" y="100">10.1.10.1 → the router, Gi1/0/24</text>
  <text class="m" x="412" y="118" fill="#B80027">no binding for this MAC/IP pair</text>
  <text class="k" x="320" y="164" text-anchor="middle" fill="#0f6b47">Mismatch → dropped, logged, and the port can be err-disabled.</text>
  <text class="s" x="320" y="188" text-anchor="middle">DAI is not inspecting the ARP for plausibility. It is checking it against a record of what actually happened.</text>
</svg>
<p class="walk-say"><span class="walk-title">DAI — ARP checked against recorded fact</span>
Every ARP message on an untrusted port is compared with the binding table. If the sender's MAC and IP do not match an entry, the message is dropped and logged.
<br><br>This is why the <b>order matters</b>. DAI has no knowledge of its own — it is entirely parasitic on snooping's table. Enable DAI on a VLAN where snooping has not been running, and there are no bindings, so <b>every ARP is a mismatch and the VLAN stops working instantly</b>.
<br><br>And it is why <b>statically addressed devices need special handling</b>: a server with a hard-coded IP never does DHCP, so it never appears in the table. It needs an explicit <code>ip source binding</code> entry or an ARP ACL, or DAI will cut it off.</p>
</div>
</div>
</div>

### What the switch inserts, and what the attacker sends

<div class="cap">
<div class="cap-head">Capture · DHCP Discover after snooping added option 82 <span class="cap-filter">bootp</span></div>
<div class="cap-hex"><pre>option 82 as inserted by the switch — 20 bytes
<mark>52</mark> 10 <mark>01</mark> 06 00 04 <mark>00 0a</mark> <mark>01 01</mark> <mark>02</mark> 08 01 06 <mark>00 1a 2b 3c 4d 5e</mark></pre></div>
<div class="cap-note"><b>Byte by byte.</b> <code>52</code> = option <b>82</b> in decimal, length <code>10</code> = 16 bytes of content. <code>01</code> — sub-option 1, the <b>circuit ID</b>: <code>00 0a</code> is VLAN 10 and <code>01 01</code> identifies the module and port. <code>02</code> — sub-option 2, the <b>remote ID</b>: the switch's own MAC, <code>00 1a 2b 3c 4d 5e</code>.
<br><br>Together they say <em>"this request came from port 1/1 in VLAN 10 on this specific switch"</em> — which is exactly what a DHCP server needs to assign addresses by location, and exactly what an auditor wants six months later.</div>
</div>

<div class="warn">
<b>The option 82 outage, and it is the commonest one</b>
A switch doing DHCP snooping <b>inserts option 82 by default</b> — and because it is switching rather than relaying, it does <b>not</b> set <code>giaddr</code>, which stays <code>0.0.0.0</code>. Cisco's IOS DHCP server performs a sanity check and <b>drops any message that carries option 82 with a zero <code>giaddr</code></b>. So you enable snooping, everything looks correct, and DHCP stops working for the entire VLAN.
<br><br>Two fixes, and pick deliberately. On the device <b>running the DHCP server</b>, accept them: <code>ip dhcp relay information trust-all</code> globally, or <code>ip dhcp relay information trusted</code> per interface. <b>These go on the server, not on the access switches.</b> Or, on the access switch, stop inserting it: <code>no ip dhcp snooping information option</code> — simpler, and it costs you the port-level visibility that made option 82 worth having.
</div>

<div class="cap">
<div class="cap-head">Capture · the gratuitous ARP that DAI drops <span class="cap-filter">arp.opcode == 2</span></div>
<div class="cap-hex"><pre>0000  ff ff ff ff ff ff <mark>00 0c  29 de ad 01</mark> <mark>08 06</mark> 00 01   ........).......
0010  08 00 06 04 <mark>00 02</mark> 00 0c  29 de ad 01 <mark>0a 01 0a 01</mark>   ........).......
0020  ff ff ff ff ff ff <mark>0a 01  0a 01</mark> 00 00 00 00 00 00   ................</pre></div>
<div class="cap-note"><b><code>0a 01 0a 01</code> appears twice</b> — once as the sender's protocol address and once as the target's. Sender IP equal to target IP is the definition of a <b>gratuitous ARP</b>, and it is sent to the broadcast address so every host on the VLAN updates its cache.
<br><br>The claimed address, <code>10.1.10.1</code>, is the default gateway. The sender MAC, <code>00:0c:29:de:ad:01</code>, is the attacker's. <b>Nothing in ARP can tell these apart from a legitimate gratuitous ARP</b> — which is exactly what a router sends after an HSRP failover. That is why the check has to come from outside the protocol, from a table of what the switch watched happen.</div>
</div>

---

## Configuration, word by word

<div class="cmd">
<div class="cmd-line"><span class="t">ip dhcp snooping</span>
<span class="t">ip dhcp snooping vlan</span> <span class="opt">10,20,30</span>
<span class="t">no ip dhcp snooping information option</span>
!
<span class="t">ip arp inspection vlan</span> <span class="opt">10,20,30</span>
<span class="t">ip arp inspection validate</span> <span class="opt">src-mac dst-mac ip</span>
!
interface GigabitEthernet1/0/24
 <span class="t">description</span> <span class="opt">uplink to distribution</span>
 <span class="t">ip dhcp snooping trust</span>
 <span class="t">ip arp inspection trust</span>
!
interface range GigabitEthernet1/0/1 - 23
 <span class="t">ip dhcp snooping limit rate</span> <span class="opt">15</span></div>
<dl class="cmd-parts">
<div class="is-key"><dt>ip dhcp snooping<br>+ vlan list</dt><dd><b>Both lines are required.</b> The global command arms the feature; the VLAN command is what actually applies it. Enabling globally and forgetting the VLAN list is the most common reason snooping "does not work" — and it is also why nothing broke, which is the clue.</dd></div>
<div class="is-key"><dt>no ip dhcp snooping<br>information option</dt><dd>Stops option 82 insertion. Needed when your DHCP server drops messages with option 82 and a zero <code>giaddr</code> — see the warning above. The alternative is to trust them at the server. Decide which before the change window, not during it.</dd></div>
<div class="is-key"><dt>ip dhcp snooping trust<br><span class="opt">(on the uplink)</span></dt><dd><b>The line that prevents the self-inflicted outage.</b> Every port is untrusted once snooping is on, including the one your real DHCP replies arrive over. Trust every uplink and every port facing a legitimate DHCP server, in the same change.</dd></div>
<div><dt>limit rate 15</dt><dd>Caps DHCP messages per second on untrusted ports, which stops starvation attacks. <b>Do not put this on the uplink</b> — a trunk carrying every client's DHCP traffic will exceed it and err-disable, taking the switch off the network.</dd></div>
<div class="is-key"><dt>ip arp inspection vlan</dt><dd>Enable this <b>only after snooping has been running long enough for the binding table to populate</b> — realistically after a full DHCP lease cycle. Turn it on cold and every host that has not renewed since snooping started has no binding, so DAI drops its ARP and it goes offline.</dd></div>
<div><dt>validate src-mac<br>dst-mac ip</dt><dd>Extra checks beyond the binding lookup: that the Ethernet source matches the ARP sender, that the Ethernet destination matches the ARP target in replies, and that the IP addresses are not invalid or multicast. Cheap, and they catch malformed attack tooling. Note they must all be given in <b>one command</b> — issuing them separately replaces rather than adds.</dd></div>
<div class="is-key"><dt>ip arp inspection trust</dt><dd>On the uplink, again. Without it the switch inspects ARP arriving from the rest of the network against a binding table that only knows about <em>local</em> ports — and drops all of it.</dd></div>
<div><dt><span class="opt">static devices</span></dt><dd>Servers and printers with fixed addresses never appear in the binding table. Add them explicitly with <code>ip source binding &lt;mac&gt; vlan &lt;n&gt; &lt;ip&gt; interface &lt;x&gt;</code>, or permit them with an ARP ACL. <b>Find them before you enable DAI</b>, not afterwards.</dd></div>
</dl>
</div>

---

## Verifying it

<div class="term">
<div class="term-bar"><span class="term-dots"><i></i><i></i><i></i></span>SW1 — check trust before you check anything else</div>
<pre><span class="p">SW1#</span> <span class="c">show ip dhcp snooping</span>
Switch DHCP snooping is <span class="g">enabled</span>
DHCP snooping is configured on following VLANs: <span class="y">10,20,30</span>
Insertion of option 82 is <span class="y">disabled</span>
Interface                  Trusted    Rate limit (pps)
------------------------   -------    ----------------
GigabitEthernet1/0/5       <span class="r">no</span>         15
<span class="g">GigabitEthernet1/0/24      yes        unlimited</span>     <span class="o">&lt;- the uplink. Must say yes.</span>

<span class="p">SW1#</span> <span class="c">show ip dhcp snooping binding</span>
MacAddress          IpAddress     Lease(sec)  Type           VLAN  Interface
00:50:56:A1:B2:C3   10.1.10.50    85312       dhcp-snooping  10    Gi1/0/5
00:50:56:D4:E5:F6   10.1.10.51    85320       dhcp-snooping  10    Gi1/0/6
Total number of bindings: <span class="y">2</span>

<span class="o">! If this is EMPTY, do not enable DAI. There is nothing for it to validate against</span>
<span class="o">! and it will drop every ARP on the VLAN.</span>

<span class="p">SW1#</span> <span class="c">show ip arp inspection statistics vlan 10</span>
 Vlan      Forwarded        Dropped     DHCP Drops      ACL Drops
   10          18422             <span class="r">14</span>             <span class="r">14</span>              0
<span class="o">! 14 dropped, all for missing DHCP bindings — either an attack, or a static host</span>
<span class="o">! you forgot to add with "ip source binding".</span>

<span class="p">SW1#</span> <span class="c">show port-security interface Gi1/0/5</span>
Port Security              : Enabled
Port Status                : <span class="g">Secure-up</span>
Violation Mode             : <span class="y">Restrict</span>
Maximum MAC Addresses      : 3
Total MAC Addresses        : 2
Security Violation Count   : <span class="r">7</span>

<span class="p">SW1#</span> <span class="c">show interfaces status err-disabled</span>
Port      Name               Status       Reason
Gi1/0/9                      err-disabled <span class="r">psecure-violation</span><span class="cur"></span></pre>
</div>
<p class="term-cap"><b>Two commands answer most incidents.</b> <code>show ip dhcp snooping</code> — is the uplink trusted? <code>show ip dhcp snooping binding</code> — is the table populated? A blank binding table with DAI enabled explains a dead VLAN instantly, and it is the first thing to check after any change to these features.</p>

<div class="real">
<b>In the real world</b>
Roll these out in this order, with a gap between each: <b>port security</b> in <code>restrict</code> mode first, because it cannot take a VLAN down. Then <b>DHCP snooping</b>, trusting uplinks in the same change and deciding the option 82 question in advance. Then wait — at least one full DHCP lease period, usually a week — while the binding table fills. <b>Then</b> DAI, and only after you have hunted down every statically addressed device and added an <code>ip source binding</code> for it.
<br><br>The printers are what get you. Nobody has a list of them, half have static addresses set by a vendor years ago, and they fail silently — no ticket, just a queue that stops printing. Run <code>show ip arp inspection statistics</code> the morning after and every drop is either an attack or a device you missed; on day one it is always the second one.
</div>

---

## What goes wrong

**DHCP stops for the whole VLAN right after enabling snooping.** The uplink is not trusted.

**DHCP stops and the uplink *is* trusted.** Option 82 with a zero `giaddr` being dropped by the server. Trust it at the server or stop inserting it.

**Snooping is enabled and nothing is being blocked.** The global command without the per-VLAN command.

**The whole VLAN dies the moment DAI is enabled.** The binding table is empty. Let snooping run first.

**One server lost connectivity after DAI.** It has a static address, so it has no binding. Add `ip source binding`.

**A port err-disables every morning.** Port security with `shutdown` and an absolute aging timer, on a port where the device changes. Use `restrict` and `inactivity` aging.

**Sticky MACs vanished after a reload.** They were never saved. `write memory`.

**The uplink err-disabled.** A DHCP rate limit applied to a trunk carrying everybody's DHCP.

---

<div class="lab">
<div class="lab-head">Lab — run the attacks, then stop them in the right order</div>
<div class="lab-body">

<div class="lab-target"><b>Target</b>
Run a rogue DHCP server and poison an ARP cache on an unprotected switch, so you have seen both work. Then enable each control in the correct order and watch it stop the corresponding attack. Along the way, cause all four self-inflicted outages — untrusted uplink, option 82, DAI before bindings exist, and a static host with no binding — because every one of them is more likely to reach you than the attacks are.</div>

**Topology.** One access switch, a legitimate DHCP server behind the uplink, two clients, and an attacker host that can run `dnsmasq` (rogue DHCP), `arpspoof`/`ettercap` (ARP poisoning) and `macof` (MAC flooding). **Isolated lab only.**

<p class="lab-step"><span class="n">1</span>Watch all three attacks work</p>

With no security features enabled:

1. `macof` for a few seconds, then `show mac address-table count`.
2. Start `dnsmasq` on the attacker, renew a client's lease, check the gateway it received.
3. `arpspoof -t <client> <gateway>`, then look at the client's ARP cache.

<div class="lab-watch"><b>Things to notice</b>
The MAC table fills to its limit within seconds and the switch begins flooding — capture on the attacker and you will see traffic between two other hosts. The client takes the rogue lease because it arrived first. And the ARP cache updates from a single unsolicited packet, with the client showing the gateway's IP against the attacker's MAC.
<br><br><b>None of that required a vulnerability.</b> Every protocol behaved exactly as specified, which is the point worth taking away.</div>

<p class="lab-step"><span class="n">2</span>Port security, and the harsh default</p>

```cisco
interface GigabitEthernet1/0/5
 switchport mode access
 switchport port-security
```

Run `macof` again.

<div class="lab-watch"><b>Things to notice</b>
The port err-disables almost immediately — default max 1, default violation <code>shutdown</code>. Confirm with <code>show interfaces status err-disabled</code>. MAC flooding is stopped, and so is the user.
<br><br>Now change to <code>maximum 3</code> and <code>violation restrict</code> and repeat: the attack is still blocked, the violation counter climbs, a syslog message appears, and <b>the port keeps working for the legitimate MACs</b>. That comparison is the whole argument for <code>restrict</code> in production.</div>

<p class="lab-step"><span class="n">3</span>Take DHCP down with snooping</p>

```cisco
ip dhcp snooping
ip dhcp snooping vlan 10
```

Deliberately do **not** trust the uplink. Renew a client's lease.

<div class="lab-watch"><b>Things to notice</b>
Nobody gets an address, including from the real server, because its Offers arrive over an untrusted port. Read the log: <code>%DHCP_SNOOPING-5-DHCP_SNOOPING_UNTRUSTED_PORT</code> naming your own uplink.
<br><br>Fix it with <code>ip dhcp snooping trust</code> on the uplink and try the rogue server again — <b>now</b> it is blocked while the real one works. You have produced the outage and the protection five minutes apart, which is the fastest way to remember the order they go in.</div>

<p class="lab-step"><span class="n">4</span>Meet option 82</p>

If your DHCP server is an IOS device, leave option 82 insertion at its default and renew.

<div class="lab-issues"><b>Possible issues</b>
<ul>
<li><b>It works fine</b> — your DHCP server is not doing the sanity check. Many non-Cisco servers accept it. Note which yours is; that is the useful finding.</li>
<li><b>It fails and you cannot see why</b> — capture on the uplink and confirm the Discover carries option 82 with <code>giaddr = 0.0.0.0</code>, then check the server for a drop counter.</li>
<li><b>You fixed it on the switch and it still fails</b> — <code>ip dhcp relay information trust-all</code> goes on the <b>DHCP server device</b>, not the access switch.</li>
</ul>
Fix it both ways in turn — trust at the server, then <code>no ip dhcp snooping information option</code> at the switch — and decide which you would use in production and why.</div>

<p class="lab-step"><span class="n">5</span>Kill the VLAN with DAI</p>

Clear the binding table (`clear ip dhcp snooping binding *`), then immediately:

```cisco
ip arp inspection vlan 10
```

<div class="lab-watch"><b>Things to notice</b>
Everything stops. Every host's ARP is dropped because there are no bindings to validate against, and <code>show ip arp inspection statistics</code> shows the drop count climbing in real time.
<br><br>Now renew every client's lease, watch the bindings reappear, and watch connectivity return host by host as each one gets an entry. <b>That is the rollout risk made visible</b> — in production those hosts would not renew on demand, and you would have an outage lasting until their leases expired.</div>

<p class="lab-step"><span class="n">6</span>Poison an ARP cache, then fail to</p>

With snooping populated and DAI on, run `arpspoof` again.

<div class="lab-watch"><b>Things to notice</b>
Nothing happens to the client's cache, and the switch logs the drop with the offending port and the claimed IP. Capture on the attacker: it is still sending, the switch is simply not forwarding.
<br><br>Then give a host a static IP, do not add a binding for it, and watch that host go offline exactly like the attacker did. <b>DAI cannot tell the difference between an attacker and a device you forgot about</b> — both are unrecorded claims. Add <code>ip source binding</code> for it and it comes back.</div>

<p class="lab-step"><span class="n">7</span>Add IP Source Guard while the table is there</p>

```cisco
interface GigabitEthernet1/0/5
 ip verify source
```

From the client, send traffic with a spoofed source IP.

<div class="lab-watch"><b>Things to notice</b>
Dropped — because the binding table says which IP belongs on that port, and this is not it. You have now used the same table three times: DHCP snooping built it, DAI validates ARP against it, and IP Source Guard validates the IP header against it.
<br><br>That is the real reason snooping is worth the deployment pain. The rogue-server protection is the smallest part of what it gives you.</div>

<div class="lab-earned"><b>What you earned</b>
You have run all three attacks and blocked all three, so you know what each control is actually for rather than what its name suggests. You know the deployment order — port security, snooping, wait, DAI — and you have produced every one of the four self-inflicted outages that come from getting it wrong. You know that option 82 with a zero <code>giaddr</code> is a real production failure with two different fixes and that one of them goes on a device you might not have thought to touch. And you know that DAI cannot distinguish an attacker from a static host nobody documented, which is why the printer hunt happens before the change and not after it.</div>

</div>
</div>

---

## Test yourself

<div class="qz">
<p class="qz-q"><span class="qz-num">Q1</span>You enable DHCP snooping on a VLAN and nobody can get an address any more. What did you miss?</p>
<label class="qz-opt"><input type="radio" name="l2q1"><span>Trusting the uplink toward the real DHCP server</span><em class="qz-fb qz-good">Correct — every port becomes untrusted, and server messages on an untrusted port are dropped. Your own replies arrive over that uplink.</em></label>
<label class="qz-opt"><input type="radio" name="l2q1"><span>The rate limit is too low</span><em class="qz-fb qz-bad">A rate limit err-disables a port rather than silently blocking all DHCP — and it would not affect clients that had not hit the limit.</em></label>
<label class="qz-opt"><input type="radio" name="l2q1"><span>Port security is blocking the server's MAC</span><em class="qz-fb qz-bad">Port security and snooping are independent features.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q2</span>Why must DHCP snooping be enabled before Dynamic ARP Inspection?</p>
<label class="qz-opt"><input type="radio" name="l2q2"><span>DAI validates ARP against snooping's binding table — with no bindings, it drops everything</span><em class="qz-fb qz-good">Right. DAI has no knowledge of its own. Enabling it on a VLAN with an empty table takes that VLAN down instantly.</em></label>
<label class="qz-opt"><input type="radio" name="l2q2"><span>DAI will not start without it configured</span><em class="qz-fb qz-bad">It starts perfectly happily, which is the problem.</em></label>
<label class="qz-opt"><input type="radio" name="l2q2"><span>They share a rate limiter</span><em class="qz-fb qz-bad">They have separate rate limits.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q3</span>Snooping is on, the uplink is trusted, and DHCP still fails. Most likely cause?</p>
<label class="qz-opt"><input type="radio" name="l2q3"><span>Option 82 is inserted with <code>giaddr</code> 0.0.0.0 and the server is dropping those messages</span><em class="qz-fb qz-good">Correct. A snooping switch does not relay, so it never sets <code>giaddr</code> — and Cisco's IOS DHCP server drops option-82 messages with a zero <code>giaddr</code>. Trust them at the server, or stop inserting the option.</em></label>
<label class="qz-opt"><input type="radio" name="l2q3"><span>The VLAN list is wrong</span><em class="qz-fb qz-bad">Then snooping would not be active on that VLAN at all, and nothing would be blocked.</em></label>
<label class="qz-opt"><input type="radio" name="l2q3"><span>DAI is dropping the DHCP packets</span><em class="qz-fb qz-bad">DAI inspects ARP, not DHCP.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q4</span>Which port security violation mode drops offending frames, logs, and leaves the port up?</p>
<label class="qz-opt"><input type="radio" name="l2q4"><span><code>protect</code></span><em class="qz-fb qz-bad">Protect drops silently — no counter and no log, so you never learn it happened.</em></label>
<label class="qz-opt"><input type="radio" name="l2q4"><span><code>restrict</code></span><em class="qz-fb qz-good">Correct — drop, increment the violation counter, syslog and SNMP trap, port stays up. Usually the right production setting.</em></label>
<label class="qz-opt"><input type="radio" name="l2q4"><span><code>shutdown</code></span><em class="qz-fb qz-bad">That is the default, and it err-disables the port — protection at the cost of an outage.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q5</span>A statically addressed server stops working when DAI is enabled. Why, and what fixes it?</p>
<label class="qz-opt"><input type="radio" name="l2q5"><span>It never did DHCP, so it has no binding — add <code>ip source binding</code> or an ARP ACL</span><em class="qz-fb qz-good">Correct. DAI cannot distinguish an undocumented static host from an attacker; both are unrecorded claims. Find them before the change.</em></label>
<label class="qz-opt"><input type="radio" name="l2q5"><span>Its port needs port security disabled</span><em class="qz-fb qz-bad">Unrelated feature.</em></label>
<label class="qz-opt"><input type="radio" name="l2q5"><span>Static addresses are incompatible with DAI</span><em class="qz-fb qz-bad">They work fine once a binding exists for them.</em></label>
</div>

---

## References

- Cisco — [Operate and Troubleshoot DHCP Snooping on Catalyst 9000 Switches](https://www.cisco.com/c/en/us/support/docs/ip/dynamic-host-configuration-protocol-dhcp-dhcpv6/217055-operate-and-troubleshoot-dhcp-snooping.html) — including the option 82 and zero-`giaddr` behaviour.
- Cisco — [Port Security configuration guide, Catalyst 9300](https://www.cisco.com/c/en/us/td/docs/switches/lan/catalyst9300/software/release/17-9/configuration_guide/sec/b_179_sec_9300_cg/port_security.html) — defaults, violation modes and aging.
- Cisco — [Configuring Dynamic ARP Inspection](https://www.cisco.com/c/en/us/td/docs/switches/lan/catalyst9300/software/release/17-9/configuration_guide/sec/b_179_sec_9300_cg/configuring_dynamic_arp_inspection.html)
- **RFC 3046** — DHCP Relay Agent Information Option (option 82).

---

*Related: [DHCP: the DORA process](/blog/dhcp-dora-process-explained) · [802.1Q trunking and DTP](/blog/dot1q-trunking-native-vlan-and-dtp-explained) · [ACLs and uRPF](/blog/access-control-lists-wildcards-placement-ipv6-and-urpf).*

*Part of the [CCNA, ENCOR and ENARSI topic-by-topic study guide](/blog/ccna-ccnp-study-guide).*
