---
title: "Subnetting Without the Table: Two Numbers and You Are Done"
excerpt: "Everyone learns subnetting from a chart and then forgets it. The arithmetic is simpler than the chart: the block size is 256 minus the mask octet, subnets start at multiples of that block, and the broadcast is one below the next one. Three facts, no memorisation."
date: "2026-09-21"
tags: ["IPv4", "Subnetting", "VLSM", "RFC 1918", "Fundamentals", "CCNA"]
draft: false
---

> **Blueprint:** CCNA 200-301 — 1.6 *Configure and verify IPv4 addressing and subnetting*, 1.7 *Describe private IPv4 addressing*, 1.10 *Verify IP parameters for Client OS (Windows, Mac OS, Linux)*.

## Cheat sheet

| Mask | CIDR | Block | Hosts |
|---|---|---|---|
| 255.255.255.0 | /24 | 256 | **254** |
| 255.255.255.128 | /25 | 128 | 126 |
| 255.255.255.192 | /26 | 64 | 62 |
| 255.255.255.224 | /27 | 32 | 30 |
| 255.255.255.240 | /28 | 16 | 14 |
| 255.255.255.248 | /29 | 8 | **6** |
| 255.255.255.252 | /30 | 4 | **2** — point-to-point |
| 255.255.255.254 | /31 | 2 | **2** — point-to-point, no waste |

| Private range | CIDR | Size |
|---|---|---|
| 10.0.0.0 – 10.255.255.255 | **10.0.0.0/8** | 16.7 million |
| 172.16.0.0 – 172.31.255.255 | **172.16.0.0/12** | 1 million |
| 192.168.0.0 – 192.168.255.255 | **192.168.0.0/16** | 65,536 |

| Also worth knowing | |
|---|---|
| **169.254.0.0/16** | APIPA / link-local — **means DHCP failed** |
| **127.0.0.0/8** | Loopback |
| **100.64.0.0/10** | Carrier-grade NAT (RFC 6598) |
| **224.0.0.0/4** | Multicast |

**The whole method, in three lines.** **Block size = 256 − the interesting mask octet.** Subnets begin at **multiples of the block size**. The broadcast is **one below the next subnet**. That is it — no chart, and it works for any mask in a few seconds of mental arithmetic.

---

## The method

<figure class="fig">
<svg class="sv1" viewBox="0 0 640 275" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Working out a subnet by finding the block size and the nearest multiple">
  <style>.sv1 .m{font-family:ui-monospace,Menlo,monospace;font-size:11.5px;fill:#17171A}.sv1 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv1 .k{font-family:ui-sans-serif,system-ui;font-size:12px;font-weight:700}.sv1 .hl{fill:rgba(75,123,236,.16);stroke:#4b7bec}.sv1 .ok{fill:rgba(31,157,107,.14);stroke:#1f9d6b}
  </style>
  <text class="k" x="14" y="26">Given: 192.168.10.100 / 27</text>
  <rect class="hl" x="14" y="40" width="612" height="34"/>
  <text class="m" x="26" y="62">Step 1   /27 → mask 255.255.255.<tspan font-weight="700">224</tspan>   →   block = 256 − 224 = <tspan font-weight="700">32</tspan></text>
  <rect class="hl" x="14" y="82" width="612" height="34"/>
  <text class="m" x="26" y="104">Step 2   multiples of 32:  0, 32, 64, <tspan font-weight="700" fill="#2f5fd0">96</tspan>, 128, …   100 falls in the <tspan font-weight="700">96</tspan> block</text>
  <rect class="ok" x="14" y="124" width="612" height="34"/>
  <text class="m" x="26" y="146">Step 3   next subnet is 128, so broadcast = <tspan font-weight="700">127</tspan></text>
  <rect x="14" y="174" width="612" height="86" fill="#F1EEE9" stroke="#B5B5BC"/>
  <text class="m" x="26" y="196">Network    192.168.10.<tspan font-weight="700">96</tspan></text>
  <text class="m" x="26" y="216">First host 192.168.10.97</text>
  <text class="m" x="26" y="236">Last host  192.168.10.126</text>
  <text class="m" x="26" y="256">Broadcast  192.168.10.<tspan font-weight="700">127</tspan></text>
  <text class="s" x="330" y="216">Three steps. No table.</text>
  <text class="s" x="330" y="236">Works identically for /28, /29, /30 — only the block changes.</text>
</svg>
<figcaption><b>Figure 1.</b> Block size, nearest multiple, one below the next. Practise it twenty times and you will never need the chart again.</figcaption>
</figure>

<div class="why">
<b>Why "minus 2", and why /31 is the exception</b>
The <b>network address</b> (all host bits 0) names the subnet; the <b>broadcast address</b> (all host bits 1) reaches everyone on it. Neither can be assigned, hence 2<sup>n</sup> − 2 usable hosts.
<br><br>On a point-to-point link that is pure waste: a /30 spends four addresses to connect two routers. <b>RFC 3021 defines /31 for exactly this</b> — with one host bit there is no room for both a network and a broadcast address, so the rule is suspended and you get two usable addresses out of two. Supported on IOS point-to-point links for years, and it halves the addressing on a large WAN.
</div>

---

## Where this actually bites

<div class="walk">
<div class="walk-head">Four things that come up constantly <span class="walk-hint">click a step</span></div>
<div class="walk-tabs">
  <input type="radio" name="ipw" id="ip1" checked><label for="ip1"><span class="step-n">1</span>VLSM</label>
  <input type="radio" name="ipw" id="ip2"><label for="ip2"><span class="step-n">2</span>Summarising</label>
  <input type="radio" name="ipw" id="ip3"><label for="ip3"><span class="step-n">3</span>169.254</label>
  <input type="radio" name="ipw" id="ip4"><label for="ip4"><span class="step-n">4</span>Wrong mask</label>
</div>
<div class="walk-panels">
<div class="walk-panel">
<svg class="sv2" viewBox="0 0 640 195" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Variable length subnet masking allocates different sized subnets from one block">
  <style>.sv2 .m{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;fill:#17171A}.sv2 .s{font-family:ui-sans-serif,system-ui;font-size:10px;fill:#5C5C64}.sv2 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv2 .a{fill:rgba(75,123,236,.20);stroke:#4b7bec}.sv2 .b{fill:rgba(31,157,107,.20);stroke:#1f9d6b}.sv2 .c{fill:rgba(242,201,76,.28);stroke:#c99700}.sv2 .d{fill:#E4E4E9;stroke:#B5B5BC}</style>
  <text class="k" x="14" y="24">192.168.1.0/24 carved to fit</text>
  <rect class="a" x="14" y="36" width="306" height="30"/><text class="m" x="167" y="56" text-anchor="middle">.0/25 — 126 hosts</text>
  <rect class="b" x="326" y="36" width="152" height="30"/><text class="m" x="402" y="56" text-anchor="middle">.128/26 — 62</text>
  <rect class="c" x="484" y="36" width="76" height="30"/><text class="m" x="522" y="56" text-anchor="middle">.192/27</text>
  <rect class="d" x="566" y="36" width="60" height="30"/><text class="m" x="596" y="56" text-anchor="middle">spare</text>
  <text class="s" x="167" y="82" text-anchor="middle">user VLAN</text>
  <text class="s" x="402" y="82" text-anchor="middle">servers</text>
  <text class="s" x="522" y="82" text-anchor="middle">mgmt</text>
  <text class="k" x="14" y="120">Allocate largest first, always.</text>
  <text class="s" x="14" y="144">Start with the small subnets and you fragment the space so the large one no longer fits anywhere</text>
  <text class="s" x="14" y="160">contiguous. Largest first is not a style preference — it is what makes the arithmetic work.</text>
  <text class="s" x="14" y="186">And keep it summarisable: four /26s starting at .0 summarise cleanly; scattered ones do not.</text>
</svg>
<p class="walk-say"><span class="walk-title">VLSM — different sizes from one block</span>
Before VLSM every subnet of a network had to use the same mask, so a two-router link consumed as many addresses as a 200-user LAN. VLSM lets you size each subnet to its actual need.
<br><br>The rule that matters: <b>allocate the largest subnet first.</b> Take the /27s first and the remaining space is fragmented, so the /25 has nowhere contiguous to go. Largest first, and the boundaries fall out naturally.
<br><br>Second rule, and the one people skip: <b>allocate so the result can be summarised.</b> Branch subnets assigned in contiguous blocks per region summarise into one advertisement. Assigned as they were requested, they never will — and you will carry that in your routing table for the life of the network.</p>
</div>
<div class="walk-panel">
<svg class="sv3" viewBox="0 0 640 195" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Four contiguous subnets share the same leading bits so they summarise into one prefix">
  <style>.sv3 .m{font-family:ui-monospace,Menlo,monospace;font-size:11px;fill:#17171A}.sv3 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv3 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv3 .same{fill:#2f5fd0}.sv3 .diff{fill:#D3002D}</style>
  <text class="m" x="14" y="38">10.1.<tspan class="same">0000</tspan><tspan class="diff">0000</tspan>.0/24    10.1.0.0/24</text>
  <text class="m" x="14" y="60">10.1.<tspan class="same">0000</tspan><tspan class="diff">0001</tspan>.0/24    10.1.1.0/24</text>
  <text class="m" x="14" y="82">10.1.<tspan class="same">0000</tspan><tspan class="diff">0010</tspan>.0/24    10.1.2.0/24</text>
  <text class="m" x="14" y="104">10.1.<tspan class="same">0000</tspan><tspan class="diff">0011</tspan>.0/24    10.1.3.0/24</text>
  <line x1="14" y1="118" x2="330" y2="118" stroke="#8A8A93"/>
  <text class="m" x="14" y="140" font-weight="700">10.1.<tspan class="same">0000</tspan>0000.0/22   10.1.0.0/22</text>
  <text class="s" x="350" y="60">blue = bits they all share</text>
  <text class="s" x="350" y="82">red = bits that differ</text>
  <text class="s" x="350" y="104">count the shared bits → /22</text>
  <text class="k" x="14" y="174">Count the bits that match from the left. That count IS the summary prefix length.</text>
</svg>
<p class="walk-say"><span class="walk-title">Summarising is just counting shared bits</span>
Write the addresses in binary, find how many leading bits are identical, and that number is your prefix length. Four consecutive /24s share 22 bits, so they summarise to a /22.
<br><br>The constraint people forget: <b>the block must start on a valid boundary.</b> 10.1.0.0 through 10.1.3.0 summarises to /22 cleanly. 10.1.1.0 through 10.1.4.0 does not — it needs a /21 that also covers 10.1.0.0 and 10.1.5.0–10.1.7.0, which you may not own.
<br><br>This is precisely why address plans are worth doing up front. <b>A summarisable plan gives one route where an ad-hoc one gives sixteen</b>, for the entire life of the network.</p>
</div>
<div class="walk-panel">
<svg class="sv4" viewBox="0 0 640 185" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A 169.254 address means the client never received a DHCP response">
  <style>.sv4 .m{font-family:ui-monospace,Menlo,monospace;font-size:11px;fill:#17171A}.sv4 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv4 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv4 .bad{fill:rgba(211,0,45,.10);stroke:#D3002D}</style>
  <rect class="bad" x="14" y="30" width="612" height="50"/>
  <text class="m" x="26" y="52">IPv4 Address . . . . : 169.254.88.201</text>
  <text class="m" x="26" y="70">Subnet Mask  . . . . : 255.255.0.0</text>
  <text class="k" x="14" y="110" fill="#B80027">This is not an IP problem. It is a &#8220;no DHCP server answered&#8221; problem.</text>
  <text class="s" x="14" y="136">Chase, in order: is the port in the right VLAN · is the port even up · is there a DHCP relay</text>
  <text class="s" x="14" y="152">(ip helper-address) on the SVI · is the scope exhausted · is the server actually running.</text>
  <text class="s" x="14" y="178">Renewing the lease will not help. Nothing was ever offered to renew.</text>
</svg>
<p class="walk-say"><span class="walk-title">169.254 is a diagnosis, not an address</span>
When a client gets no DHCP response it assigns itself a link-local address from <b>169.254.0.0/16</b>. It is only ever useful between hosts on the same wire.
<br><br>So <b>seeing it tells you exactly where to look</b>: the DHCP path, not the client. Wrong VLAN on the switch port, missing <code>ip helper-address</code> on the SVI, an exhausted scope, or a dead server.
<br><br>The equivalent on macOS and Linux is the same range. And the equivalent for a client that has an address but cannot reach anything is a <b>mask mismatch</b> — which is the next panel, and far more insidious.</p>
</div>
<div class="walk-panel">
<svg class="sv5" viewBox="0 0 640 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A wrong subnet mask makes a host believe a remote address is local so it never uses the gateway">
  <style>.sv5 .m{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;fill:#17171A}.sv5 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv5 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv5 .n{fill:#17171A}.sv5 .nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:10px;font-weight:700}</style>
  <rect class="n" x="20" y="50" width="100" height="30" rx="3"/><text class="nt" x="70" y="70" text-anchor="middle">PC /16</text>
  <rect class="n" x="480" y="50" width="120" height="30" rx="3"/><text class="nt" x="540" y="70" text-anchor="middle">10.1.20.9</text>
  <path d="M 120 58 L 480 58" stroke="#D3002D" stroke-width="2" stroke-dasharray="5 4" fill="none"/>
  <text class="m" x="300" y="46" text-anchor="middle" fill="#B80027">ARP — because &#8220;it is local&#8221;</text>
  <text class="s" x="300" y="98" text-anchor="middle">nobody answers. The gateway is never consulted.</text>
  <text class="k" x="14" y="136">The PC is configured /16 but the subnet is really /24.</text>
  <text class="s" x="14" y="162">So it thinks everything in 10.1.x.x is on its own wire, ARPs for it, gets nothing, and gives up.</text>
  <text class="s" x="14" y="178">Local traffic works perfectly. Only remote-but-similar-looking addresses fail — which makes it</text>
  <text class="s" x="14" y="194">look like a firewall or a routing problem for as long as you refuse to check the mask.</text>
</svg>
<p class="walk-say"><span class="walk-title">A wrong mask fails selectively, which is why it hides</span>
A host uses its mask for exactly one decision: <b>is this destination on my own subnet?</b> If yes, ARP for it directly. If no, send it to the default gateway.
<br><br>Get the mask wrong and that decision goes wrong in a very specific way. A host configured /16 on a /24 network believes every 10.1.x.x address is a neighbour, ARPs for addresses that are three routers away, and gets no answer.
<br><br>The symptom is what makes it hard: <b>everything on the local subnet works fine, and so does anything in a completely different range.</b> Only addresses that look local but are not will fail. People chase firewalls for hours. <b>Check the mask on both ends first</b> — it costs ten seconds.</p>
</div>
</div>
</div>

---

## Verifying a client, on any OS

<div class="term">
<div class="term-bar"><span class="term-dots"><i></i><i></i><i></i></span>The same four questions, three operating systems</div>
<pre><span class="o">### Windows</span>
<span class="p">C:\&gt;</span> <span class="c">ipconfig /all</span>
   IPv4 Address. . . . . . . . . . . : 10.1.20.50(Preferred)
   Subnet Mask . . . . . . . . . . . : <span class="y">255.255.255.0</span>
   <span class="y">Default Gateway . . . . . . . . . : 10.1.20.1</span>
   DHCP Server . . . . . . . . . . . : 10.1.5.10
   DNS Servers . . . . . . . . . . . : 10.1.5.10
<span class="p">C:\&gt;</span> <span class="c">ipconfig /release</span>  <span class="c">&amp;&amp;</span>  <span class="c">ipconfig /renew</span>
<span class="p">C:\&gt;</span> <span class="c">route print</span>          <span class="o">! and arp -a</span>

<span class="o">### macOS</span>
<span class="p">$</span> <span class="c">ifconfig en0</span>
        inet 10.1.20.50 netmask <span class="y">0xffffff00</span> broadcast 10.1.20.255
        <span class="o">! 0xffffff00 IS 255.255.255.0 — macOS prints it in hex.</span>
<span class="p">$</span> <span class="c">route -n get default | grep gateway</span>
<span class="p">$</span> <span class="c">ipconfig getpacket en0</span>       <span class="o">! the whole DHCP offer, every option</span>

<span class="o">### Linux</span>
<span class="p">$</span> <span class="c">ip addr show</span>
    inet 10.1.20.50<span class="y">/24</span> brd 10.1.20.255 scope global dynamic eth0
<span class="p">$</span> <span class="c">ip route</span>
<span class="g">default via 10.1.20.1 dev eth0</span>
10.1.20.0/24 dev eth0 proto kernel scope link src 10.1.20.50
<span class="p">$</span> <span class="c">resolvectl status | grep -A2 'DNS Servers'</span>
<span class="p">$</span> <span class="c">ip neigh</span>                      <span class="o">! the ARP table</span>

<span class="o">### The four questions, in the only order worth using</span>
<span class="o">!  1. Do I have an address, and is it 169.254? -> DHCP path</span>
<span class="o">!  2. Is the MASK right?          -> local-vs-remote decisions</span>
<span class="o">!  3. Is there a default gateway, and can I ping it? -> L2 + gateway</span>
<span class="o">!  4. Does DNS resolve?           -> ping 8.8.8.8 vs ping google.com</span><span class="cur"></span></pre>
</div>
<p class="term-cap"><b>Step 4 is the one that saves the most time.</b> If <code>ping 8.8.8.8</code> works and <code>ping google.com</code> does not, the network is fine and it is DNS. That single comparison correctly classifies a large share of "the internet is down" reports in about five seconds.</p>

<div class="real">
<b>In the real world</b>
You will do very little subnetting by hand. What you will do constantly is <b>read</b> a subnet and answer "is this address in that range?" — for an ACL, a firewall rule, a summary, a DHCP scope. The block-size method is what makes that instant.
<br><br>The design decision that actually matters is <b>allocating for summarisation</b>. Give each site or region a contiguous block that summarises to a single prefix, with room to grow. Get it right at the start and it costs nothing; get it wrong and you carry hundreds of extra routes for a decade, because renumbering a live network is a project nobody ever funds.
<br><br>And use <b>/31 on point-to-point links</b>. It is well supported, and on a WAN with hundreds of links it halves what you spend on them.
</div>

---

## What goes wrong

**Client has 169.254.x.x.** No DHCP response. Check VLAN, `ip helper-address`, scope, server.

**Local works, remote does not.** Wrong mask, or no default gateway.

**`ping 8.8.8.8` works, names do not.** DNS, not the network.

**Overlapping subnets.** Two ranges defined with masks that include each other. Routing becomes unpredictable.

**Summary advertises more than you own.** Not on a valid boundary — check the shared bits.

**VLSM does not fit.** Largest subnet allocated last, so the space is fragmented.

**Duplicate address.** A static inside the DHCP scope. Exclude statics from the pool.

---

<div class="lab">
<div class="lab-head">Lab — get fast at this, then break it on purpose</div>
<div class="lab-body">

<div class="lab-target"><b>Target</b>
Get subnetting down to seconds rather than minutes with the block-size method. Design a VLSM plan that summarises, and prove it summarises. Then build the two faults that look like everything else: a wrong mask, and a client with no DHCP.</div>

**Setup.** Any lab with a router, a switch and two hosts. Plus `ipcalc` or `sipcalc` to check your arithmetic.

<p class="lab-step"><span class="n">1</span>Twenty in ten minutes</p>

For each of these, give network, first host, last host and broadcast — **on paper, then check**:

```text
172.16.45.200/26     10.8.130.77/21      192.168.7.19/29
10.0.0.5/30          172.20.99.250/27    192.168.100.190/28
```

<div class="lab-watch"><b>Things to notice</b>
Use the method every time: <b>block = 256 − mask octet; find the multiple below; broadcast is one less than the next.</b>
<br><br>For /21 the interesting octet is the <i>third</i> — block 8, so 130 falls in the 128 block, giving 10.8.128.0/21 with broadcast 10.8.135.255. <b>Same method, different octet</b>, which is the step that trips people.
<br><br>Check with <code>ipcalc</code>. <b>Time yourself.</b> Under thirty seconds each is the target, and it comes from repetition, not cleverness.</div>

<p class="lab-step"><span class="n">2</span>Design a plan that summarises</p>

You have **10.20.0.0/16** for four sites. Each needs: a 500-host user VLAN, a 200-host voice VLAN, a 50-host server VLAN, a 20-host management VLAN, and four point-to-point links.

<div class="lab-watch"><b>Things to notice</b>
Allocate the <b>largest first</b>, and give each site a contiguous block — 10.20.0.0/21, 10.20.8.0/21, and so on.
<br><br>Then verify the whole point: <b>every site's subnets must summarise into that single /21.</b> Write them in binary and count shared bits if you are unsure. Use <b>/31</b> for the point-to-point links and compare total consumption against /30.
<br><br>A plan that does not summarise is not finished, however neat it looks.</div>

<p class="lab-step"><span class="n">3</span>Configure it and check the router agrees</p>

```cisco
R1# show ip interface brief
R1# show ip route connected
```

<div class="lab-issues"><b>Possible issues</b>
<ul>
<li><b>"Bad mask"</b> — the address is a network or broadcast address, not a host.</li>
<li><b>"Overlaps with…"</b> — IOS refuses overlapping subnets on different interfaces, which is a genuinely useful guard rail.</li>
<li><b>Interface stays down</b> — the physical link, not the addressing.</li>
</ul>
<b>IOS will refuse to let you configure a network address on an interface</b>, and that error is a free check on your arithmetic. Try to configure 192.168.10.96/27 as a host address and read what it says.</div>

<p class="lab-step"><span class="n">4</span>Build the wrong-mask fault</p>

Configure a host with /16 on a /24 subnet. Ping something local, then something two routers away.

<div class="lab-watch"><b>Things to notice</b>
<b>Local pings work. Remote pings fail.</b> Check <code>arp -a</code> on the host and find an <b>incomplete ARP entry for the remote address</b> — the host believed it was a neighbour and asked the wire for it.
<br><br>Watch the gateway's interface counters: <b>no traffic for the remote destination ever arrives</b>, because the host never sent it there. <b>This is why it looks like a firewall problem</b>, and why checking the mask first is worth the ten seconds.</div>

<p class="lab-step"><span class="n">5</span>Take DHCP away</p>

Remove `ip helper-address` from the SVI, with the DHCP server on another subnet.

<div class="lab-watch"><b>Things to notice</b>
The client lands on <b>169.254.x.x</b>. Capture on the client's port and see <b>DHCP Discover broadcasts going out with nothing coming back</b> — the broadcast never left the VLAN.
<br><br>Add the helper address back and watch the DORA exchange complete. <b>You have now seen both sides of the most common "no network" ticket there is</b>, and 169.254 will mean "check the DHCP path" for ever afterwards.</div>

<p class="lab-step"><span class="n">6</span>Compare all three clients</p>

Run the verification commands on Windows, macOS and Linux for the same network.

<div class="lab-watch"><b>Things to notice</b>
Same four facts, three vocabularies. Note that macOS prints the mask in <b>hex</b> (<code>0xffffff00</code>) and Linux prints it as <b>CIDR</b> (<code>/24</code>) — both are 255.255.255.0.
<br><br>Then break DNS only, leaving routing intact. <b><code>ping 8.8.8.8</code> works, <code>ping google.com</code> does not.</b> That comparison is the fastest triage step you own, and it works identically on all three.</div>

<div class="lab-earned"><b>What you earned</b>
You can subnet in your head with three facts instead of a chart, including when the interesting octet is not the last one. You have designed an address plan that summarises and verified it in binary. You have seen IOS refuse a network address as a host address, which is a free arithmetic check. You have produced the wrong-mask fault where local works and remote does not, and found the incomplete ARP entry that proves it. And you can verify a client on any of the three operating systems and tell a DNS problem from a network problem in one comparison.</div>

</div>
</div>

---

## Test yourself

<div class="qz">
<p class="qz-q"><span class="qz-num">Q1</span>What is the broadcast address for 172.16.45.200/26?</p>
<label class="qz-opt"><input type="radio" name="pq1"><span>172.16.45.255</span><em class="qz-fb qz-good">Correct — block 64, so 200 falls in the 192 block, next subnet is 256 (i.e. .0 of the next), broadcast 255.</em></label>
<label class="qz-opt"><input type="radio" name="pq1"><span>172.16.45.192</span><em class="qz-fb qz-bad">That is the network address.</em></label>
<label class="qz-opt"><input type="radio" name="pq1"><span>172.16.45.254</span><em class="qz-fb qz-bad">That is the last usable host.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q2</span>Which are the RFC 1918 private ranges?</p>
<label class="qz-opt"><input type="radio" name="pq2"><span>10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16</span><em class="qz-fb qz-good">Correct. Note 172.16.0.0/12 is 172.16–172.31, not 172.16–172.16.</em></label>
<label class="qz-opt"><input type="radio" name="pq2"><span>10.0.0.0/8, 172.16.0.0/16, 192.168.0.0/24</span><em class="qz-fb qz-bad">The prefix lengths are wrong for both the second and third.</em></label>
<label class="qz-opt"><input type="radio" name="pq2"><span>10.0.0.0/8, 169.254.0.0/16, 192.168.0.0/16</span><em class="qz-fb qz-bad">169.254 is link-local (APIPA), not private-use.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q3</span>A client shows 169.254.88.201. What is wrong?</p>
<label class="qz-opt"><input type="radio" name="pq3"><span>No DHCP response — check VLAN, helper-address, scope and server</span><em class="qz-fb qz-good">Correct. It is a self-assigned link-local address, and renewing the lease cannot help.</em></label>
<label class="qz-opt"><input type="radio" name="pq3"><span>Wrong subnet mask</span><em class="qz-fb qz-bad">The mask is a consequence here, not the cause.</em></label>
<label class="qz-opt"><input type="radio" name="pq3"><span>DNS is misconfigured</span><em class="qz-fb qz-bad">The client has no address at all yet — DNS is much later.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q4</span>A host can reach its own subnet and nothing else. Its gateway is set correctly. What next?</p>
<label class="qz-opt"><input type="radio" name="pq4"><span>Check the subnet mask — a too-short mask makes remote addresses look local</span><em class="qz-fb qz-good">Correct. The host ARPs for them instead of using the gateway. Look for incomplete ARP entries.</em></label>
<label class="qz-opt"><input type="radio" name="pq4"><span>Check DNS</span><em class="qz-fb qz-bad">DNS would not stop a ping to a literal IP address.</em></label>
<label class="qz-opt"><input type="radio" name="pq4"><span>Restart the DHCP service</span><em class="qz-fb qz-bad">It already has a working address.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q5</span>What do 10.1.0.0/24 through 10.1.3.0/24 summarise to?</p>
<label class="qz-opt"><input type="radio" name="pq5"><span>10.1.0.0/22</span><em class="qz-fb qz-good">Correct — they share 22 leading bits, and the block starts on a valid /22 boundary.</em></label>
<label class="qz-opt"><input type="radio" name="pq5"><span>10.1.0.0/23</span><em class="qz-fb qz-bad">That covers only .0 and .1.</em></label>
<label class="qz-opt"><input type="radio" name="pq5"><span>10.1.0.0/21</span><em class="qz-fb qz-bad">That covers .0 through .7 — more than you own.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q6</span>Why can a /31 be used on a point-to-point link?</p>
<label class="qz-opt"><input type="radio" name="pq6"><span>RFC 3021 suspends the network/broadcast rule, giving two usable addresses from two</span><em class="qz-fb qz-good">Correct, and on a large WAN it halves the addressing compared with /30.</em></label>
<label class="qz-opt"><input type="radio" name="pq6"><span>Point-to-point links do not need addresses</span><em class="qz-fb qz-bad">Unnumbered is a separate option; /31 genuinely assigns two.</em></label>
<label class="qz-opt"><input type="radio" name="pq6"><span>The broadcast address is borrowed from the /30</span><em class="qz-fb qz-bad">There is no broadcast address at all — that is the point.</em></label>
</div>

---

## References

- **RFC 1918** — *Address Allocation for Private Internets*.
- **RFC 3021** — *Using 31-Bit Prefixes on IPv4 Point-to-Point Links*.
- **RFC 6598** — *IANA-Reserved IPv4 Prefix for Shared Address Space* (100.64.0.0/10).
- **RFC 3927** — *Dynamic Configuration of IPv4 Link-Local Addresses* (169.254.0.0/16).
- **RFC 4632** — *Classless Inter-domain Routing (CIDR)*.

---

*Related: [How a router chooses](/blog/how-a-router-chooses-routing-table-longest-match-and-ad) · [DHCP DORA](/blog/dhcp-dora-process-explained) · [IPv6 addressing](/blog/ipv6-addressing-types-eui64-and-ndp) · [NAT and PAT](/blog/nat-pat-explained-inside-outside-local-global).*

*Part of the [CCNA, ENCOR and ENARSI topic-by-topic study guide](/blog/ccna-ccnp-study-guide).*
