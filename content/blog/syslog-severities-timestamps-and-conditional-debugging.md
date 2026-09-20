---
title: "Syslog and Debugging: Severities, Facilities, Timestamps, and How to Debug Without Killing the Router"
excerpt: "Eight severity levels, one number that decides what leaves the box, and a timestamp format that is wrong by default in a way that makes correlation impossible. Then debugs — the most useful troubleshooting tool on IOS and the easiest way to take a production router down, unless you know how to aim one at a single neighbour."
date: "2026-09-24"
tags: ["Syslog", "Logging", "Debug", "Troubleshooting", "CCNA", "ENARSI"]
draft: false
---

> **Blueprint:** CCNA 200-301 — 4.5 *Describe the use of syslog features, including facilities and severity levels*. ENARSI 300-410 — 4.3 *Troubleshoot network problems using logging (local, syslog, debugs, conditional debugs, timestamps)*.

## Cheat sheet

| Level | Name | Keyword | What lives here |
|---|---|---|---|
| **0** | Emergency | `emergencies` | System unusable |
| **1** | Alert | `alerts` | Immediate action needed |
| **2** | Critical | `critical` | Critical condition |
| **3** | Error | `errors` | **`%LINK-3-UPDOWN`** — interface down |
| **4** | Warning | `warnings` | **`%SPANTREE-4-...`**, duplex mismatch |
| **5** | Notification | `notifications` | **`%LINEPROTO-5-UPDOWN`**, config changes |
| **6** | Informational | `informational` | ACL hits, routine events |
| **7** | Debugging | `debugging` | **All `debug` output** |

| | |
|---|---|
| **Transport** | **UDP 514** by default. Unreliable, unauthenticated, unencrypted |
| **PRI** | `facility × 8 + severity` — one number at the front of every message |
| **Cisco default facility** | **local7** (23), so a notification is `23 × 8 + 5 = 189` |
| **`logging trap N`** | Send severity **0 through N**. Higher numbers are dropped |
| **Default console level** | **7 (debugging)** — everything, on the console, synchronously |
| **Where debugs go** | Severity 7, so they need `logging trap 7` to leave the box at all |

**The number that catches people.** `logging trap 4` does **not** mean "send level 4". It means **send 0 to 4 inclusive** — everything as bad as, or worse than, a warning. Set it to 3 and you stop receiving the `%LINEPROTO-5-UPDOWN` messages that tell you an interface came back.

---

## One event, and the number that decides its fate

<div class="walk">
<div class="walk-head">From interface down to a line in your SIEM <span class="walk-hint">click a step</span></div>
<div class="walk-tabs">
  <input type="radio" name="slw" id="sl1" checked><label for="sl1"><span class="step-n">1</span>The event</label>
  <input type="radio" name="slw" id="sl2"><label for="sl2"><span class="step-n">2</span>Severity</label>
  <input type="radio" name="slw" id="sl3"><label for="sl3"><span class="step-n">3</span>Four destinations</label>
  <input type="radio" name="slw" id="sl4"><label for="sl4"><span class="step-n">4</span>On the wire</label>
  <input type="radio" name="slw" id="sl5"><label for="sl5"><span class="step-n">5</span>The timestamp</label>
</div>
<div class="walk-panels">
<div class="walk-panel">
<svg viewBox="0 0 640 175" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="An interface goes down and the router generates a log message">
  <style>.n{fill:#17171A}.nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.m{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;fill:#17171A}</style>
  <rect class="n" x="40" y="56" width="90" height="34" rx="3"/><text class="nt" x="85" y="78" text-anchor="middle">R1</text>
  <line x1="130" y1="73" x2="250" y2="73" stroke="#D3002D" stroke-width="2.5" stroke-dasharray="5 4"/>
  <line x1="180" y1="63" x2="198" y2="83" stroke="#D3002D" stroke-width="2.5"/>
  <line x1="198" y1="63" x2="180" y2="83" stroke="#D3002D" stroke-width="2.5"/>
  <rect x="290" y="52" width="320" height="42" fill="#0C0C0E"/>
  <text class="m" x="302" y="78" fill="#FF6B81">%LINK-3-UPDOWN: Interface Gi0/1, down</text>
  <text class="k" x="320" y="128" text-anchor="middle">The <tspan font-family="ui-monospace,Menlo,monospace">3</tspan> in the middle of the mnemonic <tspan font-style="italic">is</tspan> the severity.</text>
  <text class="s" x="320" y="152" text-anchor="middle">%FACILITY-SEVERITY-MNEMONIC — you can read the level straight off any Cisco message.</text>
</svg>
<p class="walk-say"><span class="walk-title">Every Cisco message tells you its own level</span>
The format is <code>%FACILITY-SEVERITY-MNEMONIC</code>. In <code>%LINK-<b>3</b>-UPDOWN</code> the middle field is the severity — <b>3, an error</b>. In <code>%LINEPROTO-<b>5</b>-UPDOWN</code> it is 5, a notification.
<br><br>That is why the same physical event produces two messages at two different levels: the <b>link</b> going down is an error, the <b>line protocol</b> following it is merely notable. Filter at level 3 and you see the failure but never the recovery.</p>
</div>
<div class="walk-panel">
<svg viewBox="0 0 640 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The logging trap level decides which severities are sent to the syslog server">
  <style>.s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.m{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;fill:#17171A}.on{fill:rgba(31,157,107,.16);stroke:#1f9d6b}.off{fill:#F1EEE9;stroke:#B5B5BC}</style>
  <text class="k" x="14" y="24">logging trap 5 — sent: 0,1,2,3,4,5   dropped: 6,7</text>
  <rect class="on" x="14" y="34" width="72" height="26"/><text class="m" x="50" y="51" text-anchor="middle">0 emerg</text>
  <rect class="on" x="90" y="34" width="72" height="26"/><text class="m" x="126" y="51" text-anchor="middle">1 alert</text>
  <rect class="on" x="166" y="34" width="72" height="26"/><text class="m" x="202" y="51" text-anchor="middle">2 crit</text>
  <rect class="on" x="242" y="34" width="72" height="26"/><text class="m" x="278" y="51" text-anchor="middle">3 err</text>
  <rect class="on" x="318" y="34" width="72" height="26"/><text class="m" x="354" y="51" text-anchor="middle">4 warn</text>
  <rect class="on" x="394" y="34" width="80" height="26"/><text class="m" x="434" y="51" text-anchor="middle">5 notif</text>
  <rect class="off" x="478" y="34" width="72" height="26" opacity=".5"/><text class="m" x="514" y="51" text-anchor="middle" opacity=".5">6 info</text>
  <rect class="off" x="554" y="34" width="72" height="26" opacity=".5"/><text class="m" x="590" y="51" text-anchor="middle" opacity=".5">7 debug</text>
  <text class="s" x="14" y="88">Lower number = more severe. The trap level is a <tspan font-weight="700">ceiling</tspan>, not a selection.</text>
  <rect x="14" y="106" width="612" height="54" fill="#FFF1F3" stroke="#D3002D"/>
  <text class="k" x="26" y="128" fill="#B80027">Set it to 3 and you lose interface recovery messages.</text>
  <text class="s" x="26" y="148"><tspan font-family="ui-monospace,Menlo,monospace">%LINK-3-UPDOWN</tspan> (down) arrives. <tspan font-family="ui-monospace,Menlo,monospace">%LINEPROTO-5-UPDOWN</tspan> (up) does not. You see every failure and no recovery.</text>
  <text class="s" x="14" y="186">Level 6 is the usual production setting: everything except debug output.</text>
</svg>
<p class="walk-say"><span class="walk-title">The trap level is a ceiling</span>
<code>logging trap 5</code> sends <b>every message of severity 5 or lower-numbered</b>. It is inclusive and it works downward, which is the opposite of how most people first read it.
<br><br><b>Level 6 (informational) is the sensible production default.</b> It captures configuration changes, interface transitions and authentication events while excluding debug output, which is level 7 and would otherwise flood your collector the instant anybody runs a <code>debug</code>.</p>
</div>
<div class="walk-panel">
<svg viewBox="0 0 640 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A log message can go to the console the buffer the vty lines and a syslog server each with its own level">
  <style>.n{fill:#17171A}.nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.s{font-family:ui-sans-serif,system-ui;font-size:10px;fill:#5C5C64}.k{font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.m{font-family:ui-monospace,Menlo,monospace;font-size:10px;fill:#17171A}.bx{fill:#F1EEE9;stroke:#B5B5BC}</style>
  <rect class="n" x="270" y="86" width="100" height="36" rx="3"/><text class="nt" x="320" y="109" text-anchor="middle">message</text>
  <rect class="bx" x="14" y="24" width="180" height="30"/><text class="m" x="24" y="44">console — level 7, default</text>
  <rect class="bx" x="14" y="66" width="180" height="30"/><text class="m" x="24" y="86">buffer — logging buffered</text>
  <rect class="bx" x="446" y="24" width="180" height="30"/><text class="m" x="456" y="44">vty — needs terminal monitor</text>
  <rect class="bx" x="446" y="66" width="180" height="30"/><text class="m" x="456" y="86">syslog — logging trap N</text>
  <line x1="270" y1="98" x2="194" y2="44" stroke="#8A8A93" stroke-width="1.5"/>
  <line x1="270" y1="104" x2="194" y2="84" stroke="#8A8A93" stroke-width="1.5"/>
  <line x1="370" y1="98" x2="446" y2="44" stroke="#8A8A93" stroke-width="1.5"/>
  <line x1="370" y1="104" x2="446" y2="84" stroke="#1f9d6b" stroke-width="2.5"/>
  <circle r="4" fill="#1f9d6b"><animateMotion dur="1.8s" repeatCount="indefinite" path="M 370 104 L 446 84"/></circle>
  <rect x="14" y="140" width="612" height="58" fill="#FFF1F3" stroke="#D3002D"/>
  <text class="k" x="26" y="162" fill="#B80027">The console is the dangerous one</text>
  <text class="s" x="26" y="180">It defaults to level 7, and console output is <tspan font-weight="700">synchronous</tspan> — the CPU waits for each line to be written.</text>
  <text class="s" x="26" y="194">A busy debug on a console-connected router can make it stop forwarding. <tspan font-family="ui-monospace,Menlo,monospace">no logging console</tspan> is standard practice.</text>
</svg>
<p class="walk-say"><span class="walk-title">Four destinations, four independent levels</span>
The same message can go to the <b>console</b>, the <b>internal buffer</b>, an <b>SSH session</b> and a <b>syslog server</b> — and each has its own level setting, so a message can reach one and not another.
<br><br>An SSH session shows nothing unless you type <code>terminal monitor</code>, which catches people constantly: they run a debug over SSH, see no output, and assume the debug is not working.
<br><br>And the console is a genuine performance hazard. Its output is written synchronously, so on a heavily logging router it can consume enough CPU to affect forwarding. <code>no logging console</code> plus <code>logging buffered 65536</code> is the standard production pair.</p>
</div>
<div class="walk-panel">
<svg viewBox="0 0 640 195" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The syslog message on the wire begins with a priority number encoding facility and severity">
  <style>.s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.m{font-family:ui-monospace,Menlo,monospace;font-size:12px;fill:#17171A}.hi{fill:rgba(211,0,45,.14);stroke:#D3002D}</style>
  <rect class="hi" x="14" y="34" width="62" height="26"/>
  <text class="m" x="22" y="52" fill="#B80027">&lt;189&gt;</text>
  <text class="m" x="84" y="52">1047: R1: *Sep 23 10:15:42.318 IST: %LINK-3-UPDOWN…</text>
  <text class="k" x="14" y="88" fill="#B80027">189 = facility × 8 + severity = 23 × 8 + 5</text>
  <text class="s" x="14" y="112">facility <tspan font-family="ui-monospace,Menlo,monospace">23</tspan> = local7, Cisco's default · severity <tspan font-family="ui-monospace,Menlo,monospace">5</tspan> = notification</text>
  <text class="s" x="14" y="136">To get the severity back out: 189 mod 8 = 5. To get the facility: 189 ÷ 8 = 23.</text>
  <text class="s" x="14" y="168">The facility exists so a collector can sort messages by source type — local0 to local7 are yours</text>
  <text class="s" x="14" y="184">to allocate. Set different facilities per device class and your collector can filter on them.</text>
</svg>
<p class="walk-say"><span class="walk-title">One number carries both fields</span>
Everything before the message text is a single integer in angle brackets. <b>Divide by 8 for the facility, take the remainder for the severity.</b> <code>&lt;189&gt;</code> is local7 and notification.
<br><br>Cisco defaults to <b>local7</b> for everything, which means every device lands in the same bucket on your collector. Setting <code>logging facility local4</code> on switches and <code>local5</code> on routers costs nothing and makes filtering trivial later.
<br><br>And note the transport: <b>UDP 514, unauthenticated and unencrypted</b>. Messages can be lost silently and forged trivially. Where it matters, use <code>logging host x.x.x.x transport tcp</code> or a TLS-capable collector.</p>
</div>
<div class="walk-panel">
<svg viewBox="0 0 640 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The default timestamp is uptime not wall clock time which makes correlation impossible">
  <style>.s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.m{font-family:ui-monospace,Menlo,monospace;font-size:11px;fill:#17171A}.bad{fill:#FFF1F3;stroke:#D3002D}.ok{fill:rgba(31,157,107,.12);stroke:#1f9d6b}</style>
  <text class="k" x="14" y="26" fill="#B80027">DEFAULT — uptime since boot</text>
  <rect class="bad" x="14" y="36" width="612" height="30"/>
  <text class="m" x="26" y="56" fill="#B80027">*00:14:22.318: %LINK-3-UPDOWN: Interface Gi0/1, changed state to down</text>
  <text class="s" x="14" y="86">Fourteen minutes after <tspan font-style="italic">this</tspan> router last booted. Correlating it with another device is impossible.</text>
  <text class="k" x="14" y="122" fill="#0f6b47">CONFIGURED — wall clock, milliseconds, timezone</text>
  <rect class="ok" x="14" y="132" width="612" height="30"/>
  <text class="m" x="26" y="152" fill="#0f6b47">*Sep 23 10:15:42.318 IST: %LINK-3-UPDOWN: Interface Gi0/1, changed state to down</text>
  <text class="m" x="14" y="186" fill="#0f6b47">service timestamps log datetime msec localtime show-timezone</text>
</svg>
<p class="walk-say"><span class="walk-title">The default timestamp is useless for correlation</span>
Out of the box IOS stamps messages with <b>uptime</b>, not the time of day. Two devices that rebooted at different moments produce timestamps that cannot be compared, which is fatal the moment you are trying to work out whether the link failure came before or after the routing flap.
<br><br>One line fixes it, and it belongs in every build template:
<br><br><code>service timestamps log datetime msec localtime show-timezone</code>
<br><br><b>And it depends entirely on NTP.</b> A precise, badly-synchronised timestamp is worse than uptime, because it looks authoritative. Check <code>show ntp status</code> before you trust any timeline you build from logs.</p>
</div>
</div>
</div>

### The message on the wire

<div class="cap">
<div class="cap-head">Capture · syslog to the collector <span class="cap-filter">udp.port == 514</span></div>
<div class="cap-hex"><pre>0000  45 00 00 88 12 34 00 00  ff <mark>11</mark> 94 fe 0a 00 00 01   E....4..........
0010  0a 00 00 32 cb 21 <mark>02 02</mark>  00 74 00 00 <mark>3c 31 38 39</mark>   ...2.!...t..&lt;189
0020  <mark>3e</mark> 31 30 34 37 3a 20 52  31 3a 20 2a 53 65 70 20   &gt;1047: R1: *Sep
0030  32 33 20 31 30 3a 31 35  3a 34 32 2e 33 31 38 20   23 10:15:42.318
0040  49 53 54 3a 20 25 4c 49  4e 4b 2d 33 2d 55 50 44   IST: %LINK-3-UPD</pre></div>
<div class="cap-note"><b>Syslog is plain text, and you can read it in the hex.</b> <code>11</code> is protocol 17, UDP. <code>02 02</code> is destination port <b>514</b>. And then the message begins — <code>3c 31 38 39 3e</code> is literally the ASCII characters <b><code>&lt;189&gt;</code></b>, followed by the sequence number, hostname, timestamp and the message itself, all readable.
<br><br>That readability is the point and the problem. Anyone who can see the traffic can read every log message your devices produce — interface names, usernames, configuration changes — and anyone who can send UDP to your collector can <b>forge</b> messages into it, because nothing authenticates the sender. Treat the management network as needing its own protection rather than assuming syslog provides any.</div>
</div>

---

## Configuration, word by word

<div class="cmd">
<div class="cmd-line"><span class="t">service timestamps log datetime msec localtime show-timezone</span>
<span class="t">service timestamps debug datetime msec localtime show-timezone</span>
!
<span class="t">no logging console</span>
<span class="t">logging buffered</span> <span class="opt">65536</span> <span class="opt">informational</span>
<span class="t">logging host</span> <span class="opt">10.0.0.50</span> <span class="t">transport tcp port</span> <span class="opt">1468</span>
<span class="t">logging trap</span> <span class="opt">informational</span>
<span class="t">logging source-interface</span> <span class="opt">Loopback0</span>
<span class="t">logging facility</span> <span class="opt">local5</span>
<span class="t">logging rate-limit</span> <span class="opt">100 except errors</span></div>
<dl class="cmd-parts">
<div class="is-key"><dt>service timestamps<br>log / debug</dt><dd><b>Two separate commands</b> — configuring only <code>log</code> leaves every debug stamped with uptime, which is exactly when you need the real time most. Set both. <code>msec</code> matters more than it sounds: without it, everything inside the same second is unordered, and a second is a very long time during a convergence event.</dd></div>
<div class="is-key"><dt>no logging console</dt><dd>Console output is written <b>synchronously</b> and can consume enough CPU to affect forwarding. This one line prevents a category of self-inflicted outage, and you lose nothing because the buffer and the syslog server both still have the messages.</dd></div>
<div><dt>logging buffered 65536<br>informational</dt><dd>A 64 KB in-memory ring, at level 6. This is your first stop when something happened five minutes ago — <code>show logging</code>. It survives an SSH session ending but <b>not a reload</b>, which is why the syslog server matters.</dd></div>
<div class="is-key"><dt>logging host …<br>transport tcp</dt><dd>Default syslog is UDP 514 — no delivery guarantee and no authentication. TCP at least tells you when the collector is unreachable. If your collector supports TLS, use it: syslog carries usernames, interface names and configuration changes in clear.</dd></div>
<div class="is-key"><dt>logging trap<br>informational</dt><dd>Severity <b>0 to 6</b>. The right production default: everything except debug output. Set it to <code>debugging</code> and the first person to run a <code>debug</code> floods your collector and possibly your WAN link.</dd></div>
<div><dt>logging<br>source-interface Lo0</dt><dd>Sends from a stable address so your collector always sees the same source, whatever path the packet takes. Without it, a device that fails over to a different link appears in your logs as a different host.</dd></div>
<div><dt>logging facility local5</dt><dd>Everything defaults to <b>local7</b>. Allocating a facility per device class — switches local4, routers local5, firewalls local6 — costs nothing and makes collector-side filtering trivial.</dd></div>
<div><dt>logging rate-limit<br>100 except errors</dt><dd>Caps messages per second so a flapping interface cannot generate enough logging to hurt the CPU, while <code>except errors</code> guarantees severity 0–3 always gets through. A quiet safety net worth having.</dd></div>
</dl>
</div>

---

## Debugging without taking the router down

A `debug` is the most informative tool IOS has and the easiest way to make a busy router stop forwarding. The difference is entirely in how narrowly you aim it.

<div class="cmd">
<div class="cmd-line"><span class="opt">! 1 · narrow it BEFORE enabling it</span>
<span class="t">debug condition interface</span> <span class="opt">GigabitEthernet0/1</span>
<span class="t">debug ip ospf adj</span>
!
<span class="opt">! 2 · or filter with an ACL</span>
access-list 150 permit ip host 10.1.1.50 host 192.0.2.10
<span class="t">debug ip packet</span> <span class="opt">150</span> <span class="t">detail</span>
!
<span class="opt">! 3 · always know how to stop</span>
<span class="t">undebug all</span>
<span class="t">show debugging</span></div>
<dl class="cmd-parts">
<div class="is-key"><dt>debug condition<br>interface Gi0/1</dt><dd><b>Set the condition first, then enable the debug.</b> Conditions applied afterwards do not retroactively filter what is already running — and by then you may not be able to type. Conditions can also be <code>ip address</code>, <code>username</code>, <code>vrf</code> or <code>mac-address</code> depending on the feature.</dd></div>
<div class="is-key"><dt>debug ip packet 150</dt><dd><b>Never run <code>debug ip packet</code> unqualified on a production router.</b> It logs every packet the CPU sees and it is the classic way to make a device unreachable. With an ACL it becomes genuinely useful — and note it only shows <b>process-switched</b> packets, so CEF-switched traffic is invisible unless you add <code>no ip route-cache</code>, which is itself a performance decision.</dd></div>
<div><dt>detail</dt><dd>Adds protocol, ports and TTL. Useful with a tight ACL, catastrophic without one.</dd></div>
<div class="is-key"><dt>undebug all</dt><dd><b>Know this before you start.</b> <code>u all</code> is the shortest form and it works even when output is scrolling too fast to see what you are typing. If the console is unusable, an SSH session with <code>terminal no monitor</code> is your way back in.</dd></div>
<div><dt>show debugging</dt><dd>What is currently enabled. Run it before you leave a device — a forgotten debug is a CPU load and a log flood that nobody associates with you, hours later.</dd></div>
<div><dt><span class="opt">the safer alternative</span></dt><dd>Before reaching for a debug, try the counters: <code>show access-lists</code>, <code>show interfaces</code>, <code>show ip traffic</code>, or an <b>EPC</b> (Embedded Packet Capture) which captures to a buffer without per-packet console output. A debug should be the tool you use when you already know roughly what you are looking for.</dd></div>
</dl>
</div>

<div class="real">
<b>In the real world</b>
The incident that catches people is not a debug they meant to run — it is one they forgot to stop. Somebody enables <code>debug ip packet</code> on a quiet evening, the problem does not reproduce, they log off, and the console keeps writing. Hours later the router's CPU is pinned and nobody connects the two because the person who typed it is asleep.
<br><br>Two habits. <b>Always <code>show debugging</code> before disconnecting.</b> And on anything production, set a safety net first:
<br><br><code>reload in 15</code> — then <code>reload cancel</code> once you are done. If the debug makes the router unreachable, it reboots itself into a clean state instead of staying down until somebody drives to site.
</div>

---

## Reading it

<div class="term">
<div class="term-bar"><span class="term-dots"><i></i><i></i><i></i></span>R1 — the buffer is where you look first</div>
<pre><span class="p">R1#</span> <span class="c">show logging</span>
Syslog logging: enabled (0 messages dropped, 3 messages rate-limited)
    <span class="r">Console logging: disabled</span>
    Monitor logging: level debugging, 0 messages logged
    <span class="g">Buffer logging: level informational, 2841 messages logged</span>
    Trap logging: level <span class="y">informational</span>, 2790 message lines logged
        Logging to <span class="y">10.0.0.50</span> (tcp port 1468, audit disabled, link up)

Log Buffer (65536 bytes):
*Sep 23 10:15:42.318 IST: <span class="r">%LINK-3-UPDOWN</span>: Interface Gi0/1, changed state to down
*Sep 23 10:15:43.324 IST: <span class="y">%LINEPROTO-5-UPDOWN</span>: Line protocol on Gi0/1, down
*Sep 23 10:15:58.901 IST: <span class="g">%LINK-3-UPDOWN</span>: Interface Gi0/1, changed state to up
*Sep 23 10:15:59.907 IST: <span class="g">%LINEPROTO-5-UPDOWN</span>: Line protocol on Gi0/1, up

<span class="o">! 16 seconds down. You can only say that because msec timestamps are on.</span>
<span class="o">! Note the pattern: LINK-3 first, LINEPROTO-5 a second later, both directions.</span>
<span class="o">! With "logging trap 3" you would see only the two red ones and conclude</span>
<span class="o">! the interface never came back.</span>

<span class="p">R1#</span> <span class="c">show logging | include %LINK-3</span>
<span class="o">! Filter the buffer rather than scrolling it. "| include", "| exclude",</span>
<span class="o">! "| begin" and "| section" all work here and save enormous amounts of time.</span>

<span class="p">R1#</span> <span class="c">show debugging</span>
Generic IP:
  <span class="r">IP packet debugging is on for access list 150</span>
<span class="o">! Anything listed here is costing CPU right now.</span>

<span class="p">R1#</span> <span class="c">show logging | include Dropped|rate-limited</span>
<span class="o">! "messages dropped" means the buffer or the transport could not keep up —</span>
<span class="o">! so your syslog server has an incomplete picture and does not know it.</span><span class="cur"></span></pre>
</div>
<p class="term-cap"><b>The header block answers "why am I not seeing this message?" in four lines.</b> Each destination prints its own level and its own count. A message missing from your collector but present in the buffer is a <code>logging trap</code> problem, not a network one — and the dropped-message counter tells you whether the gaps are real.</p>

---

## Telemetry — the thing that replaces polling

Syslog tells you about *events*. SNMP lets a manager *ask* for counters, one poll at a time. **Model-driven telemetry** is the third option: the device streams structured data on its own schedule, and nobody has to ask.

<div class="cmd">
<div class="cmd-line"><span class="t">telemetry ietf subscription</span> <span class="opt">101</span>
 <span class="t">encoding</span> <span class="opt">encode-kvgpb</span>
 <span class="t">filter xpath</span> <span class="opt">/interfaces-state/interface/statistics</span>
 <span class="t">stream</span> <span class="opt">yang-push</span>
 <span class="t">update-policy periodic</span> <span class="opt">3000</span>
 <span class="t">receiver ip address</span> <span class="opt">10.0.0.60 57500 protocol grpc-tcp</span></div>
<dl class="cmd-parts">
<div class="is-key"><dt>subscription / stream<br>yang-push</dt><dd>The device pushes data described by a <b>YANG model</b> rather than an OID tree. A <b>dial-out</b> subscription like this one is configured on the device and it connects to the collector; a <b>dial-in</b> subscription is created by the collector over gNMI or NETCONF and lives only as long as that session.</dd></div>
<div class="is-key"><dt>filter xpath</dt><dd>An XPath into the model, which is the direct equivalent of an OID but readable — <code>/interfaces-state/interface/statistics</code> instead of <code>1.3.6.1.2.1.2.2.1.10</code>. If it looks like RESTCONF and NETCONF, that is because it is the same data models underneath.</dd></div>
<div><dt>update-policy periodic 3000</dt><dd>Every 30 seconds, in centiseconds. The alternative is <code><b>on-change</b></code>, which sends only when a value actually changes — that is the real advantage over SNMP, because a state transition reaches the collector in <b>under a second</b> instead of waiting for the next poll cycle.</dd></div>
<div><dt>encoding encode-kvgpb</dt><dd>Google Protocol Buffers — compact and binary. <code>encode-json</code> is readable and much larger. Use GPB in production and JSON while you are proving it works.</dd></div>
<div class="is-key"><dt><span class="opt">why it matters here</span></dt><dd>Polling 48 interfaces every five minutes gives you <b>five-minute resolution</b> and misses anything shorter — including most microbursts and many flaps. Telemetry with <code>on-change</code> catches the transition itself. It does not replace syslog, which carries the human-readable <em>event</em>; it replaces the <b>counter polling</b> that SNMP was doing badly.</dd></div>
</dl>
</div>

<div class="note">
<b>Where each one belongs</b>
<b>Syslog</b> for events that a human will read — a link changed state, somebody logged in, a configuration was saved. <b>SNMP</b> for compatibility, because everything supports it and your existing tooling probably speaks nothing else. <b>Telemetry</b> for counters and state at a resolution that is actually useful, and for on-change notifications that arrive in under a second. Most real networks run all three, and the mistake is expecting any one of them to do all three jobs.
</div>

## What goes wrong

**No output over SSH.** `terminal monitor` is not set. The debug is running fine.

**Messages stop arriving at the collector after a change.** `logging trap` was lowered. Level 3 drops every `%LINEPROTO-5` recovery message.

**Timestamps cannot be correlated between devices.** Default uptime stamps, or NTP is not synchronised. Both need fixing; the second is invisible.

**The router became unreachable during troubleshooting.** `debug ip packet` without an ACL, with console logging on.

**Logs are missing during exactly the event you care about.** Rate limiting, or the buffer wrapped. Check the dropped counter and size the buffer larger.

**Debug output shows nothing though traffic is flowing.** `debug ip packet` only sees process-switched packets. CEF-switched traffic bypasses it.

**A device appears under two names in the collector.** No `logging source-interface`, so the source address changes with the path.

---

<div class="lab">
<div class="lab-head">Lab — make the logs usable, then debug something safely</div>
<div class="lab-body">

<div class="lab-target"><b>Target</b>
Turn default logging into something you could actually use during an incident: real timestamps, a sized buffer, a collector, the right trap level. Prove to yourself that the trap level is a ceiling by losing recovery messages. Then run a debug that would take a router down, and the same debug aimed properly.</div>

**Topology.** Two routers, a Linux host running `rsyslog` or `syslog-ng` on 10.0.0.50, and a link you can flap.

<p class="lab-step"><span class="n">1</span>Look at the default, and be unimpressed</p>

```cisco
R1# show logging
R1(config)# interface Gi0/1
R1(config-if)# shutdown
R1(config-if)# no shutdown
R1# show logging | include UPDOWN
```

<div class="lab-watch"><b>Things to notice</b>
The timestamps are <b>uptime</b>, so you cannot say what time this happened or compare it with R2. Console logging is on at level 7. The buffer may not be enabled at all.
<br><br>Note both messages: <code>%LINK-3-UPDOWN</code> and <code>%LINEPROTO-5-UPDOWN</code>, at two different severities for one event. That pair is about to matter.</div>

<p class="lab-step"><span class="n">2</span>Fix the timestamps and prove NTP matters</p>

```cisco
service timestamps log datetime msec localtime show-timezone
service timestamps debug datetime msec localtime show-timezone
```

Flap the link again, then deliberately set the clock wrong with `clock set` and flap once more.

<div class="lab-watch"><b>Things to notice</b>
The second flap is stamped with a precise, confident, <b>wrong</b> time — and nothing in the output hints at it. That is worse than uptime, because uptime is obviously relative while a wrong wall-clock time looks authoritative and will silently corrupt any incident timeline built from it.
<br><br>Configure NTP, confirm with <code>show ntp status</code>, and make checking that a reflex before trusting log ordering.</div>

<p class="lab-step"><span class="n">3</span>Lose your recovery messages on purpose</p>

```cisco
logging host 10.0.0.50
logging trap 3
```

Flap the link and watch the collector.

<div class="lab-issues"><b>Possible issues</b>
<ul>
<li><b>Nothing arrives at all</b> — check reachability from the source interface, and that the collector is listening on UDP 514 (<code>ss -ulnp | grep 514</code>).</li>
<li><b>Everything arrives</b> — you set the level by name and got it wrong. <code>logging trap 3</code> and <code>logging trap errors</code> are the same thing.</li>
<li><b>Messages arrive but with the wrong hostname</b> — add <code>logging source-interface Loopback0</code>.</li>
</ul>
At level 3 you receive the <b>down</b> message and not the <b>up</b> one, because recovery is severity 5. An operator watching that collector would conclude the interface is still down. Raise it to 6 and both appear.</div>

<p class="lab-step"><span class="n">4</span>Read a PRI off the wire</p>

Capture on the collector with `tcpdump -i any -A port 514` while flapping the link.

<div class="lab-watch"><b>Things to notice</b>
The messages are <b>plain ASCII</b>, starting with <code>&lt;189&gt;</code> or similar. Divide by 8 for the facility and take the remainder for the severity, and confirm it matches the number in the message mnemonic.
<br><br>Then change <code>logging facility local4</code> and watch the PRI change — the severity stays, the facility moves. Now send a forged message to the collector yourself with <code>logger -n 10.0.0.50 -P 514 "&lt;189&gt;fake: something alarming"</code> and watch it appear indistinguishable from the real ones. That is UDP syslog's security model in one command.</div>

<p class="lab-step"><span class="n">5</span>Take the router down with a debug</p>

**Lab only.** With console logging enabled and a traffic generator running:

```cisco
R1# debug ip packet detail
```

<div class="lab-watch"><b>Things to notice</b>
CPU climbs, the console becomes unusable, and on a sufficiently loaded router forwarding suffers. Try to type <code>undebug all</code> while it is scrolling — that experience is the lesson.
<br><br>Recover, then do it properly: <code>no logging console</code>, an ACL matching exactly one flow, and <code>debug ip packet 150</code>. The same command is now precise, quiet and useful. Confirm with <code>show debugging</code> and turn it off.</div>

<p class="lab-step"><span class="n">6</span>Aim a protocol debug at one neighbour</p>

```cisco
R1# debug condition interface GigabitEthernet0/1
R1# debug ip ospf adj
```

<div class="lab-watch"><b>Things to notice</b>
Only that interface's adjacency events appear. Now set the condition <em>after</em> enabling the debug and note that it does not retroactively filter — the order genuinely matters.
<br><br>Finish with <code>show debugging</code> and <code>undebug all</code>, and make that pair the last thing you type on any device you have been debugging on.</div>

<div class="lab-earned"><b>What you earned</b>
Your logs now have timestamps you can correlate across devices, and you know they are only as good as NTP. You know <code>logging trap</code> is a ceiling, because you lost every recovery message at level 3 and watched an interface appear permanently down. You can read a PRI off a capture and you have forged a syslog message yourself, so you will not treat the collector as authoritative without protecting the path to it. And you have taken a router down with a debug and then run the same debug safely, which is the only way that lesson ever sticks.</div>

</div>
</div>

---

## Test yourself

<div class="qz">
<p class="qz-q"><span class="qz-num">Q1</span>What does <code>logging trap 4</code> send to the syslog server?</p>
<label class="qz-opt"><input type="radio" name="slq1"><span>Only severity 4 messages</span><em class="qz-fb qz-bad">The level is a ceiling, not a selection.</em></label>
<label class="qz-opt"><input type="radio" name="slq1"><span>Severities 0 through 4 — warnings and everything worse</span><em class="qz-fb qz-good">Correct, and it is inclusive downward. It also means you stop receiving severity 5 notifications, which include interface recovery.</em></label>
<label class="qz-opt"><input type="radio" name="slq1"><span>Severities 4 through 7</span><em class="qz-fb qz-bad">That would send the least important messages and drop the emergencies.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q2</span>A syslog message begins <code>&lt;189&gt;</code>. What facility and severity is it?</p>
<label class="qz-opt"><input type="radio" name="slq2"><span>Facility 23 (local7), severity 5 (notification)</span><em class="qz-fb qz-good">Correct — 189 ÷ 8 = 23 for the facility, 189 mod 8 = 5 for the severity. local7 is Cisco's default.</em></label>
<label class="qz-opt"><input type="radio" name="slq2"><span>Facility 18, severity 9</span><em class="qz-fb qz-bad">Severity only goes 0–7, so 9 is impossible.</em></label>
<label class="qz-opt"><input type="radio" name="slq2"><span>It is a message ID, not a facility</span><em class="qz-fb qz-bad">The bracketed number is always the PRI: facility × 8 + severity.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q3</span>You run a debug over SSH and see no output. Why?</p>
<label class="qz-opt"><input type="radio" name="slq3"><span><code>terminal monitor</code> is not enabled on that session</span><em class="qz-fb qz-good">Correct. Debug output goes to the console by default; a vty session must ask for it. The debug itself is running normally.</em></label>
<label class="qz-opt"><input type="radio" name="slq3"><span>Debugs cannot be viewed over SSH</span><em class="qz-fb qz-bad">They can, with one command.</em></label>
<label class="qz-opt"><input type="radio" name="slq3"><span><code>logging trap</code> is too low</span><em class="qz-fb qz-bad">That affects the syslog server, not your terminal.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q4</span>Why is the default timestamp a problem?</p>
<label class="qz-opt"><input type="radio" name="slq4"><span>It shows uptime since boot, so timestamps cannot be compared between devices</span><em class="qz-fb qz-good">Right — and the fix is <code>service timestamps log datetime msec localtime show-timezone</code>, plus working NTP, because a precise wrong time is worse than an obviously relative one.</em></label>
<label class="qz-opt"><input type="radio" name="slq4"><span>It is in UTC rather than local time</span><em class="qz-fb qz-bad">It is not a time of day at all by default.</em></label>
<label class="qz-opt"><input type="radio" name="slq4"><span>It lacks milliseconds only</span><em class="qz-fb qz-bad">Milliseconds matter, but the bigger problem is that it is not wall-clock time.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q5</span>Why does <code>debug ip packet</code> sometimes show nothing on a busy router?</p>
<label class="qz-opt"><input type="radio" name="slq5"><span>It only sees process-switched packets — CEF-switched traffic bypasses it</span><em class="qz-fb qz-good">Correct. Most forwarding is done in CEF and never reaches the process path, so the debug is silent while traffic flows perfectly.</em></label>
<label class="qz-opt"><input type="radio" name="slq5"><span>Rate limiting suppressed it</span><em class="qz-fb qz-bad">Possible for logging generally, but the CEF explanation is the usual one here.</em></label>
<label class="qz-opt"><input type="radio" name="slq5"><span>It needs an ACL to work at all</span><em class="qz-fb qz-bad">It works without one — dangerously so.</em></label>
</div>

---

## References

- **RFC 3164** — The BSD Syslog Protocol. The PRI calculation and message format.
- **RFC 5424** — The Syslog Protocol, the structured replacement for 3164.
- Cisco — [System Message Logging configuration guide](https://www.cisco.com/c/en/us/td/docs/switches/lan/catalyst9300/software/release/17-3/configuration_guide/nmgmt/b_173_nmgmt_9300_cg/system_message_logging.html)
- Cisco — [Understand the Debug Commands on Cisco IOS](https://www.cisco.com/c/en/us/support/docs/dial-access/integrated-services-digital-networks-isdn-channel-associated-signaling-cas/10374-debug.html)

---

*Related: [NTP and PTP](/blog/ntp-and-ptp-explained-stratum-offset-and-why-time-matters) · [SNMP v2c and v3](/blog/snmp-v2c-v3-mibs-oids-and-traps).*

*Part of the [CCNA, ENCOR and ENARSI topic-by-topic study guide](/blog/ccna-ccnp-study-guide).*
