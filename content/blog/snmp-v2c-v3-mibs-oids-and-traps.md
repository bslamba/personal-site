---
title: "SNMP: v2c, v3, OIDs, and Why Your Community String Is Readable on the Wire"
excerpt: "SNMP is how most networks are actually monitored, and most of them are still running a version whose only credential travels in clear text. Here is what an OID really is, the difference between a trap and an inform, the three v3 security levels and which one is worth configuring, and the handful of reasons a poll returns nothing when the device is up and the community is right."
date: "2026-09-24"
tags: ["SNMP", "Monitoring", "MIB", "OID", "Network Management", "CCNA", "ENARSI"]
draft: false
---

> **Blueprint:** CCNA 200-301 — 4.4 *Explain the function of SNMP in network operations*. ENARSI 300-410 — 4.2 *Troubleshoot SNMP (v2c, v3)*.

## Cheat sheet

| | v1 | **v2c** | **v3** |
|---|---|---|---|
| **Credential** | Community string | Community string | **Username + keys** |
| **On the wire** | **Clear text** | **Clear text** | Authenticated, optionally encrypted |
| **Bulk retrieval** | No | **GetBulk** | GetBulk |
| **Confirmed notifications** | No | **Inform** | Inform |
| **Use it** | Never | Only inside a protected network | **Wherever possible** |

| Operation | Direction | Port |
|---|---|---|
| **Get / GetNext / GetBulk** | Manager → agent | **UDP 161** |
| **Set** | Manager → agent | UDP 161 |
| **Trap** | Agent → manager, **fire and forget** | **UDP 162** |
| **Inform** | Agent → manager, **acknowledged** | UDP 162 |

| v3 security level | Authentication | Encryption |
|---|---|---|
| `noAuthNoPriv` | none | none |
| `authNoPriv` | SHA / MD5 | none |
| **`authPriv`** | SHA | **AES** |

**The one that matters operationally.** A **trap** is sent once and never confirmed — if the packet is lost, the event is gone and nobody knows. An **inform** is retransmitted until the manager acknowledges it. If an alert genuinely matters, it should be an inform.

---

## What an OID actually is

An SNMP agent does not have an API. It has a **tree**, and every value in it has an address — a sequence of numbers from the root down to a leaf.

<figure class="fig">
<svg viewBox="0 0 640 265" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The SNMP object identifier tree from the root down to a specific interface counter">
  <style>
    .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}
    .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}
    .m{font-family:ui-monospace,Menlo,monospace;font-size:11px;fill:#17171A}
    .bx{fill:#F1EEE9;stroke:#B5B5BC}.hl{fill:rgba(31,157,107,.14);stroke:#1f9d6b}
    .l{stroke:#8A8A93;stroke-width:1.5}
  </style>
  <rect class="bx" x="270" y="20" width="100" height="24"/><text class="m" x="320" y="37" text-anchor="middle">1 · iso</text>
  <rect class="bx" x="270" y="56" width="100" height="24"/><text class="m" x="320" y="73" text-anchor="middle">3 · org</text>
  <rect class="bx" x="270" y="92" width="100" height="24"/><text class="m" x="320" y="109" text-anchor="middle">6 · dod</text>
  <rect class="bx" x="270" y="128" width="100" height="24"/><text class="m" x="320" y="145" text-anchor="middle">1 · internet</text>
  <line class="l" x1="320" y1="44" x2="320" y2="56"/>
  <line class="l" x1="320" y1="80" x2="320" y2="92"/>
  <line class="l" x1="320" y1="116" x2="320" y2="128"/>
  <line class="l" x1="320" y1="152" x2="320" y2="166"/>
  <line class="l" x1="180" y1="166" x2="460" y2="166"/>
  <line class="l" x1="180" y1="166" x2="180" y2="178"/>
  <line class="l" x1="460" y1="166" x2="460" y2="178"/>
  <rect class="hl" x="120" y="178" width="120" height="24"/><text class="m" x="180" y="195" text-anchor="middle" fill="#0f6b47">2 · mgmt</text>
  <rect class="bx" x="400" y="178" width="120" height="24"/><text class="m" x="460" y="195" text-anchor="middle">4 · private</text>
  <text class="s" x="180" y="220" text-anchor="middle" fill="#0f6b47">standard MIB-2</text>
  <text class="s" x="460" y="220" text-anchor="middle">vendor: 1.3.6.1.4.1.<tspan font-weight="700">9</tspan> = Cisco</text>
  <rect x="14" y="234" width="612" height="26" fill="#fff" stroke="#1f9d6b"/>
  <text class="m" x="24" y="252" fill="#0f6b47">1.3.6.1.2.1.2.2.1.10.3  =  ifInOctets on interface index 3</text>
</svg>
<figcaption><b>Figure 1.</b> Everything under <code>1.3.6.1.2.1</code> is standard and works on any vendor. Everything under <code>1.3.6.1.4.1.9</code> is Cisco's own. The final number on a table OID is the <b>instance</b> — here, the interface index.</figcaption>
</figure>

<div class="why">
<b>The interface index is the thing that bites</b>
<code>ifInOctets.3</code> means "interface index 3" — and <b>ifIndex is not stable</b>. Insert a module, upgrade the software, or reload the device, and the index that was <code>GigabitEthernet0/1</code> may now be something else entirely. Your monitoring system carries on graphing index 3 and silently starts charting a different interface.
<br><br>The fix is <code>snmp-server ifindex persist</code>, which pins the mapping across reloads. Every monitoring deployment should have it, and most discover it the hard way after a maintenance window when a graph mysteriously changes shape.
</div>

---

## The operations, and the one people get wrong

<div class="walk">
<div class="walk-head">Polling, walking, and telling somebody something happened <span class="walk-hint">click a step</span></div>
<div class="walk-tabs">
  <input type="radio" name="snw" id="sn1" checked><label for="sn1"><span class="step-n">1</span>Get</label>
  <input type="radio" name="snw" id="sn2"><label for="sn2"><span class="step-n">2</span>GetNext / walk</label>
  <input type="radio" name="snw" id="sn3"><label for="sn3"><span class="step-n">3</span>GetBulk</label>
  <input type="radio" name="snw" id="sn4"><label for="sn4"><span class="step-n">4</span>Trap</label>
  <input type="radio" name="snw" id="sn5"><label for="sn5"><span class="step-n">5</span>Inform</label>
</div>
<div class="walk-panels">
<div class="walk-panel">
<svg viewBox="0 0 640 180" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The manager requests one specific object identifier and the agent returns its value">
  <style>.n{fill:#17171A}.nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.m{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;fill:#17171A}.q{stroke:#4b7bec;stroke-width:2.5;fill:none}.a{stroke:#1f9d6b;stroke-width:2.5;fill:none}</style>
  <rect class="n" x="30" y="66" width="110" height="34" rx="3"/><text class="nt" x="85" y="88" text-anchor="middle">MANAGER</text>
  <rect class="n" x="500" y="66" width="110" height="34" rx="3"/><text class="nt" x="555" y="88" text-anchor="middle">AGENT</text>
  <path class="q" d="M 140 76 L 500 76"/>
  <circle r="5" fill="#4b7bec"><animateMotion dur="1.7s" repeatCount="indefinite" path="M 140 76 L 500 76"/></circle>
  <path class="a" d="M 500 96 L 140 96"/>
  <circle r="5" fill="#1f9d6b"><animateMotion dur="1.7s" begin="0.85s" repeatCount="indefinite" path="M 500 96 L 140 96"/></circle>
  <text class="m" x="320" y="58" text-anchor="middle" fill="#2b5ab8">Get 1.3.6.1.2.1.1.1.0   → UDP 161</text>
  <text class="m" x="320" y="122" text-anchor="middle" fill="#0f6b47">&#8220;Cisco IOS XE Software, Version 17.9.3&#8221;</text>
  <text class="s" x="320" y="156" text-anchor="middle">The trailing <tspan font-family="ui-monospace,Menlo,monospace">.0</tspan> means &#8220;the single instance&#8221; — scalar objects always end in .0.</text>
</svg>
<p class="walk-say"><span class="walk-title">Get — one named value</span>
The manager asks for one exact OID and gets one value. <code>1.3.6.1.2.1.1.1.0</code> is <code>sysDescr.0</code>, the device's description string.
<br><br>That trailing <b><code>.0</code></b> matters: scalar objects — one per device, like sysDescr or sysUpTime — always carry it. Omit it and the agent returns <code>noSuchObject</code>, which is the most common reason a hand-typed OID fails while the same OID works from the monitoring system.</p>
</div>
<div class="walk-panel">
<svg viewBox="0 0 640 190" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="GetNext walks the tree one object at a time requiring a round trip for each">
  <style>.n{fill:#17171A}.nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700;fill:#B26014}.q{stroke:#F2994A;stroke-width:2;fill:none}</style>
  <rect class="n" x="30" y="70" width="110" height="34" rx="3"/><text class="nt" x="85" y="92" text-anchor="middle">MANAGER</text>
  <rect class="n" x="500" y="70" width="110" height="34" rx="3"/><text class="nt" x="555" y="92" text-anchor="middle">AGENT</text>
  <path class="q" d="M 140 62 L 500 62"/><path class="q" d="M 500 74 L 140 74"/>
  <path class="q" d="M 140 90 L 500 90"/><path class="q" d="M 500 102 L 140 102"/>
  <path class="q" d="M 140 118 L 500 118"/><path class="q" d="M 500 130 L 140 130"/>
  <circle r="4" fill="#F2994A"><animateMotion dur="1.2s" repeatCount="indefinite" path="M 140 62 L 500 62"/></circle>
  <circle r="4" fill="#F2994A"><animateMotion dur="1.2s" begin="0.4s" repeatCount="indefinite" path="M 140 90 L 500 90"/></circle>
  <circle r="4" fill="#F2994A"><animateMotion dur="1.2s" begin="0.8s" repeatCount="indefinite" path="M 140 118 L 500 118"/></circle>
  <text class="k" x="320" y="162" text-anchor="middle">One round trip per object. A full interface table is thousands of them.</text>
  <text class="s" x="320" y="182" text-anchor="middle">This is what <tspan font-family="ui-monospace,Menlo,monospace">snmpwalk</tspan> does, and why walking a large device over a WAN link is slow.</text>
</svg>
<p class="walk-say"><span class="walk-title">GetNext — the walk, and why it is slow</span>
GetNext asks "what is the next object after this one?", which lets a manager enumerate a table without knowing what is in it. Repeat until the OID falls outside the subtree and you have walked the branch.
<br><br>It is <b>one request and one response per value</b>. On a switch with 48 ports and a dozen counters each, that is hundreds of round trips — and over a high-latency link, minutes. That cost is exactly what the next operation exists to remove.</p>
</div>
<div class="walk-panel">
<svg viewBox="0 0 640 185" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="GetBulk returns many values in a single response">
  <style>.n{fill:#17171A}.nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700;fill:#0f6b47}.q{stroke:#4b7bec;stroke-width:2.5;fill:none}.a{stroke:#1f9d6b;stroke-width:4;fill:none}</style>
  <rect class="n" x="30" y="70" width="110" height="34" rx="3"/><text class="nt" x="85" y="92" text-anchor="middle">MANAGER</text>
  <rect class="n" x="500" y="70" width="110" height="34" rx="3"/><text class="nt" x="555" y="92" text-anchor="middle">AGENT</text>
  <path class="q" d="M 140 78 L 500 78"/>
  <circle r="5" fill="#4b7bec"><animateMotion dur="1.7s" repeatCount="indefinite" path="M 140 78 L 500 78"/></circle>
  <path class="a" d="M 500 98 L 140 98"/>
  <circle r="6" fill="#1f9d6b"><animateMotion dur="1.7s" begin="0.85s" repeatCount="indefinite" path="M 500 98 L 140 98"/></circle>
  <text class="s" x="320" y="64" text-anchor="middle" fill="#2b5ab8">GetBulk max-repetitions 25</text>
  <text class="k" x="320" y="132" text-anchor="middle">One request, 25 values back.</text>
  <text class="s" x="320" y="158" text-anchor="middle"><tspan font-weight="700">v2c and later only.</tspan> If your poller is slow, check it is not falling back to v1.</text>
  <text class="s" x="320" y="176" text-anchor="middle">Set max-repetitions too high and the response fragments, which some devices handle badly.</text>
</svg>
<p class="walk-say"><span class="walk-title">GetBulk — the reason v2c exists</span>
One request returns many values, which turns a table walk from hundreds of round trips into a handful. It is the single biggest practical difference between v1 and v2c, and it is why polling a large switch with v1 can take longer than the polling interval.
<br><br>If your monitoring is timing out on big devices, check which version it is actually negotiating before you blame the network.</p>
</div>
<div class="walk-panel">
<svg viewBox="0 0 640 195" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A trap is sent once with no acknowledgement so a lost packet means a lost alert">
  <style>.n{fill:#17171A}.nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700;fill:#B80027}.t{stroke:#D3002D;stroke-width:2.5;fill:none}</style>
  <rect class="n" x="30" y="70" width="110" height="34" rx="3"/><text class="nt" x="85" y="92" text-anchor="middle">MANAGER</text>
  <rect class="n" x="500" y="70" width="110" height="34" rx="3"/><text class="nt" x="555" y="92" text-anchor="middle">AGENT</text>
  <path class="t" d="M 500 87 L 320 87"/>
  <circle r="5" fill="#D3002D"><animateMotion dur="1.8s" repeatCount="indefinite" path="M 500 87 L 340 87"/></circle>
  <line x1="310" y1="77" x2="328" y2="97" stroke="#D3002D" stroke-width="2.5"/>
  <line x1="328" y1="77" x2="310" y2="97" stroke="#D3002D" stroke-width="2.5"/>
  <text class="s" x="420" y="66" text-anchor="middle">Trap → UDP 162, once</text>
  <text class="k" x="320" y="140" text-anchor="middle">Dropped in transit, and neither end will ever know.</text>
  <text class="s" x="320" y="164" text-anchor="middle">The agent does not retransmit and does not expect a reply. The event simply did not happen,</text>
  <text class="s" x="320" y="180" text-anchor="middle">as far as your monitoring is concerned.</text>
</svg>
<p class="walk-say"><span class="walk-title">Trap — fire and forget</span>
The agent sends one UDP packet to the manager and moves on. No acknowledgement, no retransmission, no record. If a queue drops it — and congestion is exactly when interesting events happen — the alert is gone silently.
<br><br>This is the failure mode behind "we never got an alert for that outage". The trap was almost certainly sent.</p>
</div>
<div class="walk-panel">
<svg viewBox="0 0 640 195" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="An inform is acknowledged and retransmitted until the manager confirms receipt">
  <style>.n{fill:#17171A}.nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700;fill:#0f6b47}.t{stroke:#1f9d6b;stroke-width:2.5;fill:none}.a{stroke:#4b7bec;stroke-width:2.5;fill:none}</style>
  <rect class="n" x="30" y="70" width="110" height="34" rx="3"/><text class="nt" x="85" y="92" text-anchor="middle">MANAGER</text>
  <rect class="n" x="500" y="70" width="110" height="34" rx="3"/><text class="nt" x="555" y="92" text-anchor="middle">AGENT</text>
  <path class="t" d="M 500 78 L 140 78"/>
  <circle r="5" fill="#1f9d6b"><animateMotion dur="1.7s" repeatCount="indefinite" path="M 500 78 L 140 78"/></circle>
  <path class="a" d="M 140 98 L 500 98"/>
  <circle r="5" fill="#4b7bec"><animateMotion dur="1.7s" begin="0.85s" repeatCount="indefinite" path="M 140 98 L 500 98"/></circle>
  <text class="s" x="320" y="64" text-anchor="middle" fill="#0f6b47">Inform → UDP 162</text>
  <text class="s" x="320" y="124" text-anchor="middle" fill="#2b5ab8">Response — acknowledged</text>
  <text class="k" x="320" y="158" text-anchor="middle">Retransmitted until confirmed. The agent holds it in memory until then.</text>
  <text class="s" x="320" y="182" text-anchor="middle">Costs memory on the agent and a round trip. Worth it for anything you would be paged about.</text>
</svg>
<p class="walk-say"><span class="walk-title">Inform — the same event, confirmed</span>
An inform carries identical content to a trap but the manager must acknowledge it, and the agent retransmits until it does. The cost is memory on the device and a round trip per notification.
<br><br><b>The rule of thumb:</b> informational notifications can be traps; anything that would page somebody should be an inform. And note informs need a <code>snmp-server engineID remote</code> entry for the manager when using v3 — a step people miss, after which the informs are sent and silently discarded.</p>
</div>
</div>
</div>

### v2c on the wire — and why you should read this once

<div class="cap">
<div class="cap-head">Capture · SNMPv2c GetRequest <span class="cap-filter">snmp</span></div>
<div class="cap-hex"><pre>0000  45 00 00 45 12 34 00 00  ff 11 95 41 0a 00 00 32   E..E.4.....A...2
0010  0a 00 00 01 bc 53 <mark>00 a1</mark>  00 31 00 00 <mark>30</mark> 27 <mark>02 01</mark>   .....S...1..0'..
0020  <mark>01</mark> <mark>04 06 70 75 62 6c 69  63</mark> <mark>a0</mark> 1a 02 02 1a 2b 02   ...public.....+.
0030  01 00 02 01 00 30 0e 30  0c 06 08 <mark>2b 06 01 02 01</mark>   .....0.0...+....
0040  <mark>01 01 00</mark> 05 00                                    .....</pre></div>
<div class="cap-note"><b><code>70 75 62 6c 69 63</code> is the word <code>public</code>, in plain ASCII.</b> That is the entire credential for SNMPv2c, readable by anyone who can see the packet — on a SPAN port, a compromised host, or a mirrored uplink. It is not hashed, not encrypted, not challenged.
<br><br>The rest decodes cleanly too: <code>30</code> opens a BER SEQUENCE, <code>02 01 01</code> is version INTEGER <b>1</b> — which means <b>v2c</b>, because the field counts from zero — <code>04 06</code> is the six-byte community string, and <code>a0</code> is the GetRequest PDU. Then <code>06 08 2b 06 01 02 01 01 01 00</code> is the OID: <code>2b</code> encodes the first two arcs <code>1.3</code> in a single byte, and the rest reads straight off as <code>6.1.2.1.1.1.0</code> — <b>sysDescr.0</b>.
<br><br>And <code>00 a1</code> is destination port <b>161</b>. If that community string is also your write community, someone reading this packet can reconfigure the device.</div>
</div>

---

## Configuration, word by word

<div class="cmd">
<div class="cmd-line"><span class="opt">! v3 — what you should actually deploy</span>
<span class="t">snmp-server view</span> <span class="opt">READ-ONLY iso included</span>
<span class="t">snmp-server view</span> <span class="opt">READ-ONLY internet.6.3.15 excluded</span>
<span class="t">snmp-server group</span> <span class="opt">MONITOR v3 priv read READ-ONLY access</span> <span class="opt">20</span>
<span class="t">snmp-server user</span> <span class="opt">nms MONITOR v3 auth sha</span> <span class="opt">&lt;authpass&gt;</span> <span class="t">priv aes 128</span> <span class="opt">&lt;privpass&gt;</span>
!
<span class="t">snmp-server host</span> <span class="opt">10.0.0.50</span> <span class="t">informs version 3 priv</span> <span class="opt">nms</span>
<span class="t">snmp-server enable traps</span> <span class="opt">snmp linkdown linkup</span>
<span class="t">snmp-server ifindex persist</span>
<span class="t">snmp-server trap-source</span> <span class="opt">Loopback0</span>
!
access-list 20 permit 10.0.0.50</div>
<dl class="cmd-parts">
<div class="is-key"><dt>snmp-server view</dt><dd>Limits which part of the tree the group can read. <code>iso included</code> grants the whole standard tree; the second line then <b>excludes</b> the USM user table, which otherwise lets an authenticated reader enumerate your other SNMP users. Views are evaluated so that a more specific exclusion wins — build the broad grant first, then carve out.</dd></div>
<div class="is-key"><dt>group … v3 <b>priv</b></dt><dd>The security level the group <b>requires</b>. <code>noauth</code>, <code>auth</code> or <code>priv</code>. A user may authenticate more strongly than the group demands but never less, so setting the group to <code>priv</code> is what actually enforces encryption.</dd></div>
<div class="is-key"><dt>user … auth sha …<br>priv aes 128</dt><dd>Two separate secrets: one to prove identity, one to encrypt. <b>Use SHA and AES</b> — MD5 and DES are still accepted and both are broken. Note the user line does not appear in <code>show running-config</code> in readable form, so record the passwords somewhere before you need them.</dd></div>
<div class="is-key"><dt>host … <b>informs</b><br>version 3 priv</dt><dd><code>informs</code> rather than <code>traps</code> for anything that matters. With v3 this also needs the manager's engine ID known to the device — configure <code>snmp-server engineID remote 10.0.0.50 &lt;id&gt;</code> or informs are sent and silently discarded, which is a maddening failure because everything looks configured.</dd></div>
<div><dt>enable traps<br>snmp linkdown linkup</dt><dd>Nothing is sent until you enable the specific categories. <code>snmp-server enable traps</code> with no keywords enables <b>everything</b>, which on a busy switch is a lot of noise and a real CPU cost. Enable what your manager actually consumes.</dd></div>
<div class="is-key"><dt>ifindex persist</dt><dd>Pins interface indices across reloads. Without it a reload can renumber interfaces and your graphs quietly start charting a different port. This is one line and it prevents a class of monitoring error that is very hard to spot after the fact.</dd></div>
<div><dt>trap-source Loopback0</dt><dd>So notifications always arrive from the same address whatever path they take. Managers frequently key on source address; without this, a link failover makes the device look like a new host.</dd></div>
<div class="is-key"><dt>access-list 20 …<br>+ <code>access 20</code></dt><dd>Restrict SNMP to your management stations. SNMP is a <b>remote read and, with write access, remote configuration</b> interface on every device you own. The ACL is the difference between an internal management protocol and one anybody on the network can query.</dd></div>
</dl>
</div>

<div class="warn">
<b>Do not configure a write community</b>
<code>snmp-server community private RW</code> gives anyone who learns that string the ability to change configuration, reload the device, or TFTP the running config off it — with a credential that travels in clear text on v2c. It has been used in real compromises exactly that way. If you genuinely need write access, use <b>v3 with <code>priv</code></b>, restrict it with a view to the specific objects required, and restrict it by ACL to one host. In most networks the honest answer is that nothing needs SNMP write at all.
</div>

---

## Troubleshooting a poll that returns nothing

<div class="term">
<div class="term-bar"><span class="term-dots"><i></i><i></i><i></i></span>R1 — work down this list, it is short</div>
<pre><span class="p">R1#</span> <span class="c">show snmp</span>
Chassis: FTX1840ABCD
<span class="y">148923 SNMP packets input</span>
    0 Bad SNMP version errors
    <span class="r">412 Unknown community name</span>            <span class="o">&lt;- wrong community, or a scanner</span>
    0 Illegal operation for community name supplied
    <span class="r">37 Encoding errors</span>
148511 SNMP packets output
    <span class="g">0 Too big errors</span>

<span class="o">! If "packets input" is ZERO, nothing is arriving — this is a network or ACL</span>
<span class="o">! problem, not an SNMP one. Stop looking at snmp-server commands.</span>

<span class="p">R1#</span> <span class="c">show snmp community</span>
Community name: <span class="y">RO-MONITOR</span>
Community Index: RO-MONITOR
Community SecurityName: RO-MONITOR
storage-type: nonvolatile        active   <span class="y">access-list: 20</span>

<span class="p">R1#</span> <span class="c">show snmp user</span>
User name: nms
Engine ID: 800000090300001A2B3C4D5E
storage-type: nonvolatile        active
Authentication Protocol: <span class="g">SHA</span>
Privacy Protocol: <span class="g">AES128</span>
Group-name: <span class="y">MONITOR</span>

<span class="p">R1#</span> <span class="c">show snmp group</span>
groupname: MONITOR                          security model:<span class="y">v3 priv</span>
readview : READ-ONLY                        writeview: &lt;no writeview specified&gt;
notifyview: *tv.FFFFFFFF.FFFFFFFF.FFFFFFFF.F
row status: active     <span class="y">access-list: 20</span>

<span class="p">R1#</span> <span class="c">show snmp host</span>
Notification host: 10.0.0.50    udp-port: 162   type: <span class="g">inform</span>
user: nms       security model: v3 priv<span class="cur"></span></pre>
</div>
<p class="term-cap"><b>The first counter settles which half of the problem you have.</b> <code>SNMP packets input</code> at zero means the request is not arriving — routing, firewall, or the ACL on the <code>snmp-server</code> line. Non-zero with <code>Unknown community name</code> means it arrived and was rejected, which is a credential problem. Those are two completely different investigations and the counter tells you which in one line.</p>

<div class="real">
<b>In the real world</b>
The commonest SNMP fault is not v3 complexity — it is a <b>view that does not include what the manager asks for</b>. Someone tightens the read view to a specific subtree, the monitoring system polls something just outside it, and the agent returns <code>noSuchObject</code> for that one OID while everything else works. The graph goes flat, nothing errors, and because 90% of the polling still succeeds nobody suspects SNMP configuration.
<br><br>Test from the manager, not from theory: <code>snmpwalk -v3 -l authPriv -u nms -a SHA -A &lt;pass&gt; -x AES -X &lt;pass&gt; 10.0.0.1 1.3.6.1.2.1</code>. If a subtree stops mid-walk, you have found your view boundary.
</div>

---

## What goes wrong

**Nothing arrives at all.** `SNMP packets input` is zero — network path or ACL, not SNMP.

**`Unknown community name` counting up.** Wrong string, or internet-facing scanners trying `public`. Both worth acting on.

**v3 user works for `get` but not `walk`.** The view does not cover the subtree. `show snmp group` and check the read view.

**Informs are sent and never acknowledged.** The manager's remote engine ID is not configured on the device.

**Graphs changed interface after a reload.** `ifindex persist` was not set.

**Polling times out on large switches.** The manager fell back to v1, so no GetBulk. Check the negotiated version.

**Traps arrive from an unexpected address.** No `trap-source`; the source follows the egress interface.

---

<div class="lab">
<div class="lab-head">Lab — read a community off the wire, then make it impossible</div>
<div class="lab-body">

<div class="lab-target"><b>Target</b>
Poll a device with v2c and capture your own community string in clear text, then rebuild the same access with v3 <code>authPriv</code> and confirm the capture is now unreadable. Walk a table and watch GetNext's round trips. Break the poll four ways — ACL, view, wrong level, wrong engine ID — and identify each from the counters alone.</div>

**Topology.** One router or switch, one Linux host with `snmp` and `snmp-mibs-downloader` installed, and a capture running between them.

<p class="lab-step"><span class="n">1</span>Configure v2c and read your own password</p>

```cisco
access-list 20 permit 10.0.0.50
snmp-server community RO-MONITOR RO 20
```

From the host, with a capture running:

```bash
snmpget -v2c -c RO-MONITOR 10.0.0.1 1.3.6.1.2.1.1.1.0
```

<div class="lab-watch"><b>Things to notice</b>
Find <code>RO-MONITOR</code> in the capture as plain ASCII — in Wireshark it is a named field, and in the raw hex it is readable text. <b>That is the whole credential.</b>
<br><br>Now omit the trailing <code>.0</code> and watch it fail with <code>noSuchObject</code>, which is the single most common hand-typed OID mistake.</div>

<p class="lab-step"><span class="n">2</span>Watch a walk cost round trips</p>

```bash
snmpwalk -v1  -c RO-MONITOR 10.0.0.1 1.3.6.1.2.1.2.2.1.2
snmpbulkwalk -v2c -c RO-MONITOR 10.0.0.1 1.3.6.1.2.1.2.2.1.2
```

<div class="lab-watch"><b>Things to notice</b>
Count packets in the capture for each. v1's walk is one request per value; the v2c bulk walk collapses it dramatically. Time both — on a switch with many interfaces the difference is obvious, and over a simulated high-latency link it is dramatic.
<br><br>That comparison is why a monitoring system that silently falls back to v1 starts timing out on your biggest devices first.</div>

<p class="lab-step"><span class="n">3</span>Rebuild it with v3 and capture again</p>

```cisco
snmp-server view READ-ONLY iso included
snmp-server group MONITOR v3 priv read READ-ONLY access 20
snmp-server user nms MONITOR v3 auth sha Auth-Pass-123 priv aes 128 Priv-Pass-123
```

```bash
snmpget -v3 -l authPriv -u nms -a SHA -A Auth-Pass-123 -x AES -X Priv-Pass-123 10.0.0.1 1.3.6.1.2.1.1.1.0
```

<div class="lab-watch"><b>Things to notice</b>
The capture now shows an SNMPv3 header with the engine ID and username <b>visible</b> — v3 does not hide who you are — but the PDU itself is <b>encrypted</b>. The OID and the returned value are gone from the plain text.
<br><br>Then try it with <code>-l authNoPriv</code> and watch the PDU become readable again while still being authenticated. <b>That is the difference between the two levels, visible in one capture</b>, and it is the best argument for always using <code>priv</code>.</div>

<p class="lab-step"><span class="n">4</span>Break it four ways and diagnose from counters only</p>

Do each, run `show snmp` before fixing:

1. Remove `10.0.0.50` from access-list 20.
2. Restore, then narrow the view to `1.3.6.1.2.1.1` and walk `1.3.6.1.2.1.2`.
3. Poll with `-l authNoPriv` against a group configured for `priv`.
4. Configure an inform host without the remote engine ID.

<div class="lab-issues"><b>Possible issues</b>
<ul>
<li><b>All four look identical from the manager</b> — that is exactly the point. The manager just times out. The counters on the device distinguish them.</li>
<li><b>Case 1 shows packets arriving</b> — the ACL is on the wrong command. It goes on the <code>snmp-server community</code> or <code>snmp-server group</code> line.</li>
<li><b>Case 3 gives an authorisation error rather than silence</b> — good, note the exact wording; it is the clearest of the four.</li>
<li><b>Case 4 shows informs leaving</b> — they do leave. They are discarded at the far end. Capture on the manager to confirm.</li>
</ul>
Write down which counter moved for each. <b>Zero input means the packet never arrived; a non-zero input with an error counter means it arrived and was refused</b> — and that single distinction cuts the search space in half every time.</div>

<p class="lab-step"><span class="n">5</span>Trap versus inform, with loss</p>

Configure `linkdown` and `linkup` notifications as **traps**, then introduce packet loss toward the manager (`tc qdisc add dev eth0 root netem loss 40%`) and flap an interface repeatedly.

<div class="lab-watch"><b>Things to notice</b>
Some events never arrive, and <b>the device shows no sign of it</b> — no retransmission, no error, no counter. Now switch to <code>informs</code> and repeat: the agent retransmits and the events get through.
<br><br>Check memory with <code>show snmp pending</code> while informs are outstanding. That is the cost, and it is the reason informs are not the default — but for anything that pages a human, it is the right trade.</div>

<p class="lab-step"><span class="n">6</span>Watch ifIndex move</p>

Note the ifIndex of an interface (`snmpwalk … ifDescr`), reload the device, and check again. Then set `snmp-server ifindex persist` and repeat.

<div class="lab-watch"><b>Things to notice</b>
Without persistence the mapping can change — and a monitoring system polling by index would now be graphing a different interface <b>with no error at all</b>. That is the failure that gets discovered weeks later when a graph does not match reality.</div>

<div class="lab-earned"><b>What you earned</b>
You have read your own SNMP community string out of a packet capture, which makes the case for v3 better than any documentation. You have seen <code>authNoPriv</code> and <code>authPriv</code> side by side in captures and know exactly what encryption buys. You can tell "the packet never arrived" from "the packet was refused" using one counter, which halves the search space on every SNMP fault. You know a trap that is lost is lost silently, and that informs cost memory to fix it. And you know why <code>ifindex persist</code> belongs in every build template.</div>

</div>
</div>

---

## Test yourself

<div class="qz">
<p class="qz-q"><span class="qz-num">Q1</span>What is the practical difference between a trap and an inform?</p>
<label class="qz-opt"><input type="radio" name="snq1"><span>An inform is acknowledged and retransmitted; a trap is sent once and never confirmed</span><em class="qz-fb qz-good">Correct. A lost trap is lost silently, which is why anything that would page somebody should be an inform.</em></label>
<label class="qz-opt"><input type="radio" name="snq1"><span>An inform uses TCP, a trap uses UDP</span><em class="qz-fb qz-bad">Both use UDP 162. The acknowledgement is at the SNMP layer.</em></label>
<label class="qz-opt"><input type="radio" name="snq1"><span>Traps are v3 only</span><em class="qz-fb qz-bad">Traps exist in every version; informs arrived with v2c.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q2</span>Why is SNMPv2c unsuitable for an untrusted network?</p>
<label class="qz-opt"><input type="radio" name="snq2"><span>The community string travels in clear text and is the entire credential</span><em class="qz-fb qz-good">Correct — you can read it in the hex of any capture. With a write community, that string is remote configuration access.</em></label>
<label class="qz-opt"><input type="radio" name="snq2"><span>It does not support GetBulk</span><em class="qz-fb qz-bad">GetBulk is one of v2c's additions. The problem is authentication, not capability.</em></label>
<label class="qz-opt"><input type="radio" name="snq2"><span>It uses TCP, which can be hijacked</span><em class="qz-fb qz-bad">It uses UDP.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q3</span><code>show snmp</code> shows <code>SNMP packets input: 0</code> while the manager times out. Where is the fault?</p>
<label class="qz-opt"><input type="radio" name="snq3"><span>Below SNMP — routing, a firewall, or the ACL. The request never arrived</span><em class="qz-fb qz-good">Right, and that single counter saves you from debugging SNMP configuration that is probably fine. A credential problem would show a non-zero input with an error counter.</em></label>
<label class="qz-opt"><input type="radio" name="snq3"><span>The community string is wrong</span><em class="qz-fb qz-bad">That increments <code>Unknown community name</code> — which requires the packet to have arrived.</em></label>
<label class="qz-opt"><input type="radio" name="snq3"><span>The view is too narrow</span><em class="qz-fb qz-bad">Again, that needs the request to have been received first.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q4</span>What does the trailing <code>.0</code> in <code>1.3.6.1.2.1.1.1.0</code> mean?</p>
<label class="qz-opt"><input type="radio" name="snq4"><span>The instance — scalar objects have exactly one, numbered 0</span><em class="qz-fb qz-good">Correct. Omit it and the agent returns <code>noSuchObject</code>, which is the classic hand-typed OID mistake. Table objects use the row index instead.</em></label>
<label class="qz-opt"><input type="radio" name="snq4"><span>The SNMP version</span><em class="qz-fb qz-bad">The version is in the packet header, not the OID.</em></label>
<label class="qz-opt"><input type="radio" name="snq4"><span>Padding, and it is optional</span><em class="qz-fb qz-bad">It is required, and omitting it changes the result.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q5</span>Graphs for an interface changed to a different port after a reload. Why?</p>
<label class="qz-opt"><input type="radio" name="snq5"><span>ifIndex was renumbered and <code>snmp-server ifindex persist</code> is not configured</span><em class="qz-fb qz-good">Correct — the poller kept asking for the same index and the index now means a different interface. No error is generated anywhere.</em></label>
<label class="qz-opt"><input type="radio" name="snq5"><span>The community string changed</span><em class="qz-fb qz-bad">That would stop polling entirely rather than shift it.</em></label>
<label class="qz-opt"><input type="radio" name="snq5"><span>GetBulk returned values out of order</span><em class="qz-fb qz-bad">Ordering within a response does not remap indices.</em></label>
</div>

---

## References

- **RFC 3410–3418** — the SNMPv3 framework, including USM (3414) and VACM (3415).
- **RFC 1157** — SNMPv1, and **RFC 3416** — the v2 protocol operations including GetBulk.
- Cisco — [Configuring SNMP](https://www.cisco.com/c/en/us/td/docs/switches/lan/catalyst9300/software/release/17-3/configuration_guide/nmgmt/b_173_nmgmt_9300_cg/configuring_snmp.html)
- Cisco — [SNMP Configuration Best Practices](https://www.cisco.com/c/en/us/support/docs/ip/simple-network-management-protocol-snmp/7244-snmp-trap.html)

---

*Related: [Syslog and debugging](/blog/syslog-severities-timestamps-and-conditional-debugging) · [NTP and PTP](/blog/ntp-and-ptp-explained-stratum-offset-and-why-time-matters).*

*Part of the [CCNA, ENCOR and ENARSI topic-by-topic study guide](/blog/ccna-ccnp-study-guide).*
