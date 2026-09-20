---
title: "Static Routes, DHCP Relay and Getting Files Onto a Router"
excerpt: "A static route pointing at a broadcast interface will ARP for every destination on earth. A DHCP broadcast stops at the first router unless you tell it otherwise. And the reason your image copy failed at 62% is almost always flash space, not the network."
date: "2026-09-21"
tags: ["Static routing", "DHCP", "Relay", "TFTP", "FTP", "CCNA"]
draft: false
---

> **Blueprint:** CCNA 200-301 — 3.3 *Configure and verify IPv4 and IPv6 static routing*, 4.6 *Configure and verify DHCP client and relay*, 4.9 *Describe the capabilities and functions of TFTP/FTP in the network*.

## Cheat sheet

| Static route form | Behaviour |
|---|---|
| `ip route 10.1.0.0 255.255.255.0 10.0.0.2` | **Next hop.** Recursive lookup. **Use this** |
| `ip route … GigabitEthernet0/1` | **Exit interface.** Fine on point-to-point, **dangerous on Ethernet** |
| `ip route … Gi0/1 10.0.0.2` | **Fully specified.** Both — the safest form |
| `ip route 0.0.0.0 0.0.0.0 …` | Default route |
| `ip route … 200` | **Floating static** — higher AD, backup only |
| `ip route … track 1` | Withdraws when the tracked object fails |

| IPv6 | Note |
|---|---|
| `ipv6 route 2001:db8::/64 2001:db8:0:1::2` | Global next hop |
| `ipv6 route ::/0 Gi0/1 FE80::2` | **Link-local next hop needs the interface** — it is ambiguous otherwise |
| `ipv6 unicast-routing` | **Required.** Nothing IPv6 routes without it |

| DHCP | |
|---|---|
| **DORA** | Discover, Offer, Request, Acknowledge |
| **Relay** | `ip helper-address x.x.x.x` on the **client-side SVI** |
| Forwards by default | DHCP(67/68), TFTP(69), DNS(53), NetBIOS, TIME, TACACS |
| **Option 82** | Relay inserts circuit/remote ID — which port the request came from |

| Transfer | Port | Note |
|---|---|---|
| **TFTP** | **UDP 69** | No auth, no listing, no resume. Fine on a LAN |
| **FTP** | TCP 21 + data | Credentials **in the clear** |
| **SCP / SFTP** | TCP 22 | Encrypted. **Use these** |

**The sentence that saves an afternoon.** `ip route 10.0.0.0 255.0.0.0 GigabitEthernet0/1` on an **Ethernet** interface makes the router believe every one of those 16 million addresses is directly attached — so it **ARPs for each one individually**. The ARP table explodes, CPU climbs, and the cause is one apparently harmless line.

---

## Static route types, one by one

A static route is you telling the router "to reach *this*, go *there*." The four the blueprint names differ only in how specific the destination is, and in one case, when the route is allowed to be used.

### Default route

The **default route**, `0.0.0.0/0` (`::/0` in IPv6), matches **anything** the router has no more specific route for — the "gateway of last resort." It is the single most common static route: a stub site points a default at its ISP and needs nothing else.

- **Beginner:** "if I don't know where it goes, send it here."
- **Working knowledge:** `ip route 0.0.0.0 0.0.0.0 203.0.113.1`. It appears at the top of `show ip route` as the gateway of last resort; "not set" means unmatched traffic is dropped.
- **Pro:** it is just the least-specific prefix, so [longest-prefix match](/blog/how-a-router-chooses-routing-table-longest-match-and-ad) reaches it only when nothing else matches — no special machinery, only the shortest possible mask.

### Network route

A **network route** points at a **subnet** — `ip route 10.1.20.0 255.255.255.0 10.0.12.2`. It is the everyday static: reach this network via that next hop.

- **Beginner:** a route to a whole subnet.
- **Working knowledge:** prefer a **next-hop** or a **fully specified** (interface + next-hop) form; a bare exit-interface static on Ethernet makes the router ARP for every host in the range. See [Why exit-interface statics are dangerous on Ethernet](#why-exit-interface-statics-are-dangerous-on-ethernet).
- **Pro:** a network route with an unresolvable next hop is silently **inactive** — present in the config, absent from the table — a recursion failure nothing logs.

### Host route

A **host route** is a static to a **single address**: a /32 in IPv4 (`ip route 10.1.20.9 255.255.255.255 …`) or a /128 in IPv6. Because it is the most specific possible prefix, it wins over any network route covering the same address.

- **Beginner:** a route to exactly one device.
- **Working knowledge:** used to pin one destination down a specific path, or for a loopback, or as the `L` (local) entries the router creates for its own interface addresses.
- **Pro:** host routes are how you make an exception to a summary — the /32 is used for that one address, the summary for everything else, decided purely by longest-match before AD or metric enters.

### Floating static

A **floating static** is a backup route with a **higher administrative distance** than the primary, so it sits idle and installs only if the primary is withdrawn: `ip route 0.0.0.0 0.0.0.0 198.51.100.1 200`.

- **Beginner:** a spare route that activates only when the main one disappears.
- **Working knowledge:** the AD (here 200) must be higher than the primary's; the floating route appears in `show ip route` only while the primary is gone.
- **Pro:** the trap — a static is withdrawn only when its **next hop** becomes unreachable, which on a connected subnet essentially never happens, so the far end can be broken while the primary stays installed and the backup never fires. Pair it with [IP SLA and object tracking](/blog/ip-sla-probes-jitter-and-tracking-objects) so the primary withdraws on *service* failure, not just link failure.

---

## Why exit-interface statics are dangerous on Ethernet

<figure class="fig">
<svg viewBox="0 0 640 265" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A static route to a broadcast interface causes the router to ARP for every destination in the range">
  <style>
    .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}
    .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}
    .m{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;fill:#17171A}
    .n{fill:#17171A}.nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:10px;font-weight:700}
  </style>
  <rect class="n" x="30" y="56" width="90" height="30" rx="3"/><text class="nt" x="75" y="76" text-anchor="middle">R1</text>
  <line x1="120" y1="71" x2="520" y2="71" stroke="#8A8A93" stroke-width="2"/>
  <circle r="4" fill="#D3002D"><animateMotion dur="1.1s" repeatCount="indefinite" path="M 120 71 L 520 71"/></circle>
  <circle r="4" fill="#D3002D"><animateMotion dur="1.1s" begin="0.25s" repeatCount="indefinite" path="M 120 71 L 520 71"/></circle>
  <circle r="4" fill="#D3002D"><animateMotion dur="1.1s" begin="0.5s" repeatCount="indefinite" path="M 120 71 L 520 71"/></circle>
  <circle r="4" fill="#D3002D"><animateMotion dur="1.1s" begin="0.75s" repeatCount="indefinite" path="M 120 71 L 520 71"/></circle>
  <text class="m" x="320" y="50" text-anchor="middle" fill="#B80027">ARP who has 10.0.0.1? …10.0.0.2? …10.0.0.3?</text>
  <text class="s" x="320" y="104" text-anchor="middle">one ARP request per destination address, for ever</text>
  <rect x="14" y="124" width="612" height="56" fill="rgba(211,0,45,.08)" stroke="#D3002D"/>
  <text class="k" x="26" y="144" fill="#B80027">The router thinks all 16 million addresses are on this wire.</text>
  <text class="s" x="26" y="164">ARP table fills, CPU climbs, and the router may start dropping legitimate traffic. On a point-to-point</text>
  <text class="s" x="26" y="176">link this form is harmless, because there is only one possible neighbour.</text>
  <rect x="14" y="194" width="612" height="56" fill="rgba(31,157,107,.10)" stroke="#1f9d6b"/>
  <text class="k" x="26" y="214" fill="#0f6b47">Always name a next hop on multi-access media.</text>
  <text class="m" x="26" y="236">ip route 10.0.0.0 255.0.0.0 10.0.12.2          ← or fully specified: Gi0/1 10.0.12.2</text>
</svg>
<figcaption><b>Figure 1.</b> One line, no error message, and a router that spends its day ARPing for addresses that are nowhere near it.</figcaption>
</figure>

<div class="why">
<b>Recursion, and why a next-hop route can silently fail</b>
A next-hop static route requires a <b>recursive lookup</b>: to use <code>via 10.0.12.2</code> the router must first know how to reach 10.0.12.2. Normally that is a connected route and it resolves instantly.
<br><br>But point a static at a next hop learned <i>only</i> from another static that points somewhere else, and you can build a chain that resolves to nothing. IOS marks the route <b>inactive</b> and quietly leaves it out of the table — <code>show running-config</code> shows it configured and <code>show ip route</code> does not have it.
<br><br>The <b>fully specified</b> form — interface <i>and</i> next hop — avoids both problems at once. No ARP storm, no recursion ambiguity. It is slightly more typing and it is the form to default to.
</div>

---

## Three things that behave in unexpected ways

<div class="walk">
<div class="walk-head">Statics, relay, and copying files <span class="walk-hint">click a step</span></div>
<div class="walk-tabs">
  <input type="radio" name="stw" id="st1" checked><label for="st1"><span class="step-n">1</span>Floating static</label>
  <input type="radio" name="stw" id="st2"><label for="st2"><span class="step-n">2</span>IPv6 link-local</label>
  <input type="radio" name="stw" id="st3"><label for="st3"><span class="step-n">3</span>DHCP relay</label>
  <input type="radio" name="stw" id="st4"><label for="st4"><span class="step-n">4</span>TFTP vs SCP</label>
</div>
<div class="walk-panels">
<div class="walk-panel">
<svg viewBox="0 0 640 195" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A floating static with a higher administrative distance only installs when the primary is withdrawn">
  <style>.s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.m{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;fill:#17171A}.ok{fill:rgba(31,157,107,.16);stroke:#1f9d6b}.f{fill:#E4E4E9;stroke:#B5B5BC}</style>
  <rect class="ok" x="14" y="34" width="612" height="30"/>
  <text class="m" x="26" y="54">ip route 0.0.0.0 0.0.0.0 203.0.113.1          AD 1   ← installed</text>
  <rect class="f" x="14" y="70" width="612" height="30"/>
  <text class="m" x="26" y="90">ip route 0.0.0.0 0.0.0.0 198.51.100.1 <tspan font-weight="700">200</tspan>      AD 200 ← waiting</text>
  <text class="k" x="14" y="130" fill="#B80027">But the primary is only withdrawn if its NEXT HOP becomes unreachable.</text>
  <text class="s" x="14" y="154">On a connected subnet that essentially never happens — so the backup never installs, and the</text>
  <text class="s" x="14" y="170">failover you designed does not exist until you add tracking.</text>
  <text class="s" x="14" y="192">See the IP SLA article: a probe plus a tracked object is what makes this actually work.</text>
</svg>
<p class="walk-say"><span class="walk-title">A floating static is half a failover</span>
Two default routes, one at AD 1 and one at AD 200. The lower AD wins and the other sits idle. So far so good.
<br><br>The problem is what triggers the switch. <b>A static route is withdrawn only when its next hop becomes unreachable</b> — and on a connected Ethernet subnet the next hop stays "reachable" as long as the interface is up, regardless of what is happening beyond it.
<br><br>So the far end can be completely broken while your primary route stays installed and the backup never gets a turn. The fix is <a href="/blog/ip-sla-probes-jitter-and-tracking-objects">IP SLA plus a tracked object</a>, and without it a floating static is a failover mechanism that has never been tested because it has never fired.</p>
</div>
<div class="walk-panel">
<svg viewBox="0 0 640 195" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A link-local next hop is ambiguous without naming the interface because the same address can exist on every link">
  <style>.s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.m{font-family:ui-monospace,Menlo,monospace;font-size:10px;fill:#17171A}.n{fill:#17171A}.nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:10px;font-weight:700}</style>
  <rect class="n" x="260" y="70" width="90" height="30" rx="3"/><text class="nt" x="305" y="90" text-anchor="middle">R1</text>
  <line x1="260" y1="78" x2="90" y2="40" stroke="#8A8A93" stroke-width="2"/>
  <line x1="260" y1="92" x2="90" y2="130" stroke="#8A8A93" stroke-width="2"/>
  <text class="m" x="80" y="36" text-anchor="end">FE80::2</text>
  <text class="m" x="80" y="134" text-anchor="end">FE80::2</text>
  <text class="s" x="150" y="58">Gi0/1</text>
  <text class="s" x="150" y="116">Gi0/2</text>
  <text class="k" x="14" y="166" fill="#B80027">The same link-local address, legitimately, on two different links.</text>
  <text class="s" x="14" y="188">So <tspan font-family="ui-monospace,Menlo,monospace">ipv6 route ::/0 FE80::2</tspan> is meaningless — IOS rejects it. Name the interface.</text>
</svg>
<p class="walk-say"><span class="walk-title">IPv6 link-local next hops need an interface</span>
Link-local addresses are only unique <b>per link</b>. The same FE80::2 can exist on every interface of every router, entirely legitimately — so a route pointing at one without saying which link is ambiguous.
<br><br>IOS rejects it. The correct form names both: <code>ipv6 route ::/0 GigabitEthernet0/1 FE80::2</code>.
<br><br>And the prerequisite that catches everyone: <b><code>ipv6 unicast-routing</code> is off by default.</b> Without it the router accepts every IPv6 address and route you configure, shows them all in the running config, and forwards nothing. See <a href="/blog/ipv6-addressing-types-eui64-and-ndp">the IPv6 article</a> for the addressing that goes with it.</p>
</div>
<div class="walk-panel">
<svg viewBox="0 0 640 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A DHCP broadcast stops at the router unless a helper address converts it to unicast">
  <style>.s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.m{font-family:ui-monospace,Menlo,monospace;font-size:10px;fill:#17171A}.n{fill:#17171A}.nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:10px;font-weight:700}</style>
  <rect class="n" x="20" y="60" width="86" height="28" rx="3"/><text class="nt" x="63" y="78" text-anchor="middle">client</text>
  <rect class="n" x="270" y="60" width="86" height="28" rx="3"/><text class="nt" x="313" y="78" text-anchor="middle">R1</text>
  <rect class="n" x="520" y="60" width="96" height="28" rx="3"/><text class="nt" x="568" y="78" text-anchor="middle">DHCP srv</text>
  <path d="M 106 66 L 270 66" stroke="#4b7bec" stroke-width="2" fill="none"/>
  <circle r="4" fill="#4b7bec"><animateMotion dur="1.5s" repeatCount="indefinite" path="M 106 66 L 270 66"/></circle>
  <text class="m" x="188" y="54" text-anchor="middle">broadcast 255.255.255.255</text>
  <path d="M 356 66 L 520 66" stroke="#1f9d6b" stroke-width="2" fill="none"/>
  <circle r="4" fill="#1f9d6b"><animateMotion dur="1.5s" begin="0.7s" repeatCount="indefinite" path="M 356 66 L 520 66"/></circle>
  <text class="m" x="438" y="54" text-anchor="middle" fill="#0f6b47">unicast to the server</text>
  <text class="s" x="313" y="106" text-anchor="middle">relay rewrites it, and fills in giaddr</text>
  <rect x="14" y="124" width="612" height="62" fill="rgba(31,157,107,.10)" stroke="#1f9d6b"/>
  <text class="k" x="26" y="144" fill="#0f6b47">giaddr is how the server knows which scope to use.</text>
  <text class="s" x="26" y="164">The relay writes its own interface address into the Gateway IP Address field, and the server picks</text>
  <text class="s" x="26" y="180">the scope matching it. Put the helper on the wrong SVI and clients get addresses from the wrong subnet.</text>
</svg>
<p class="walk-say"><span class="walk-title">The relay does two jobs, and the second one matters more</span>
A DHCP Discover is a broadcast, and routers do not forward broadcasts. <code>ip helper-address</code> makes the router convert it to a unicast aimed at the server.
<br><br>The part people miss: the relay also fills in <b>giaddr</b> with the address of the interface the request arrived on, and <b>that is how the server decides which scope to allocate from</b>. Which is why the helper must be on the <b>client-side</b> SVI. Put it on the wrong interface and clients get addresses from the wrong subnet — an address that looks fine and does not work.
<br><br>Also worth knowing: <code>ip helper-address</code> forwards <b>seven UDP services</b>, not just DHCP — TFTP, DNS, NetBIOS and others come along too. Usually harmless, occasionally surprising, and controllable with <code>ip forward-protocol udp</code>.</p>
</div>
<div class="walk-panel">
<svg viewBox="0 0 640 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="TFTP and FTP send credentials and data in the clear while SCP encrypts everything">
  <style>.s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.m{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;fill:#17171A}.bad{fill:rgba(211,0,45,.10);stroke:#D3002D}.ok{fill:rgba(31,157,107,.14);stroke:#1f9d6b}</style>
  <rect class="bad" x="14" y="28" width="300" height="76"/>
  <text class="k" x="26" y="48" fill="#B80027">TFTP — UDP 69</text>
  <text class="s" x="26" y="68">no authentication at all</text>
  <text class="s" x="26" y="84">no listing, no resume, no encryption</text>
  <text class="s" x="26" y="100">32 MB limit on many implementations</text>
  <rect class="bad" x="326" y="28" width="300" height="76"/>
  <text class="k" x="338" y="48" fill="#B80027">FTP — TCP 21 + data</text>
  <text class="s" x="338" y="68">username and password in the clear</text>
  <text class="s" x="338" y="84">active vs passive mode firewall pain</text>
  <text class="s" x="338" y="100">resumable, can list directories</text>
  <rect class="ok" x="14" y="118" width="612" height="66"/>
  <text class="k" x="26" y="138" fill="#0f6b47">SCP / SFTP — TCP 22</text>
  <text class="s" x="26" y="158">Encrypted, authenticated, one port, works through firewalls, resumable.</text>
  <text class="m" x="26" y="178">ip scp server enable    — then: copy scp: flash:</text>
</svg>
<p class="walk-say"><span class="walk-title">TFTP still exists for one good reason</span>
TFTP is minimal by design: no authentication, no directory listing, no resume, and many implementations cap at 32 MB. Anyone who can reach the server can read or write it.
<br><br>It survives because it is <b>tiny enough to fit in ROMMON</b>. When a router has no image and you are on the console recovering it, TFTP is what you have — and that is a genuinely good reason to keep knowing it.
<br><br>For everything else use <b>SCP</b>. It is encrypted, authenticated, uses one port so firewalls cooperate, and <code>ip scp server enable</code> is the entire configuration. <b>FTP is the worst of both</b>: credentials in the clear <i>and</i> a two-connection model that fights every firewall you own.</p>
</div>
</div>
</div>

---

## Configuration, word by word

<div class="cmd">
<div class="cmd-line"><span class="opt">! statics — the forms worth using</span>
<span class="t">ip route</span> <span class="opt">10.1.20.0 255.255.255.0 10.0.12.2</span>
<span class="t">ip route</span> <span class="opt">0.0.0.0 0.0.0.0 GigabitEthernet0/1 203.0.113.1</span>
<span class="t">ip route</span> <span class="opt">0.0.0.0 0.0.0.0 198.51.100.1 200</span>
<span class="t">ip route</span> <span class="opt">192.168.99.0 255.255.255.0 Null0</span>
!
<span class="t">ipv6 unicast-routing</span>
<span class="t">ipv6 route</span> <span class="opt">2001:db8:1::/64 GigabitEthernet0/1 FE80::2</span>
!
<span class="opt">! DHCP relay — on the CLIENT side</span>
<span class="t">interface Vlan</span><span class="opt">20</span>
 <span class="t">ip address</span> <span class="opt">10.1.20.1 255.255.255.0</span>
 <span class="t">ip helper-address</span> <span class="opt">10.1.5.10</span>
!
<span class="opt">! or be the server yourself</span>
<span class="t">ip dhcp excluded-address</span> <span class="opt">10.1.20.1 10.1.20.20</span>
<span class="t">ip dhcp pool</span> <span class="opt">VLAN20</span>
 <span class="t">network</span> <span class="opt">10.1.20.0 255.255.255.0</span>
 <span class="t">default-router</span> <span class="opt">10.1.20.1</span>
 <span class="t">dns-server</span> <span class="opt">10.1.5.10</span>
 <span class="t">lease</span> <span class="opt">0 8</span>
!
<span class="t">ip scp server enable</span></div>
<dl class="cmd-parts">
<div class="is-key"><dt>… Gi0/1 203.0.113.1<br>(fully specified)</dt><dd><b>The form to default to.</b> The interface stops recursion ambiguity; the next hop stops the ARP-for-everything behaviour. Slightly more typing, no downside.</dd></div>
<div class="is-key"><dt>… 198.51.100.1 <b>200</b></dt><dd>Floating static. <b>But it only installs when the primary is withdrawn</b>, and a static with a reachable next hop is never withdrawn. Pair it with <code>track</code> or it is decoration.</dd></div>
<div><dt>… Null0</dt><dd>A deliberate black hole. Useful for anti-spoofing, for stopping a prefix leaking, and as the discard route behind a summary. Traffic is dropped silently and efficiently.</dd></div>
<div class="is-key"><dt>ipv6 unicast-routing</dt><dd><b>Off by default, and its absence is silent.</b> Addresses configure, routes appear in the running config, and nothing forwards. First thing to check on any IPv6 problem.</dd></div>
<div class="is-key"><dt>ip helper-address<br>on Vlan20</dt><dd><b>On the client-side interface, not the server side.</b> It supplies <code>giaddr</code>, which is what the server uses to choose a scope — so the wrong interface produces addresses from the wrong subnet. It also forwards six other UDP services by default; trim them with <code>no ip forward-protocol udp</code> if that matters.</dd></div>
<div class="is-key"><dt>ip dhcp <br>excluded-address</dt><dd><b>Configure this before the pool, always.</b> The pool hands out everything in the network statement, gateway and server addresses included, unless excluded. Duplicate-address complaints from statics that were "obviously" reserved come from here.</dd></div>
<div><dt>lease 0 8</dt><dd>Days, hours, minutes. Short leases on guest and wireless networks recycle addresses; long leases on wired reduce churn. The default is one day.</dd></div>
<div><dt>ip scp server enable</dt><dd>The entire configuration for encrypted file transfer to the device, given SSH is already working. <b>There is no reason to use FTP once this is on.</b></dd></div>
</dl>
</div>

---

## Reading it

<div class="term">
<div class="term-bar"><span class="term-dots"><i></i><i></i><i></i></span>R1 — routes that are configured and not installed</div>
<pre><span class="p">R1#</span> <span class="c">show ip route static</span>
S*    0.0.0.0/0 [1/0] via 203.0.113.1, GigabitEthernet0/1
S     10.1.20.0/24 [1/0] via 10.0.12.2
<span class="o">! The AD 200 floating default is NOT here. Correct — the primary is up.</span>

<span class="p">R1#</span> <span class="c">show running-config | include ^ip route</span>
ip route 0.0.0.0 0.0.0.0 GigabitEthernet0/1 203.0.113.1
ip route 0.0.0.0 0.0.0.0 198.51.100.1 200
ip route 10.1.20.0 255.255.255.0 10.0.12.2
<span class="r">ip route 172.16.0.0 255.255.0.0 10.9.9.9</span>
<span class="o">! ^^^ configured but absent from the routing table — the next hop</span>
<span class="o">! 10.9.9.9 is unresolvable, so the route is inactive. No warning given.</span>

<span class="p">R1#</span> <span class="c">show ip dhcp binding</span>
IP address       Client-ID/            Lease expiration    Type
                 Hardware address
10.1.20.21       0100.5056.01aa.01     Sep 22 2026 09:14   Automatic
10.1.20.22       0100.5056.01aa.02     Sep 22 2026 09:16   Automatic

<span class="p">R1#</span> <span class="c">show ip dhcp conflict</span>
IP address        Detection method   Detection time
<span class="r">10.1.20.15        Ping               Sep 21 2026 14:02</span>
<span class="o">! A static device inside the pool range. Exclude it, then</span>
<span class="o">! "clear ip dhcp conflict *" — conflicts are NOT retried automatically.</span>

<span class="p">R1#</span> <span class="c">debug ip dhcp server packet</span>
DHCPD: DHCPDISCOVER received from client on Vlan20.
DHCPD: <span class="y">relay information option exists</span>
DHCPD: Sending DHCPOFFER to client (10.1.20.21).

<span class="p">R1#</span> <span class="c">copy scp: flash:</span>
Address or name of remote host []? 10.1.5.50
Source username [admin]? deploy
Destination filename [c9200-universalk9.17.09.04a.SPA.bin]?
<span class="r">%Error copying scp://... (No space left on device)</span>
<span class="o">! Check "dir flash:" BEFORE starting. This is the usual cause of a</span>
<span class="o">! copy that dies partway through, and it is not a network problem.</span><span class="cur"></span></pre>
</div>
<p class="term-cap"><b>Compare `show run | include ip route` against `show ip route static`.</b> A static in the config but not in the table is an unresolvable next hop, and nothing anywhere reports it. That one comparison finds a class of fault that otherwise looks like a routing protocol problem.</p>

<div class="real">
<b>In the real world</b>
Static routes are everywhere despite dynamic routing, because for a stub site with one uplink they are simply correct — nothing to converge, nothing to misconfigure. <b>The failure mode is always the same</b>: a static that cannot tell the difference between "the link is up" and "the far end works". Pair anything that matters with tracking.
<br><br>DHCP relay is one of the most common tickets you will ever see, and it is almost always <b>a missing or misplaced <code>ip helper-address</code></b>, or a scope that has run out. <code>show ip dhcp pool</code> tells you the second one instantly and nobody checks it.
<br><br>And for file transfer: turn on SCP, and check <code>dir flash:</code> before every image copy. <b>Most failed upgrades are a full filesystem</b>, discovered at 60% through a 900 MB download.
</div>

---

## What goes wrong

**High CPU, enormous ARP table.** Exit-interface static on Ethernet. Add a next hop.

**Static in the config, absent from the routing table.** Unresolvable next hop. Nothing logs it.

**Backup route never activates.** Floating static with no tracking — the primary is never withdrawn.

**IPv6 configured, nothing forwards.** Missing `ipv6 unicast-routing`.

**IPv6 link-local next hop rejected.** Name the interface as well.

**Clients get no address.** Missing `ip helper-address`, or it is on the wrong SVI.

**Clients get addresses from the wrong subnet.** Helper on the wrong interface — `giaddr` is wrong.

**Duplicate addresses.** Statics not excluded from the pool. Check `show ip dhcp conflict`.

**Image copy fails partway.** Flash full. `dir flash:` first.

---

<div class="lab">
<div class="lab-head">Lab — build an ARP storm, then a failover that does not fail over</div>
<div class="lab-body">

<div class="lab-target"><b>Target</b>
Produce the exit-interface ARP storm on purpose and watch the ARP table and CPU respond. Build a floating static and prove it never activates without tracking. Break DHCP relay two different ways. Then copy a file with TFTP and with SCP and capture both.</div>

**Topology.** Three routers, a switch with two VLANs, a DHCP server on one subnet and clients on another, plus a TFTP/SCP server.

<p class="lab-step"><span class="n">1</span>The ARP storm</p>

```cisco
R1(config)# ip route 10.0.0.0 255.0.0.0 GigabitEthernet0/1
R1# clear arp-cache
```

Then generate traffic to several addresses in 10.0.0.0/8.

<div class="lab-watch"><b>Things to notice</b>
<code>show arp | count</code> climbs — <b>one entry per destination you send to</b>, plus incomplete entries for those that never answer. Watch <code>show processes cpu sorted</code> and find ARP Input near the top.
<br><br>Change the route to name a next hop and clear the cache. <b>One ARP entry now, for the next hop only.</b> Same destinations, same traffic, completely different behaviour — and the only difference is one word on one line.</div>

<p class="lab-step"><span class="n">2</span>The failover that does not fail over</p>

Configure a primary default and a floating static at AD 200. Then break connectivity **beyond** the primary next hop without touching the interface.

<div class="lab-issues"><b>Possible issues</b>
<ul>
<li><b>The backup installs</b> — you took the interface down. Break something further away instead.</li>
<li><b>Traffic still works</b> — there is another path; remove it.</li>
<li><b>Both routes show</b> — the ADs are equal; check you typed 200.</li>
</ul>
<b>The primary stays installed and traffic is black-holed.</b> <code>show ip route</code> looks entirely healthy. Add an IP SLA probe and <code>track</code>, and watch the primary withdraw and the backup install within seconds. <b>That contrast is why a floating static alone is not a failover design.</b></div>

<p class="lab-step"><span class="n">3</span>Make a static inactive</p>

```cisco
R1(config)# ip route 172.16.0.0 255.255.0.0 10.9.9.9
```

with no route to 10.9.9.9 at all.

<div class="lab-watch"><b>Things to notice</b>
IOS accepts it without complaint. <code>show run</code> has it; <code>show ip route</code> does not. <b>No log, no warning, no state.</b>
<br><br>Then add a route to reach 10.9.9.9 and watch the static appear. <b>Get into the habit of comparing the two outputs</b> — it is the only way this fault surfaces.</div>

<p class="lab-step"><span class="n">4</span>Break DHCP relay two ways</p>

First remove `ip helper-address` entirely. Then put it back — on the **server-side** interface instead of the client-side SVI.

<div class="lab-watch"><b>Things to notice</b>
Without it: <b>169.254.x.x</b>, and a capture on the client port shows Discovers going out with nothing coming back.
<br><br>On the wrong interface: the client may get an address <b>from the wrong scope</b>, because <code>giaddr</code> told the server the wrong thing. That is worse — the client has an address, believes it is fine, and nothing works. Watch <code>giaddr</code> change in a capture as you move the helper.</div>

<p class="lab-step"><span class="n">5</span>Create a duplicate address</p>

Configure a host statically with an address inside the DHCP pool range, without excluding it.

<div class="lab-watch"><b>Things to notice</b>
The server pings before offering, detects the conflict, and logs it in <b><code>show ip dhcp conflict</code></b>. It then <b>removes that address from the pool permanently</b> — conflicts are not retried.
<br><br>Exclude the address properly and run <code>clear ip dhcp conflict *</code>. <b>Over time an unmaintained pool loses addresses to conflicts and eventually exhausts</b>, which presents as "sometimes clients get no address".</div>

<p class="lab-step"><span class="n">6</span>Capture TFTP, then SCP</p>

```bash
tcpdump -i eth0 -w xfer.pcap 'udp port 69 or tcp port 21 or tcp port 22'
```

Copy a file with each.

<div class="lab-watch"><b>Things to notice</b>
In the <b>TFTP</b> capture, read the filename in plain text and follow the 512-byte blocks with their individual acknowledgements — <b>that lockstep is why TFTP is slow over any distance.</b> With <b>FTP</b>, find the <code>USER</code> and <code>PASS</code> commands and <b>read the password directly off the wire.</b>
<br><br>With <b>SCP</b>, there is nothing to read. Same file, same path, and the capture is opaque. <b>One command, <code>ip scp server enable</code>, is the difference</b>, and seeing the FTP password in plain text is what makes that stick.</div>

<div class="lab-earned"><b>What you earned</b>
You have built the ARP storm from an exit-interface static and watched one word fix it. You have proved a floating static does not fail over without tracking, and then made it work. You know a static can sit in the config and never enter the routing table with nothing reporting it. You have broken DHCP relay both by removing it and by misplacing it, and seen why the second is worse. You have watched a pool lose addresses to conflicts. And you have read an FTP password out of your own capture.</div>

</div>
</div>

---

## Test yourself

<div class="qz">
<p class="qz-q"><span class="qz-num">Q1</span>Why is <code>ip route 10.0.0.0 255.0.0.0 Gi0/1</code> dangerous on Ethernet?</p>
<label class="qz-opt"><input type="radio" name="sq1"><span>The router treats every address in the range as directly attached and ARPs for each one</span><em class="qz-fb qz-good">Correct — the ARP table fills and CPU climbs. Harmless on point-to-point, serious on multi-access.</em></label>
<label class="qz-opt"><input type="radio" name="sq1"><span>The route will not install</span><em class="qz-fb qz-bad">It installs perfectly; that is the problem.</em></label>
<label class="qz-opt"><input type="radio" name="sq1"><span>It creates a routing loop</span><em class="qz-fb qz-bad">Possible in other scenarios, but the ARP behaviour is the specific hazard here.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q2</span>A floating static at AD 200 never installs even though the far end is broken. Why?</p>
<label class="qz-opt"><input type="radio" name="sq2"><span>The primary is only withdrawn when its next hop is unreachable, which on a connected subnet it is not</span><em class="qz-fb qz-good">Correct — pair it with IP SLA and a tracked object or the failover never fires.</em></label>
<label class="qz-opt"><input type="radio" name="sq2"><span>AD 200 is invalid</span><em class="qz-fb qz-bad">Valid range is 1–255.</em></label>
<label class="qz-opt"><input type="radio" name="sq2"><span>Both routes are installed simultaneously</span><em class="qz-fb qz-bad">Only the lowest AD installs.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q3</span>Where does <code>ip helper-address</code> go, and why?</p>
<label class="qz-opt"><input type="radio" name="sq3"><span>On the client-side SVI — it supplies <code>giaddr</code>, which tells the server which scope to use</span><em class="qz-fb qz-good">Correct. On the wrong interface, clients get addresses from the wrong subnet.</em></label>
<label class="qz-opt"><input type="radio" name="sq3"><span>On the interface facing the DHCP server</span><em class="qz-fb qz-bad">A common guess, and it produces addresses from the wrong scope.</em></label>
<label class="qz-opt"><input type="radio" name="sq3"><span>On the DHCP server itself</span><em class="qz-fb qz-bad">It is a router command.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q4</span>Why must an IPv6 static with a link-local next hop name the interface?</p>
<label class="qz-opt"><input type="radio" name="sq4"><span>Link-local addresses are only unique per link — the same one can exist on several interfaces</span><em class="qz-fb qz-good">Correct, so the next hop is ambiguous without the interface and IOS rejects it.</em></label>
<label class="qz-opt"><input type="radio" name="sq4"><span>IPv6 requires interfaces in all static routes</span><em class="qz-fb qz-bad">A global unicast next hop needs no interface.</em></label>
<label class="qz-opt"><input type="radio" name="sq4"><span>To enable <code>ipv6 unicast-routing</code></span><em class="qz-fb qz-bad">That is a separate global command.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q5</span>Why does TFTP still exist?</p>
<label class="qz-opt"><input type="radio" name="sq5"><span>It is small enough to fit in ROMMON, so it works when a device has no image</span><em class="qz-fb qz-good">Correct — that recovery case is its real justification. Use SCP for everything else.</em></label>
<label class="qz-opt"><input type="radio" name="sq5"><span>It is faster than SCP</span><em class="qz-fb qz-bad">Its block-by-block acknowledgement makes it slow over any latency.</em></label>
<label class="qz-opt"><input type="radio" name="sq5"><span>It supports resume</span><em class="qz-fb qz-bad">It does not, which is one of its main weaknesses.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q6</span>A static route is in the running config but not in the routing table. Cause?</p>
<label class="qz-opt"><input type="radio" name="sq6"><span>The next hop is unresolvable, so the route is inactive — and nothing logs it</span><em class="qz-fb qz-good">Correct. Comparing <code>show run | include ip route</code> against <code>show ip route static</code> is the only way it surfaces.</em></label>
<label class="qz-opt"><input type="radio" name="sq6"><span>A routing protocol has a better route</span><em class="qz-fb qz-bad">Possible, but then the protocol's route would be visible for that prefix.</em></label>
<label class="qz-opt"><input type="radio" name="sq6"><span>The AD is too low</span><em class="qz-fb qz-bad">A low AD makes it more preferred, not less.</em></label>
</div>

---

## References

- **RFC 2131** — *Dynamic Host Configuration Protocol*, including `giaddr` and relay behaviour.
- **RFC 3046** — *DHCP Relay Agent Information Option* (option 82).
- **RFC 1350** — *The TFTP Protocol*.
- Cisco — [IP Routing Configuration Guide](https://www.cisco.com/c/en/us/td/docs/ios-xml/ios/iproute_pi/configuration/xe-17/iri-xe-17-book.html)
- Cisco — [DHCP Configuration Guide](https://www.cisco.com/c/en/us/td/docs/ios-xml/ios/ipaddr_dhcp/configuration/xe-17/dhcp-xe-17-book.html)

---

*Related: [How a router chooses](/blog/how-a-router-chooses-routing-table-longest-match-and-ad) · [IP SLA and tracking](/blog/ip-sla-probes-jitter-and-tracking-objects) · [DHCP DORA](/blog/dhcp-dora-process-explained) · [IPv6 addressing](/blog/ipv6-addressing-types-eui64-and-ndp).*

*Part of the [CCNA, ENCOR and ENARSI topic-by-topic study guide](/blog/ccna-ccnp-study-guide).*
