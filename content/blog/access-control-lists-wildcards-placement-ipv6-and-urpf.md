---
title: "Access Control Lists: Wildcards, Placement, the Implicit Deny, and the IPv6 Trap"
excerpt: "An ACL is a top-down list where the first match wins and everything unmatched is dropped. That is the whole engine. The difficulty is everywhere else: wildcard masks run backwards, the right place to put a list depends on what kind it is, an ACL on the wrong interface direction does nothing, and an IPv6 ACL can take a segment down in a way an IPv4 one never could."
date: "2026-09-17"
tags: ["ACL", "Security", "Wildcard Mask", "IPv6", "uRPF", "CCNA", "ENARSI"]
draft: false
---

> **Blueprint:** CCNA 200-301 — 5.6 *Configure and verify access control lists*. ENARSI 300-410 — 3.2 *Troubleshoot router security features: IPv4 access control lists (standard, extended, time-based), IPv6 traffic filter, unicast reverse path forwarding (uRPF)*.

## Cheat sheet

| | Standard | Extended |
|---|---|---|
| **Matches** | **Source only** | Source, destination, protocol, ports, more |
| **Numbers** | 1–99, 1300–1999 | 100–199, 2000–2699 |
| **Place it** | **Close to the destination** | **Close to the source** |
| **Why** | It cannot tell where traffic is going, so filtering early blocks too much | It is precise, so drop unwanted traffic before it crosses the network |

| | |
|---|---|
| **Order** | **Top down, first match wins.** Nothing below a match is evaluated |
| **The end** | An invisible **`deny any`**. An ACL with only deny statements blocks everything |
| **Wildcard** | The **inverse** of a subnet mask. `0` = must match, `1` = ignore |
| **Direction** | `in` = as it arrives · `out` = as it leaves. Applied per interface, per direction |
| **Editing** | Named ACLs and sequence numbers. Resequence with `ip access-list resequence` |
| **IPv6** | `ipv6 access-list` + **`ipv6 traffic-filter`**, not `ip access-group` |
| **uRPF** | Strict — the source must be reachable **via the interface it arrived on** |

**The one that costs people hours.** A standard ACL placed near the source blocks traffic to destinations you never intended, because it cannot see destinations at all. An extended ACL placed near the destination wastes bandwidth carrying traffic across the network to throw it away. The placement rule is not arbitrary — it falls straight out of what each type can match.

---

## The engine, and it is simple

<figure class="fig">
<svg class="sv1" viewBox="0 0 640 245" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A packet is tested against each ACL line in order and the first match decides, with an implicit deny at the end">
  <style>.sv1 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv1 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv1 .m{font-family:ui-monospace,Menlo,monospace;font-size:11px;fill:#17171A}.sv1 .no{fill:#F1EEE9;stroke:#B5B5BC}.sv1 .hit{fill:rgba(31,157,107,.16);stroke:#1f9d6b}.sv1 .imp{fill:#FFF1F3;stroke:#D3002D}.sv1 .hdr{font-family:ui-sans-serif,system-ui;font-size:10px;font-weight:700;letter-spacing:.06em;fill:#8A8A93}
  </style>
  <text class="hdr" x="14" y="20">PACKET: 10.1.1.50 → 192.0.2.10 TCP 443</text>
  <rect class="no" x="14" y="30" width="612" height="28"/>
  <text class="m" x="26" y="49">10  deny   tcp host 10.1.1.99 any eq 443        source does not match → next line</text>
  <rect class="no" x="14" y="62" width="612" height="28"/>
  <text class="m" x="26" y="81">20  permit udp 10.1.1.0 0.0.0.255 any           protocol does not match → next line</text>
  <rect class="hit" x="14" y="94" width="612" height="28"/>
  <text class="m" x="26" y="113" fill="#0f6b47">30  permit tcp 10.1.1.0 0.0.0.255 any eq 443    MATCH — permit, and stop</text>
  <rect class="no" x="14" y="126" width="612" height="28" opacity=".4"/>
  <text class="m" x="26" y="145" opacity=".5">40  deny   ip any any log                          never evaluated</text>
  <rect class="imp" x="14" y="158" width="612" height="28"/>
  <text class="m" x="26" y="177" fill="#B80027">     (implicit) deny ip any any                    never evaluated — this time</text>
  <circle r="5" fill="#1f9d6b"><animateMotion dur="2.6s" repeatCount="indefinite" path="M 600 20 L 600 44 L 30 44 L 600 44 L 600 76 L 30 76 L 600 76 L 600 108 L 30 108"/></circle>
  <text class="k" x="14" y="212">First match wins. The list stops. Order is the whole design.</text>
  <text class="s" x="14" y="236">Put a broad <tspan font-family="ui-monospace,Menlo,monospace">permit</tspan> above a specific <tspan font-family="ui-monospace,Menlo,monospace">deny</tspan> and the deny is dead code that will never fire.</text>
</svg>
<figcaption><b>Figure 1.</b> Four lines, and only the first three were read. An ACL is not a set of rules that are all considered — it is a sequence that stops at the first one that applies.</figcaption>
</figure>

<div class="warn">
<b>The implicit deny, and the ACL that blocks everything</b>
Every ACL ends with an invisible <code>deny ip any any</code>. It does not appear in <code>show run</code> and it has no hit counter. Two consequences people meet the hard way:
<br><br><b>An ACL containing only <code>deny</code> statements denies everything.</b> You wrote "block this one host" and you blocked the internet, because nothing below it permits anything.
<br><br><b>An ACL with nothing in it at all</b> behaves the same way once applied. Creating the list and applying it before adding rules — a natural order to type in — takes the interface down.
</div>

---

## Wildcard masks run backwards

A subnet mask says which bits are the network. A wildcard mask says which bits the router must **ignore**.

```text
subnet mask     255.255.255.0     11111111.11111111.11111111.00000000
wildcard mask     0.  0.  0.255   00000000.00000000.00000000.11111111
                                  └──── must match ────┘  └─ ignore ─┘

0 = the bit must match          255.255.255.0  → 0.0.0.255
1 = the bit is ignored          255.255.255.240 → 0.0.0.15
                                255.255.0.0     → 0.0.255.255
```

The shortcut: **subtract each octet from 255**. And two keywords save you from it entirely — `host 10.1.1.1` means `10.1.1.1 0.0.0.0`, and `any` means `0.0.0.0 255.255.255.255`.

<div class="note">
<b>The trick wildcards can do that subnet masks cannot</b>
A wildcard's ignored bits do not have to be contiguous. <code>10.1.0.0 0.0.254.255</code> matches only the <b>even</b> third octets — 10.1.0.x, 10.1.2.x, 10.1.4.x — because the bottom bit of that octet is the one bit it insists on matching. It is occasionally elegant for odd/even VLAN schemes and it is unreadable to the next person, so comment it or avoid it.
</div>

---

## Where to put it, and which way round

<div class="walk">
<div class="walk-head">Same intent, four placements, three of them wrong <span class="walk-hint">click a step</span></div>
<div class="walk-tabs">
  <input type="radio" name="aclw" id="ac1" checked><label for="ac1"><span class="step-n">1</span>The goal</label>
  <input type="radio" name="aclw" id="ac2"><label for="ac2"><span class="step-n">2</span>Standard, too early</label>
  <input type="radio" name="aclw" id="ac3"><label for="ac3"><span class="step-n">3</span>Standard, correct</label>
  <input type="radio" name="aclw" id="ac4"><label for="ac4"><span class="step-n">4</span>Extended, correct</label>
  <input type="radio" name="aclw" id="ac5"><label for="ac5"><span class="step-n">5</span>Wrong direction</label>
</div>
<div class="walk-panels">
<div class="walk-panel">
<svg class="sv2" viewBox="0 0 640 190" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The goal is to stop one subnet reaching one server while leaving its other traffic alone">
  <style>.sv2 .n{fill:#17171A}.sv2 .nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.sv2 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv2 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv2 .l{stroke:#8A8A93;stroke-width:1.5}</style>
  <rect class="n" x="14" y="70" width="90" height="32" rx="3"/><text class="nt" x="59" y="91" text-anchor="middle">10.1.1.0/24</text>
  <rect class="n" x="180" y="70" width="56" height="32" rx="3"/><text class="nt" x="208" y="91" text-anchor="middle">R1</text>
  <rect class="n" x="330" y="70" width="56" height="32" rx="3"/><text class="nt" x="358" y="91" text-anchor="middle">R2</text>
  <rect class="n" x="470" y="34" width="110" height="30" rx="3"/><text class="nt" x="525" y="53" text-anchor="middle">SERVER A</text>
  <rect class="n" x="470" y="108" width="110" height="30" rx="3"/><text class="nt" x="525" y="127" text-anchor="middle">SERVER B</text>
  <line class="l" x1="104" y1="86" x2="180" y2="86"/>
  <line class="l" x1="236" y1="86" x2="330" y2="86"/>
  <line class="l" x1="386" y1="80" x2="470" y2="52"/>
  <line class="l" x1="386" y1="92" x2="470" y2="120"/>
  <text class="k" x="320" y="164" text-anchor="middle">Goal: 10.1.1.0/24 must not reach <tspan fill="#B80027">SERVER A</tspan>. Everything else stays working.</text>
  <text class="s" x="320" y="182" text-anchor="middle">Including that subnet's access to SERVER B, and everybody else's access to both.</text>
</svg>
<p class="walk-say"><span class="walk-title">A very ordinary requirement</span>
One source subnet, one destination server, block that combination and nothing else. Every placement decision below follows from a single question: <b>can the ACL type you chose actually see the destination?</b></p>
</div>
<div class="walk-panel">
<svg class="sv3" viewBox="0 0 640 195" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A standard ACL placed near the source blocks the subnet from reaching everything">
  <style>.sv3 .n{fill:#17171A}.sv3 .nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.sv3 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv3 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv3 .l{stroke:#8A8A93;stroke-width:1.5}.sv3 .x{stroke:#D3002D;stroke-width:2.5}</style>
  <rect class="n" x="14" y="70" width="90" height="32" rx="3"/><text class="nt" x="59" y="91" text-anchor="middle">10.1.1.0/24</text>
  <rect class="n" x="180" y="70" width="56" height="32" rx="3" fill="#D3002D"/><text class="nt" x="208" y="91" text-anchor="middle">R1</text>
  <rect class="n" x="330" y="70" width="56" height="32" rx="3"/><text class="nt" x="358" y="91" text-anchor="middle">R2</text>
  <rect class="n" x="470" y="34" width="110" height="30" rx="3"/><text class="nt" x="525" y="53" text-anchor="middle">SERVER A</text>
  <rect class="n" x="470" y="108" width="110" height="30" rx="3"/><text class="nt" x="525" y="127" text-anchor="middle">SERVER B</text>
  <line class="l" x1="104" y1="86" x2="180" y2="86"/>
  <line x1="150" y1="76" x2="168" y2="96" stroke="#D3002D" stroke-width="2.5"/>
  <line x1="168" y1="76" x2="150" y2="96" stroke="#D3002D" stroke-width="2.5"/>
  <text class="k" x="320" y="150" text-anchor="middle" fill="#B80027">A standard ACL matches the SOURCE only. It has no idea where the packet is going.</text>
  <text class="s" x="320" y="172" text-anchor="middle">So it drops everything from that subnet — Server A, Server B, the internet, DNS, everything.</text>
  <text class="s" x="320" y="190" text-anchor="middle">You asked for one door to be locked and the building was demolished.</text>
</svg>
<p class="walk-say"><span class="walk-title">Standard, placed near the source — the classic mistake</span>
This is why the placement rule exists. A standard ACL can only test the source address, so applying it early means every packet from that subnet is dropped regardless of destination.
<br><br>It looks correct in <code>show run</code>, the syntax is fine, and the helpdesk call is "the whole floor lost the network".</p>
</div>
<div class="walk-panel">
<svg class="sv4" viewBox="0 0 640 190" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A standard ACL placed near the destination blocks only the path to that server">
  <style>.sv4 .n{fill:#17171A}.sv4 .nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.sv4 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv4 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv4 .l{stroke:#8A8A93;stroke-width:1.5}.sv4 .ok{stroke:#1f9d6b;stroke-width:2.5}</style>
  <rect class="n" x="14" y="70" width="90" height="32" rx="3"/><text class="nt" x="59" y="91" text-anchor="middle">10.1.1.0/24</text>
  <rect class="n" x="180" y="70" width="56" height="32" rx="3"/><text class="nt" x="208" y="91" text-anchor="middle">R1</text>
  <rect class="n" x="330" y="70" width="56" height="32" rx="3" fill="#D3002D"/><text class="nt" x="358" y="91" text-anchor="middle">R2</text>
  <rect class="n" x="470" y="34" width="110" height="30" rx="3"/><text class="nt" x="525" y="53" text-anchor="middle">SERVER A</text>
  <rect class="n" x="470" y="108" width="110" height="30" rx="3"/><text class="nt" x="525" y="127" text-anchor="middle">SERVER B</text>
  <line class="ok" x1="104" y1="86" x2="180" y2="86"/>
  <line class="ok" x1="236" y1="86" x2="330" y2="86"/>
  <line class="l" x1="386" y1="80" x2="470" y2="52"/>
  <line x1="412" y1="58" x2="430" y2="74" stroke="#D3002D" stroke-width="2.5"/>
  <line x1="430" y1="58" x2="412" y2="74" stroke="#D3002D" stroke-width="2.5"/>
  <line class="ok" x1="386" y1="92" x2="470" y2="120"/>
  <circle r="4.5" fill="#1f9d6b"><animateMotion dur="2s" repeatCount="indefinite" path="M 104 86 L 330 86 L 470 120"/></circle>
  <text class="k" x="320" y="164" text-anchor="middle" fill="#0f6b47">Applied <tspan font-family="ui-monospace,Menlo,monospace">out</tspan> on R2's interface toward Server A — the only path to that server.</text>
  <text class="s" x="320" y="184" text-anchor="middle">Server B is still reachable, because that traffic never crosses the filtered interface.</text>
</svg>
<p class="walk-say"><span class="walk-title">Standard, placed near the destination — correct</span>
By putting the list on the last interface before Server A, the only traffic it can possibly affect is traffic heading there. The destination is implied by <b>where the ACL is</b> rather than by anything in the ACL itself.
<br><br>That is the whole logic of "standard goes near the destination": you are using topology to supply the information the ACL cannot express.</p>
</div>
<div class="walk-panel">
<svg class="sv5" viewBox="0 0 640 195" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="An extended ACL near the source blocks precisely the one flow and saves carrying it across the network">
  <style>.sv5 .n{fill:#17171A}.sv5 .nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.sv5 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv5 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv5 .l{stroke:#8A8A93;stroke-width:1.5}.sv5 .ok{stroke:#1f9d6b;stroke-width:2.5}.sv5 .m{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;fill:#17171A}</style>
  <rect class="n" x="14" y="70" width="90" height="32" rx="3"/><text class="nt" x="59" y="91" text-anchor="middle">10.1.1.0/24</text>
  <rect class="n" x="180" y="70" width="56" height="32" rx="3" fill="#1f9d6b"/><text class="nt" x="208" y="91" text-anchor="middle">R1</text>
  <rect class="n" x="330" y="70" width="56" height="32" rx="3"/><text class="nt" x="358" y="91" text-anchor="middle">R2</text>
  <rect class="n" x="470" y="34" width="110" height="30" rx="3"/><text class="nt" x="525" y="53" text-anchor="middle">SERVER A</text>
  <rect class="n" x="470" y="108" width="110" height="30" rx="3"/><text class="nt" x="525" y="127" text-anchor="middle">SERVER B</text>
  <line class="ok" x1="104" y1="86" x2="180" y2="86"/>
  <line class="ok" x1="236" y1="86" x2="330" y2="86"/>
  <line class="l" x1="386" y1="80" x2="470" y2="52" stroke-dasharray="4 4" stroke="#D3002D"/>
  <line class="ok" x1="386" y1="92" x2="470" y2="120"/>
  <circle r="4.5" fill="#1f9d6b"><animateMotion dur="2s" repeatCount="indefinite" path="M 104 86 L 330 86 L 470 120"/></circle>
  <text class="m" x="320" y="140" text-anchor="middle">deny ip 10.1.1.0 0.0.0.255 host 192.0.2.10</text>
  <text class="k" x="320" y="166" text-anchor="middle" fill="#0f6b47">Applied <tspan font-family="ui-monospace,Menlo,monospace">in</tspan> on R1's interface facing the users.</text>
  <text class="s" x="320" y="188" text-anchor="middle">Dropped at the first hop, so the unwanted traffic never consumes a single link between R1 and R2.</text>
</svg>
<p class="walk-say"><span class="walk-title">Extended, placed near the source — correct, and better</span>
An extended ACL can name both ends of the conversation, so there is no reason to carry the traffic across the network before discarding it. Drop it as it enters the router closest to the user.
<br><br>Applied <b><code>in</code></b> on the user-facing interface it is also <b>cheaper</b>: the router filters before doing a routing lookup at all.</p>
</div>
<div class="walk-panel">
<svg class="sv6" viewBox="0 0 640 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="An ACL applied in the wrong direction never sees the traffic it was written for">
  <style>.sv6 .n{fill:#17171A}.sv6 .nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.sv6 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv6 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv6 .m{font-family:ui-monospace,Menlo,monospace;font-size:11px;fill:#17171A}</style>
  <rect class="n" x="60" y="70" width="90" height="32" rx="3"/><text class="nt" x="105" y="91" text-anchor="middle">USERS</text>
  <rect class="n" x="280" y="62" width="80" height="48" rx="3"/><text class="nt" x="320" y="91" text-anchor="middle">R1</text>
  <rect class="n" x="490" y="70" width="90" height="32" rx="3"/><text class="nt" x="535" y="91" text-anchor="middle">SERVERS</text>
  <path d="M 150 80 L 280 80" stroke="#1f9d6b" stroke-width="2.5" fill="none"/>
  <path d="M 360 92 L 490 92" stroke="#1f9d6b" stroke-width="2.5" fill="none"/>
  <circle r="4.5" fill="#1f9d6b"><animateMotion dur="2s" repeatCount="indefinite" path="M 150 80 L 280 80"/></circle>
  <text class="m" x="215" y="66" text-anchor="middle" fill="#0f6b47">in</text>
  <text class="m" x="425" y="118" text-anchor="middle" fill="#0f6b47">out</text>
  <text class="k" x="320" y="152" text-anchor="middle" fill="#B80027">Apply the list <tspan font-family="ui-monospace,Menlo,monospace">out</tspan> on the user interface and it never sees user traffic at all.</text>
  <text class="s" x="320" y="174" text-anchor="middle"><tspan font-weight="700">in</tspan> and <tspan font-weight="700">out</tspan> are from the <tspan font-style="italic">router's</tspan> point of view, not the user's. Traffic <tspan font-style="italic">from</tspan> users arrives <tspan font-weight="700">in</tspan>.</text>
  <text class="s" x="320" y="194" text-anchor="middle">The hit counter stays at zero — which is the fastest way to spot it.</text>
</svg>
<p class="walk-say"><span class="walk-title">Direction — and the counter that tells you</span>
<code>in</code> and <code>out</code> are relative to the <b>router</b>. Traffic from the users <em>enters</em> the user-facing interface, so a list filtering it must be applied <code>in</code> there — or <code>out</code> on the interface toward the servers.
<br><br>A list applied the wrong way round is not an error and produces no log. The symptom is that nothing is filtered, and the diagnosis is <code>show access-lists</code>: <b>a rule with zero matches on traffic you know is flowing is on the wrong interface or the wrong direction.</b></p>
</div>
</div>
</div>

---

## Configuration, word by word

<div class="cmd">
<div class="cmd-line"><span class="t">ip access-list extended</span> <span class="opt">USERS-IN</span>
 <span class="t">10 remark</span> <span class="opt">block the finance app for the guest VLAN</span>
 <span class="t">20 deny tcp</span> <span class="opt">10.1.1.0 0.0.0.255 host 192.0.2.10 eq 443</span> <span class="t">log</span>
 <span class="t">30 permit tcp</span> <span class="opt">any any established</span>
 <span class="t">40 permit ip</span> <span class="opt">any any</span>
!
interface GigabitEthernet0/0
 <span class="t">ip access-group</span> <span class="opt">USERS-IN</span> <span class="t">in</span></div>
<dl class="cmd-parts">
<div class="is-key"><dt>ip access-list<br>extended NAME</dt><dd><b>Always use named lists.</b> Numbered ACLs cannot be edited — adding a line appends it to the end, and removing one deletes the entire list. Named lists give you sequence numbers, so you can insert at 25 and delete line 20 individually.</dd></div>
<div><dt>10 remark</dt><dd>A comment that survives in the configuration. The next person to read this list will not know why it exists unless you say so, and ACLs outlive the people who write them.</dd></div>
<div class="is-key"><dt>deny tcp … eq 443 log</dt><dd><code>log</code> generates a syslog message per flow and <b>can punt packets to the CPU</b>. Superb while you are testing, dangerous left on a busy interface in production. Use <code>log</code> to prove a rule fires, then remove it — or use <code>log-input</code>, which adds the input interface and source MAC, when you need to find where spoofed traffic entered.</dd></div>
<div class="is-key"><dt>permit tcp any any<br>established</dt><dd>Matches TCP segments with <b>ACK or RST set</b> — that is, packets belonging to a session somebody else started. It lets return traffic back in without permitting new inbound sessions. It is <b>not</b> stateful: it checks a flag, and a crafted packet with ACK set walks straight through. For real statefulness use a zone-based firewall or CBAC; <code>established</code> is a cheap approximation that is still worth knowing.</dd></div>
<div><dt>permit ip any any</dt><dd>The explicit catch-all. Without it the implicit deny at the end drops everything that did not match line 20 or 30 — which is almost certainly not what you meant.</dd></div>
<div class="is-key"><dt>ip access-group … in</dt><dd>Applies it. One ACL per interface, per direction, per protocol. Applying a second replaces the first silently. And <b>the direction is from the router's perspective</b> — see step 5 above.</dd></div>
</dl>
</div>

<div class="cmd">
<div class="cmd-line"><span class="t">time-range</span> <span class="opt">WORK-HOURS</span>
 <span class="t">periodic weekdays</span> <span class="opt">08:00 to 18:00</span>
!
 <span class="t">permit tcp</span> <span class="opt">any any eq 80</span> <span class="t">time-range</span> <span class="opt">WORK-HOURS</span>
!
<span class="t">ip access-list resequence</span> <span class="opt">USERS-IN 10 10</span></div>
<dl class="cmd-parts">
<div><dt>time-range / periodic</dt><dd>Makes a rule apply only in a window. <code>periodic</code> repeats weekly; <code>absolute</code> is a one-off with a start and end. <b>The router's clock must be right</b>, which in practice means NTP must be working — a time-based ACL on a router with a drifted clock enforces a policy nobody chose.</dd></div>
<div><dt>ip access-list<br>resequence</dt><dd>Renumbers the list — here starting at 10, stepping by 10 — so there is room to insert lines later. Do this when a list has grown organically and you can no longer fit a rule between 21 and 22.</dd></div>
</dl>
</div>

---

## IPv6 is not the same, and this one takes segments down

<div class="cmd">
<div class="cmd-line"><span class="t">ipv6 access-list</span> <span class="opt">V6-IN</span>
 <span class="t">permit icmp any any nd-ns</span>
 <span class="t">permit icmp any any nd-na</span>
 <span class="t">deny tcp</span> <span class="opt">2001:db8:1::/64 host 2001:db8:9::10 eq 443</span>
 <span class="t">permit ipv6 any any</span>
!
interface GigabitEthernet0/0
 <span class="t">ipv6 traffic-filter</span> <span class="opt">V6-IN</span> <span class="t">in</span></div>
<dl class="cmd-parts">
<div class="is-key"><dt>ipv6 traffic-filter</dt><dd>Not <code>ip access-group</code>. Different keyword, and the IPv4 one will simply not accept an IPv6 list — which is at least a clear error, unlike most of this topic.</dd></div>
<div class="is-key"><dt>permit icmp any any<br>nd-ns / nd-na</dt><dd><b>This is the one that breaks networks.</b> IPv6 has no ARP — address resolution is ICMPv6 Neighbour Solicitation and Advertisement, and they are ordinary IPv6 packets that your ACL will filter. Block them and hosts cannot resolve their gateway, so <b>the segment stops working entirely</b> while the ACL looks like it only blocked one TCP port.
<br><br><b>Platform behaviour differs and you must check yours.</b> Classic IOS routers add implicit <code>permit icmp any any nd-na</code> and <code>nd-ns</code> before the implicit deny. Cisco documents that <b>ASR 1000 and several Catalyst platforms do not</b> — there, you must add them explicitly. Writing them out by hand is correct everywhere and costs two lines, so write them.</dd></div>
<div><dt><span class="opt">the trap within the trap</span></dt><dd>Adding an explicit <code>deny ipv6 any any</code> at the end — to get hit counts on dropped traffic, a perfectly reasonable thing to want — places a deny <b>above</b> the implicit NDP permits on the platforms that have them. The segment dies, and the line you added looks completely innocuous. If you want the counter, put the NDP permits above it yourself.</dd></div>
<div><dt>no standard/extended</dt><dd>IPv6 has one kind of ACL. Every list can match source, destination, protocol and ports, so the standard-versus-extended placement question does not arise — put it where it is cheapest, which is near the source.</dd></div>
</dl>
</div>

---

## uRPF — filtering by where it came from

An ACL asks "is this address allowed?". **Unicast Reverse Path Forwarding** asks a different question: "would I route *back* to this source through the interface it just arrived on?" If not, the source is almost certainly spoofed.

<div class="cmd">
<div class="cmd-line">interface GigabitEthernet0/0
 <span class="t">ip verify unicast source reachable-via rx</span>
!
interface GigabitEthernet0/1
 <span class="t">ip verify unicast source reachable-via any</span></div>
<dl class="cmd-parts">
<div class="is-key"><dt>reachable-via <b>rx</b><br><span class="opt">(strict)</span></dt><dd>The source must be reachable <b>via the interface the packet arrived on</b>. The correct setting on a single-homed customer or user edge, where traffic from a given subnet has exactly one legitimate way in. <b>Do not use it where routing is asymmetric</b> — it will drop entirely legitimate traffic, and the drops are silent.</dd></div>
<div><dt>reachable-via <b>any</b><br><span class="opt">(loose)</span></dt><dd>The source must be reachable via <em>some</em> interface. Much weaker — it only catches sources with no route at all, such as unallocated or bogon space — but it is safe on a multi-homed edge where strict mode would cause outages.</dd></div>
<div><dt><span class="opt">allow-default</span></dt><dd>Lets a default route satisfy the check. On a router with <code>0.0.0.0/0</code> that makes loose mode useless, because everything is reachable via the default. Leave it off unless you know why you need it.</dd></div>
<div class="is-key"><dt><span class="opt">why bother</span></dt><dd>It is one line per interface and it eliminates an entire class of attack: reflection and amplification depend on spoofing the victim's address as the source. uRPF at every edge is BCP 38, and it is the reason your network does not end up in somebody else's incident report. Check drops with <code>show ip interface | include verify|drops</code>.</dd></div>
</dl>
</div>

---

## Verifying it

<div class="term">
<div class="term-bar"><span class="term-dots"><i></i><i></i><i></i></span>R1 — the counters answer almost every ACL question</div>
<pre><span class="p">R1#</span> <span class="c">show access-lists USERS-IN</span>
Extended IP access list USERS-IN
    10 remark block the finance app for the guest VLAN
    20 deny tcp 10.1.1.0 0.0.0.255 host 192.0.2.10 eq 443 <span class="g">(1422 matches)</span>
    30 permit tcp any any established <span class="g">(88104 matches)</span>
    40 permit ip any any <span class="g">(2291043 matches)</span>

<span class="o">! A rule with matches is firing. A rule with ZERO matches on traffic you know</span>
<span class="o">! is flowing is either unreachable (something above it matched first) or the</span>
<span class="o">! ACL is on the wrong interface or the wrong direction.</span>

<span class="p">R1#</span> <span class="c">show ip interface GigabitEthernet0/0 | include access list</span>
  Outgoing access list is not set
  <span class="y">Inbound  access list is USERS-IN</span>

<span class="p">R1#</span> <span class="c">clear access-list counters USERS-IN</span>
<span class="o">! Zero them, generate the traffic you are testing, look again. This turns</span>
<span class="o">! "I think it is being blocked" into a number.</span>

<span class="p">R1#</span> <span class="c">show ip interface GigabitEthernet0/0 | include verify|drop</span>
  IP verify source reachable-via RX, allow default
   <span class="r">12 verification drops</span>
   0 suppressed verification drops
<span class="o">! uRPF drops are counted here and NOWHERE else. No log, no ACL counter.</span><span class="cur"></span></pre>
</div>
<p class="term-cap"><b>Counters turn opinion into evidence.</b> <code>clear access-list counters</code>, generate exactly the traffic in question, then look — it takes fifteen seconds and settles arguments that otherwise run for an hour. The same discipline applies to uRPF, whose drops appear only in the interface's verification counter and will never show up anywhere you are likely to be looking.</p>

<div class="real">
<b>In the real world</b>
The ACL change that takes a network down is almost never the rule anybody reviewed. It is the <b>order</b>. Somebody appends a rule to a numbered list — which can only be appended to — and it lands <em>below</em> a <code>permit ip any any</code> that was already there, so it never fires; or they rebuild the list and the new ordering puts a broad permit above a specific deny.
<br><br>Two habits. <b>Named lists with sequence numbers</b>, always, so a rule can be inserted where it belongs. And before any ACL change on a device you reach over the network, <code>reload in 10</code> — then <code>reload cancel</code> once you have confirmed you still have access. An ACL is the single easiest way to lock yourself out of a router, and it is the one change where the failure removes your ability to undo it.
</div>

---

## What goes wrong

**The ACL blocks everything.** The implicit deny, with no permit below your denies. Add `permit ip any any`.

**The ACL blocks nothing.** Wrong interface, wrong direction, or a broad permit above your deny. `show access-lists` — zero matches tells you which.

**A standard ACL broke far more than intended.** It was placed near the source. It cannot see destinations.

**Return traffic is blocked.** An inbound list with no `established` or no permit for the reply direction. ACLs are not stateful.

**An IPv6 ACL killed the segment.** NDP was filtered. Add explicit `permit icmp any any nd-ns` and `nd-na` above everything else.

**Legitimate traffic is dropped and nothing logs it.** uRPF strict mode with asymmetric routing. Check the verification-drops counter and switch to loose mode.

**A time-based rule fires at the wrong time.** The clock. `show clock` and check NTP.

**You cannot insert a rule where you need it.** A numbered ACL. Convert to named, or `ip access-list resequence` to open up gaps.

---

<div class="lab">
<div class="lab-head">Lab — every classic ACL mistake, made on purpose</div>
<div class="lab-body">

<div class="lab-target"><b>Target</b>
Build the same policy four ways and watch three of them fail differently; prove that a rule with zero hits is the fastest diagnosis you have; block a segment with an IPv6 ACL by filtering NDP and then fix it; and turn on strict uRPF, watch it drop a spoofed packet, then watch it drop a legitimate one when routing is asymmetric.</div>

**Topology.** Users on `10.1.1.0/24` behind R1, two servers behind R2, and a second path between R1 and R2 for the asymmetric-routing test. A host capable of sending spoofed packets (`hping3`, `scapy`) on the user VLAN.

<p class="lab-step"><span class="n">1</span>Break the network with a standard ACL</p>

```cisco
access-list 10 deny 10.1.1.0 0.0.0.255
access-list 10 permit any
!
interface GigabitEthernet0/0
 ip access-group 10 in
```

<div class="lab-watch"><b>Things to notice</b>
Every destination is now unreachable from that subnet, not just the one you meant. Confirm with pings to both servers and to an internet address. Then move the same list to R2's outbound interface facing Server A and watch Server B become reachable again.
<br><br>That is the placement rule demonstrated rather than memorised — and note that <b>you changed nothing about the ACL</b>, only where it lives.</div>

<p class="lab-step"><span class="n">2</span>Apply one the wrong way round</p>

Write the extended version, then apply it `out` on the user-facing interface instead of `in`.

```cisco
R1# show access-lists
```

<div class="lab-watch"><b>Things to notice</b>
Nothing is blocked, and <b>every counter is zero</b>. There is no error, no log and no warning. Learn to read that zero: on traffic you know is flowing, it means the list is not in the path — wrong interface or wrong direction — rather than that your match criteria are wrong.
<br><br>Flip it to <code>in</code> and watch the counter start moving immediately.</div>

<p class="lab-step"><span class="n">3</span>Write a rule that can never fire</p>

```cisco
ip access-list extended TEST
 10 permit ip any any
 20 deny tcp 10.1.1.0 0.0.0.255 host 192.0.2.10 eq 443
```

<div class="lab-issues"><b>Possible issues</b>
<ul>
<li><b>It appears to work</b> — check you applied the list. Line 20 will show zero matches regardless.</li>
<li><b>You cannot reorder it</b> — if you used a numbered list you cannot. That is the step's second lesson. Convert to named and try again.</li>
<li><b>Deleting line 10 deletes everything</b> — again, numbered lists. <code>no access-list 100</code> removes the whole thing.</li>
</ul>
Then fix the order with <code>no 10</code> and re-adding it at the end, and confirm line 20 starts counting. <b>Dead rules below a catch-all permit are the most common ACL defect in production</b> and they are completely invisible except through the counters.</div>

<p class="lab-step"><span class="n">4</span>Kill a segment with an IPv6 ACL</p>

```cisco
ipv6 access-list V6-TEST
 deny tcp any host 2001:db8:9::10 eq 443
 permit ipv6 any any
 deny ipv6 any any
!
interface GigabitEthernet0/0
 ipv6 traffic-filter V6-TEST in
```

<div class="lab-watch"><b>Things to notice</b>
Depending on platform this either works fine or takes the segment down — and <b>finding out which your platform does is the point of the step</b>. On a router where the implicit NDP permits exist, the explicit <code>deny ipv6 any any</code> you added sits above them and removes them.
<br><br>Watch the neighbour cache empty: <code>show ipv6 neighbors</code>. Hosts cannot resolve the gateway, so nothing works — while the only rule you consciously wrote blocked one TCP port. Fix it by putting <code>permit icmp any any nd-ns</code> and <code>nd-na</code> at the top, and note that this is the right thing to write on <em>every</em> platform whether it is required or not.</div>

<p class="lab-step"><span class="n">5</span>Spoof a source, then drop it</p>

From the user VLAN, send a packet with a source address from a completely different subnet — `hping3 -a 203.0.113.99 <server>`.

```cisco
R1(config-if)# ip verify unicast source reachable-via rx
R1# show ip interface Gi0/0 | include verify|drop
```

<div class="lab-watch"><b>Things to notice</b>
Before uRPF, R1 forwards the spoofed packet without comment — and the reply goes to the real owner of that address, which is exactly how reflection attacks work. After uRPF, the verification-drops counter increments and the packet is gone.
<br><br>Note where the evidence appears: <b>only</b> in that interface counter. No syslog, no ACL hit, nothing in any log you would normally check.</div>

<p class="lab-step"><span class="n">6</span>Now let uRPF drop something legitimate</p>

Make routing asymmetric: force traffic *to* the user subnet over the second R1–R2 link while traffic *from* it still arrives on the first.

<div class="lab-watch"><b>Things to notice</b>
Strict uRPF now drops genuine user traffic, because the route back to the source does not point at the interface it arrived on. The verification-drops counter climbs and users report an outage with no other symptom anywhere.
<br><br>Switch to <code>reachable-via any</code> and it stops. <b>That is the whole strict-versus-loose decision</b>, and you have now seen both failure modes: strict is stronger and unsafe where routing is asymmetric; loose is safe and only catches sources with no route at all.</div>

<div class="lab-earned"><b>What you earned</b>
You can place an ACL correctly because you have seen what happens when you do not, and you know the rule follows from what each type can match rather than from convention. You read a zero hit counter as a diagnosis rather than a puzzle. You know a dead rule below a catch-all permit is invisible except through counters, and that numbered lists make it hard to fix. You have taken an IPv6 segment down by filtering NDP — the failure that looks nothing like its cause — and you know the two lines that prevent it on every platform. And you have watched strict uRPF drop both a spoofed packet and a legitimate one, so you know exactly which edges it belongs on.</div>

</div>
</div>

---

## Test yourself

<div class="qz">
<p class="qz-q"><span class="qz-num">Q1</span>An ACL contains only <code>deny</code> statements. What does it permit?</p>
<label class="qz-opt"><input type="radio" name="aq1"><span>Everything not explicitly denied</span><em class="qz-fb qz-bad">That would be true of a firewall with a default-allow policy. An ACL is the opposite.</em></label>
<label class="qz-opt"><input type="radio" name="aq1"><span>Nothing — the implicit <code>deny any</code> drops everything else</span><em class="qz-fb qz-good">Correct, and it is how people block an entire subnet while meaning to block one host. Every ACL needs an explicit permit unless you really do mean to deny everything.</em></label>
<label class="qz-opt"><input type="radio" name="aq1"><span>Only traffic matching the last line</span><em class="qz-fb qz-bad">Lines are evaluated top down and matching a deny drops the packet. Nothing is permitted.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q2</span>Why does a standard ACL belong close to the destination?</p>
<label class="qz-opt"><input type="radio" name="aq2"><span>Because it matches the source only, so filtering early blocks that source from everything</span><em class="qz-fb qz-good">Right — placement supplies the destination information the ACL itself cannot express. An extended ACL can name both ends, so it goes near the source instead.</em></label>
<label class="qz-opt"><input type="radio" name="aq2"><span>Because it is slower to process</span><em class="qz-fb qz-bad">Standard lists are simpler and faster. Performance is not the reason.</em></label>
<label class="qz-opt"><input type="radio" name="aq2"><span>Because it can only be applied outbound</span><em class="qz-fb qz-bad">It can be applied in either direction.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q3</span>A rule you are certain should be matching shows zero hits. What are the two likeliest causes?</p>
<label class="qz-opt"><input type="radio" name="aq3"><span>Wrong interface or direction, or an earlier line is matching first</span><em class="qz-fb qz-good">Correct — and those two cover almost every case. The counter distinguishes "not in the path" from "unreachable rule" once you check the lines above it.</em></label>
<label class="qz-opt"><input type="radio" name="aq3"><span>The wildcard mask is inverted</span><em class="qz-fb qz-bad">Possible, but that usually produces wrong matches rather than none at all.</em></label>
<label class="qz-opt"><input type="radio" name="aq3"><span>Counters are unreliable on modern platforms</span><em class="qz-fb qz-bad">They are reliable, and they are the best tool this topic has.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q4</span>You add <code>deny ipv6 any any</code> to the end of an IPv6 ACL to get hit counts. What can happen?</p>
<label class="qz-opt"><input type="radio" name="aq4"><span>Nothing — it duplicates the implicit deny</span><em class="qz-fb qz-bad">On platforms that have implicit NDP permits, your explicit deny sits <em>above</em> them.</em></label>
<label class="qz-opt"><input type="radio" name="aq4"><span>Neighbour discovery is filtered and the segment stops working</span><em class="qz-fb qz-good">Correct on platforms with implicit NDP permits — your line lands above them. Write <code>permit icmp any any nd-ns</code> and <code>nd-na</code> at the top yourself; it is right on every platform.</em></label>
<label class="qz-opt"><input type="radio" name="aq4"><span>The ACL is rejected as redundant</span><em class="qz-fb qz-bad">It is accepted without comment.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q5</span>Where is strict uRPF (<code>reachable-via rx</code>) safe to enable?</p>
<label class="qz-opt"><input type="radio" name="aq5"><span>On any interface — it only ever drops spoofed traffic</span><em class="qz-fb qz-bad">It drops anything whose return path does not point back out the same interface, spoofed or not.</em></label>
<label class="qz-opt"><input type="radio" name="aq5"><span>On a single-homed edge where routing is symmetric</span><em class="qz-fb qz-good">Correct. Where routing is asymmetric it drops legitimate traffic silently — use loose mode (<code>reachable-via any</code>) there instead.</em></label>
<label class="qz-opt"><input type="radio" name="aq5"><span>Only on interfaces facing the internet</span><em class="qz-fb qz-bad">The customer or user edge is where it does the most good — that is where spoofed sources originate.</em></label>
</div>

---

## References

- Cisco — [Configuring IP Access Lists](https://www.cisco.com/c/en/us/support/docs/security/ios-firewall/23602-confaccesslists.html) — the standard reference for placement, wildcards and the implicit deny.
- Cisco — [IPv6 Access Control Lists](https://www.cisco.com/c/en/us/td/docs/ios-xml/ios/sec_data_acl/configuration/15-sy/sec-data-acl-15-sy-book/ip6-acls.html) — including the platform differences in implicit NDP permits.
- Cisco — [Understanding Unicast Reverse Path Forwarding](https://www.cisco.com/c/en/us/about/security-center/unicast-reverse-path-forwarding.html)
- **BCP 38 / RFC 2827** — Network Ingress Filtering, the reason uRPF exists.
- **RFC 4890** — Recommendations for Filtering ICMPv6 Messages in Firewalls. Which ICMPv6 types must never be blocked.

---

*Related: [IPv6 addressing, EUI-64 and NDP](/blog/ipv6-addressing-types-eui64-and-ndp) · [How a router chooses](/blog/how-a-router-chooses-routing-table-longest-match-and-ad) · [Policy-based routing](/blog/policy-based-routing-pbr-explained).*

*Part of the [CCNA, ENCOR and ENARSI topic-by-topic study guide](/blog/ccna-ccnp-study-guide).*
