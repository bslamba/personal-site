---
title: "AAA: RADIUS, TACACS+ and Who Is Allowed to Type That Command"
excerpt: "RADIUS hides one attribute and leaves the rest in the clear; TACACS+ encrypts the whole body and separates authentication from authorization, which is why it can approve or refuse a single command. That difference decides which one belongs on your network devices and which belongs on your wireless."
date: "2026-09-20"
tags: ["AAA", "RADIUS", "TACACS+", "ISE", "Security", "CCNA", "ENCOR", "ENARSI"]
draft: false
---

> **Blueprint:** CCNA 200-301 — 5.8 *Compare authentication, authorization, and accounting concepts*. ENCOR 350-401 — 5.1 *Configure and verify device access control*. ENARSI 300-410 — 3.1 *Troubleshoot device security using IOS AAA (TACACS+, RADIUS, local database)*.

## Cheat sheet

| | RADIUS | TACACS+ |
|---|---|---|
| Transport | **UDP** 1812/1813 (legacy 1645/1646) | **TCP 49** |
| Encrypts | **Only the User-Password attribute** | **The entire body** |
| A, A, A | Authentication and authorization **combined** | **Separated** |
| Per-command authorization | No | **Yes** |
| Standard | RFC 2865 / 2866 | Cisco (RFC 8907, informational) |
| Multi-vendor | Everywhere | Mostly Cisco |
| Use it for | **Network access** — 802.1X, VPN, wireless | **Device administration** — who may type what |

| | |
|---|---|
| **Authentication** | Who are you? |
| **Authorization** | What may you do? |
| **Accounting** | What did you do, and when? |
| **Method list** | An ordered list of ways to try. **Always end with `local`** |
| **The golden rule** | Open a second session and test before you close the first |

**The sentence that decides the design.** RADIUS bundles authorization into the authentication reply, so the server's answer is "yes, and here is your privilege level" — one decision, at login. TACACS+ keeps them separate, so the device can ask the server about **every single command** as it is typed. That is why device administration runs on TACACS+ and network access runs on RADIUS, and it is not a matter of taste.

---

## Device access control, one by one

Controlling who can log in to a device and what they may do has two layers: a local fallback that always works, and centralised AAA for everything normal. The blueprint names both.

### Lines and local user authentication

A device is reached through **lines**: the **console** (physical), the **aux** port, and the **vty** lines (remote — SSH). Each line decides how a login is authenticated. **Local user authentication** means the device checks credentials against its own `username … secret` database.

- **Beginner:** the console is the cable you plug in; vty lines are SSH sessions; a local user is an account stored on the device itself.
- **Working knowledge:** harden the vty lines with `transport input ssh` (never Telnet), an `access-class` ACL limiting who can even connect, and `exec-timeout`. Store users with `algorithm-type scrypt secret` (type 9), never type 7.
- **Pro:** a **local break-glass account is mandatory before you enable AAA**, and `local` belongs at the end of every method list — otherwise an unreachable AAA server locks everyone out, including on the console. This is the single most common self-inflicted lockout. See [Configuration, word by word](#configuration-word-by-word).

### Authentication and authorization using AAA

**AAA** centralises the three questions: **authentication** (who are you), **authorization** (what may you do), **accounting** (what did you do). It runs over **RADIUS** or **TACACS+**, with a method list that tries the server first and falls back to `local`.

- **Beginner:** instead of accounts on every device, everyone authenticates against a central server (ISE).
- **Working knowledge:** for **device administration** use **TACACS+** — it separates authorization from authentication, so it can approve or deny **individual commands**. For **network access** (802.1X, VPN, wireless) use **RADIUS**.
- **Pro:** the failure that looks impossible — the server logs a success while the device rejects the login — is a **shared-secret mismatch**: the reply fails its authenticator check and is silently dropped. And a *reject* from a reachable server is final; the fall-through to `local` happens only on **no response**. Both are covered in depth in the sections below.

---

## The three A's are genuinely three things

<figure class="fig">
<svg class="sv1" viewBox="0 0 640 235" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Authentication authorization and accounting are three separate questions answered at different times">
  <style>.sv1 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv1 .k{font-family:ui-sans-serif,system-ui;font-size:12px;font-weight:700}.sv1 .m{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;fill:#17171A}.sv1 .b1{fill:rgba(75,123,236,.14);stroke:#4b7bec}.sv1 .b2{fill:rgba(31,157,107,.14);stroke:#1f9d6b}.sv1 .b3{fill:#F1EEE9;stroke:#B5B5BC}
  </style>
  <rect class="b1" x="14" y="30" width="196" height="76"/>
  <text class="k" x="30" y="54" fill="#2f5fd0">Authentication</text>
  <text class="s" x="30" y="74">Who are you?</text>
  <text class="m" x="30" y="94">username + password</text>
  <rect class="b2" x="222" y="30" width="196" height="76"/>
  <text class="k" x="238" y="54" fill="#0f6b47">Authorization</text>
  <text class="s" x="238" y="74">What may you do?</text>
  <text class="m" x="238" y="94">priv-lvl, command sets</text>
  <rect class="b3" x="430" y="30" width="196" height="76"/>
  <text class="k" x="446" y="54">Accounting</text>
  <text class="s" x="446" y="74">What did you do?</text>
  <text class="m" x="446" y="94">start / stop records</text>
  <rect x="14" y="126" width="612" height="44" fill="rgba(75,123,236,.08)" stroke="#4b7bec"/>
  <text class="k" x="26" y="146" fill="#2f5fd0">RADIUS answers the first two in one reply, at login. Once.</text>
  <text class="s" x="26" y="162">The Access-Accept carries the privilege level with it. Nothing is asked again afterwards.</text>
  <rect x="14" y="182" width="612" height="44" fill="rgba(31,157,107,.10)" stroke="#1f9d6b"/>
  <text class="k" x="26" y="202" fill="#0f6b47">TACACS+ can ask again for every command typed.</text>
  <text class="s" x="26" y="218">Separate exchanges mean separate decisions — which is the entire reason it exists.</text>
</svg>
<figcaption><b>Figure 1.</b> Three questions. The protocols differ mainly in <em>how often</em> the second one gets asked.</figcaption>
</figure>

<div class="why">
<b>Accounting is the one people skip, and the one auditors ask for</b>
Authentication and authorization decide what happens. <b>Accounting is the only one that survives the event.</b> Without <code>aaa accounting commands 15</code>, you can prove who logged in and nothing about what they did once they were there.
<br><br>It is also the cheapest of the three to turn on and the hardest to add retrospectively, because the thing you want is always a record of something that already happened.
</div>

---

## What is actually on the wire

<div class="walk">
<div class="walk-head">RADIUS and TACACS+, byte by byte <span class="walk-hint">click a step</span></div>
<div class="walk-tabs">
  <input type="radio" name="aaw" id="aa1" checked><label for="aa1"><span class="step-n">1</span>Access-Request</label>
  <input type="radio" name="aaw" id="aa2"><label for="aa2"><span class="step-n">2</span>What is hidden</label>
  <input type="radio" name="aaw" id="aa3"><label for="aa3"><span class="step-n">3</span>Access-Accept</label>
  <input type="radio" name="aaw" id="aa4"><label for="aa4"><span class="step-n">4</span>TACACS+</label>
</div>
<div class="walk-panels">
<div class="walk-panel">
<svg class="sv2" viewBox="0 0 640 185" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A RADIUS access request carries a code identifier length and a sixteen byte request authenticator followed by attributes">
  <style>.sv2 .f{fill:#F1EEE9;stroke:#B5B5BC}.sv2 .hl{fill:rgba(75,123,236,.16);stroke:#4b7bec}.sv2 .m{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;fill:#17171A}.sv2 .s{font-family:ui-sans-serif,system-ui;font-size:10px;fill:#5C5C64}.sv2 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}</style>
  <rect class="hl" x="14" y="32" width="78" height="32"/><text class="m" x="53" y="53" text-anchor="middle">01</text>
  <rect class="f" x="96" y="32" width="78" height="32"/><text class="m" x="135" y="53" text-anchor="middle">2b</text>
  <rect class="f" x="178" y="32" width="90" height="32"/><text class="m" x="223" y="53" text-anchor="middle">00 4c</text>
  <rect class="hl" x="272" y="32" width="180" height="32"/><text class="m" x="362" y="53" text-anchor="middle">Request Authenticator</text>
  <rect class="f" x="456" y="32" width="170" height="32"/><text class="m" x="541" y="53" text-anchor="middle">attributes …</text>
  <text class="s" x="53" y="80" text-anchor="middle">code 1</text>
  <text class="s" x="135" y="80" text-anchor="middle">id 43</text>
  <text class="s" x="223" y="80" text-anchor="middle">76 bytes</text>
  <text class="s" x="362" y="80" text-anchor="middle">16 random bytes</text>
  <text class="s" x="541" y="80" text-anchor="middle">type/len/value</text>
  <text class="k" x="14" y="116">The Request Authenticator is random — and it is the seed for everything else.</text>
  <text class="s" x="14" y="140">It is what makes the password hiding different on every request, and it is what the server must</text>
  <text class="s" x="14" y="156">echo back into the Response Authenticator to prove it knows the shared secret.</text>
  <text class="s" x="14" y="178">Codes: 1 Access-Request · 2 Access-Accept · 3 Access-Reject · 11 Access-Challenge</text>
</svg>
<p class="walk-say"><span class="walk-title">Four fixed fields, then attributes</span>
Code, identifier, length, then <b>16 random bytes of Request Authenticator</b>, then a list of type/length/value attributes: User-Name, User-Password, NAS-IP-Address, NAS-Port, Service-Type.
<br><br>The identifier is how replies are matched to requests, and it is only <b>one byte</b> — 256 outstanding requests per source port and it wraps. On a busy NAS that is a real limit, which is why you will see a device source from several ports at once.</p>
</div>
<div class="walk-panel">
<svg class="sv3" viewBox="0 0 640 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Only the user password attribute is obscured everything else in a RADIUS packet is readable">
  <style>.sv3 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv3 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv3 .m{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;fill:#17171A}.sv3 .cl{fill:rgba(211,0,45,.10);stroke:#D3002D}.sv3 .en{fill:rgba(31,157,107,.16);stroke:#1f9d6b}</style>
  <rect class="cl" x="14" y="30" width="298" height="26"/><text class="m" x="24" y="48">User-Name = bhawneet</text>
  <rect class="en" x="14" y="60" width="298" height="26"/><text class="m" x="24" y="78">User-Password = 29 5e d6 eb …</text>
  <rect class="cl" x="14" y="90" width="298" height="26"/><text class="m" x="24" y="108">NAS-IP-Address = 10.0.0.1</text>
  <rect class="cl" x="14" y="120" width="298" height="26"/><text class="m" x="24" y="138">NAS-Identifier = R1</text>
  <text class="k" x="330" y="48" fill="#B80027">readable</text>
  <text class="k" x="330" y="78" fill="#0f6b47">obscured</text>
  <text class="k" x="330" y="108" fill="#B80027">readable</text>
  <text class="k" x="330" y="138" fill="#B80027">readable</text>
  <text class="k" x="14" y="172" fill="#B80027">The username, the device, the ports, the VLAN — all in the clear.</text>
  <text class="s" x="14" y="192">And the &#8220;encryption&#8221; is an MD5 keystream XOR, not a cipher. Treat RADIUS as needing a protected path.</text>
</svg>
<p class="walk-say"><span class="walk-title">One attribute, and not with a cipher</span>
RADIUS hides <b>User-Password only</b>. The method is <code>MD5(secret + Request Authenticator)</code> XORed with the password — a keystream, not encryption. Everything else, including the username and every attribute the reply carries back, is plain text on the wire.
<br><br>Two practical consequences. <b>Anyone who captures the traffic learns your usernames, your NAS addresses and your assigned VLANs.</b> And offline attack against the shared secret is feasible, so the secret needs to be long and random — not the device hostname, which is what it usually is.</p>
</div>
<div class="walk-panel">
<svg class="sv4" viewBox="0 0 640 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The response authenticator is an MD5 hash over the reply plus the original request authenticator plus the shared secret">
  <style>.sv4 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv4 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv4 .m{font-family:ui-monospace,Menlo,monospace;font-size:10px;fill:#17171A}.sv4 .f{fill:#F1EEE9;stroke:#B5B5BC}.sv4 .hl{fill:rgba(31,157,107,.16);stroke:#1f9d6b}</style>
  <rect class="f" x="14" y="30" width="112" height="28"/><text class="m" x="70" y="49" text-anchor="middle">code+id+len</text>
  <rect class="f" x="130" y="30" width="150" height="28"/><text class="m" x="205" y="49" text-anchor="middle">REQUEST authenticator</text>
  <rect class="f" x="284" y="30" width="122" height="28"/><text class="m" x="345" y="49" text-anchor="middle">attributes</text>
  <rect class="hl" x="410" y="30" width="122" height="28"/><text class="m" x="471" y="49" text-anchor="middle">shared secret</text>
  <path d="M 273 66 L 273 88" stroke="#8A8A93" stroke-width="1.5"/>
  <path d="M 267 82 L 273 92 L 279 82 z" fill="#8A8A93"/>
  <text class="k" x="290" y="86">MD5</text>
  <rect class="hl" x="180" y="100" width="280" height="28"/><text class="m" x="320" y="119" text-anchor="middle">b8 a7 0a 36 fe 32 ce 90 …</text>
  <text class="s" x="320" y="146" text-anchor="middle">the Response Authenticator</text>
  <text class="k" x="14" y="176">The client recomputes this. If it does not match, the reply is silently discarded.</text>
  <text class="s" x="14" y="194">A mismatched shared secret therefore looks exactly like a server that is not answering at all.</text>
</svg>
<p class="walk-say"><span class="walk-title">How the reply proves itself</span>
The Access-Accept's authenticator is <code>MD5(code + id + length + <b>the request's</b> authenticator + attributes + shared secret)</code>. The NAS recomputes it and <b>silently drops the packet if it does not match</b>.
<br><br>That silent drop is the single most confusing RADIUS symptom. Get the shared secret wrong on one side and the server logs a successful authentication while the switch reports no response and fails over to the next method. Both ends are telling the truth and they disagree completely.
<br><br>The Accept here also carries <code>Service-Type = Administrative</code> and a Cisco AV-pair, <code>shell:priv-lvl=15</code> — <b>that is authorization, delivered inside the authentication reply.</b> One decision, at login.</p>
</div>
<div class="walk-panel">
<svg class="sv5" viewBox="0 0 640 205" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="TACACS plus sends a twelve byte cleartext header followed by a fully obfuscated body over TCP port 49">
  <style>.sv5 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv5 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv5 .m{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;fill:#17171A}.sv5 .f{fill:#F1EEE9;stroke:#B5B5BC}.sv5 .en{fill:rgba(31,157,107,.18);stroke:#1f9d6b}</style>
  <rect class="f" x="14" y="32" width="230" height="30"/><text class="m" x="129" y="52" text-anchor="middle">12-byte header — clear</text>
  <rect class="en" x="248" y="32" width="378" height="30"/><text class="m" x="437" y="52" text-anchor="middle">body — entirely obfuscated</text>
  <text class="s" x="129" y="78" text-anchor="middle">version, type, seq, flags, session id, length</text>
  <text class="s" x="437" y="78" text-anchor="middle">username, port, remote address, the command itself</text>
  <rect x="14" y="98" width="612" height="40" fill="rgba(31,157,107,.10)" stroke="#1f9d6b"/>
  <text class="k" x="26" y="118" fill="#0f6b47">A capture shows you that AAA happened, and nothing about what was asked.</text>
  <text class="s" x="26" y="133">Compare with RADIUS, where the username and every attribute are readable.</text>
  <text class="k" x="14" y="164">TCP 49, so a dead server is refused or reset — not waited for.</text>
  <text class="s" x="14" y="186">RADIUS over UDP has to time out and retry. This is also why TACACS+ notices a dead server faster.</text>
</svg>
<p class="walk-say"><span class="walk-title">Header in the clear, body hidden</span>
TACACS+ leaves a <b>12-byte header</b> readable — version, packet type, sequence number, flags, session ID and body length — and obfuscates <b>everything else</b> with an MD5 keystream derived from the session ID, the key, the version and the sequence number.
<br><br>So the body containing the username, the port, and <b>the command being authorized</b> is not visible. That is the security argument, though note the mechanism is still MD5-based, not a modern cipher — the protocol's own RFC says as much.
<br><br>Because it runs over <b>TCP</b>, a dead server produces a refused connection rather than a timeout, and the sequence number lets the server run a real conversation: ask for a username, then ask for a password, then ask again about each command.</p>
</div>
</div>
</div>

---

## The captures

<div class="cap">
<div class="cap-head">Capture · radius.pcap <span class="cap-filter">udp.port == 1812</span></div>
<table class="cap-list">
<thead><tr><th>No.</th><th>Source</th><th>Destination</th><th>Proto</th><th>Len</th><th>Info</th></tr></thead>
<tbody>
<tr><td>1</td><td>10.0.0.1</td><td>10.0.0.80</td><td>RADIUS</td><td>104</td><td>Access-Request id=43</td></tr>
<tr><td>2</td><td>10.0.0.80</td><td>10.0.0.1</td><td>RADIUS</td><td>79</td><td>Access-Accept id=43</td></tr>
</tbody>
</table>
<div class="cap-hex"><pre>Access-Request
0020  <mark>01</mark> <mark>2b</mark> <mark>00 4c</mark> 5a 1f 3c 9e  7b 02 d4 48 6a f1 c3 5d   .+.L Z.&lt;.{..Hj..]
0030  8e 09 7b 24 <mark>01 0a</mark> 62 68  61 77 6e 65 65 74 <mark>02 12</mark>   ..{$..<mark>bhawneet</mark>..
0040  29 5e d6 eb 83 73 df 81  f3 c2 23 41 98 a9 9d 99   )^...s....#A....
0050  04 06 0a 00 00 01 05 06  00 00 00 05 3d 06 00 00   ............=...
0060  00 05 06 06 00 00 00 01  20 04 52 31               ........ .R1

Access-Accept
0020  <mark>02</mark> <mark>2b</mark> <mark>00 33</mark> b8 a7 0a 36  fe 32 ce 90 86 e4 0f 43   .+.3...6.2.....C
0030  e2 65 e1 f3 06 06 00 00  00 06 1a 19 00 00 00 09   .e..............
0040  01 13 73 68 65 6c 6c 3a  70 72 69 76 2d 6c 76 6c   ..<mark>shell:priv-lvl</mark>
0050  3d 31 35                                           <mark>=15</mark></pre></div>
<div class="cap-note">
<b>01</b> = Access-Request, <b>2b</b> = identifier 43, <b>00 4c</b> = 76 bytes. Then <b>01 0a</b> — attribute type 1 (User-Name), length 10 — and <code>bhawneet</code> <b>sits there in ASCII</b>. Next <b>02 12</b> is User-Password, 18 bytes, and those <i>are</i> obscured.<br>
The reply: <b>02</b> Access-Accept, same identifier 43, then the 16-byte Response Authenticator computed over the request's authenticator plus the shared secret. Attribute <b>06 06 … 06</b> is Service-Type = Administrative, and <b>1a</b> (26) is a Vendor-Specific attribute — vendor 9 (Cisco), AV-pair <code>shell:priv-lvl=15</code>.<br>
<b>Read that last line again: the privilege level arrived as text inside the authentication reply.</b> That is RADIUS doing authorization, and it is why it cannot do it per command.
</div>
</div>

<div class="cap">
<div class="cap-head">Capture · tacacs.pcap <span class="cap-filter">tcp.port == 49</span></div>
<div class="cap-hex"><pre>0000  <mark>c0</mark> <mark>01</mark> <mark>01</mark> <mark>00</mark> <mark>6d 3a 91 c4</mark>  <mark>00 00 00 1a</mark> 74 76 5d 02   ....m:......tv].
0010  f1 f5 e1 6b 18 e1 ba a7  34 67 48 6f 67 e8 90 2f   ...k....4gHog../
0020  1c 28 e0 d4 31 5f                                  .(..1_</pre></div>
<div class="cap-note">
<b>c0</b> = version, major 12 minor 0 · <b>01</b> = AUTHEN · <b>01</b> = sequence 1 · <b>00</b> = flags, and a zero here means <b>the body is obfuscated</b> (bit 0 set would mean unencrypted — worth checking, because some lab configs set it). <b>6d 3a 91 c4</b> = session ID · <b>00 00 00 1a</b> = body length 26.<br>
Everything from offset 12 onward is the obfuscated body. Decoded with the key it reads: action LOGIN, priv_lvl 15, type ASCII, service LOGIN, user <code>bhawneet</code>, remote address <code>10.1.10.50</code>.<br>
<b>In the capture, none of that is visible.</b> Twelve readable bytes tell you a TACACS+ authentication is in progress and nothing else — which is exactly the point.
</div>
</div>

---

## Configuration, word by word

<div class="cmd">
<div class="cmd-line"><span class="t">aaa new-model</span>
!
<span class="t">tacacs server</span> <span class="opt">ISE-1</span>
 <span class="t">address ipv4</span> <span class="opt">10.0.0.81</span>
 <span class="t">key</span> <span class="opt">T4c4cs-K3y!</span>
 <span class="t">timeout</span> <span class="opt">3</span>
!
<span class="t">aaa group server tacacs+</span> <span class="opt">TAC-GRP</span>
 <span class="t">server name</span> <span class="opt">ISE-1</span>
 <span class="t">ip tacacs source-interface</span> <span class="opt">Loopback0</span>
!
<span class="t">aaa authentication login</span> <span class="opt">default</span> <span class="t">group</span> <span class="opt">TAC-GRP</span> <span class="t">local</span>
<span class="t">aaa authentication enable</span> <span class="opt">default</span> <span class="t">group</span> <span class="opt">TAC-GRP</span> <span class="t">enable</span>
<span class="t">aaa authorization exec</span> <span class="opt">default</span> <span class="t">group</span> <span class="opt">TAC-GRP</span> <span class="t">local</span> <span class="t">if-authenticated</span>
<span class="t">aaa authorization commands 15</span> <span class="opt">default</span> <span class="t">group</span> <span class="opt">TAC-GRP</span> <span class="t">local</span>
<span class="t">aaa accounting commands 15</span> <span class="opt">default</span> <span class="t">start-stop group</span> <span class="opt">TAC-GRP</span>
!
<span class="t">username</span> <span class="opt">breakglass</span> <span class="t">privilege</span> <span class="opt">15</span> <span class="t">algorithm-type scrypt secret</span> <span class="opt">&lt;strong&gt;</span></div>
<dl class="cmd-parts">
<div class="is-key"><dt>aaa new-model</dt><dd><b>Changes the device's behaviour the instant you type it.</b> Line passwords stop being consulted the way they were and the default method lists take over. On a device you are connected to remotely, enter this only with a second session already open and a local user already configured. It has locked out more people than any other single command in IOS.</dd></div>
<div><dt>tacacs server … key</dt><dd>The key must match the server exactly. A mismatch is not reported as a mismatch — you get failed authentication with nothing useful in the logs until you turn on <code>debug tacacs</code>.</dd></div>
<div class="is-key"><dt>ip tacacs source-interface</dt><dd><b>The server identifies the device by its source address.</b> Let it float with the outgoing interface and the server sees an unknown NAS and rejects it — intermittently, depending on routing. Pin it to a loopback that the server has configured as a network device.</dd></div>
<div class="is-key"><dt>… group TAC-GRP <b>local</b></dt><dd><b>The fallback, and the reason you can still get in when the server is unreachable.</b> Methods are tried in order and the next is used only when the previous <i>does not respond</i> — not when it says no. A reject from a reachable server is final; it does not fall through to <code>local</code>. That distinction is the single most misunderstood thing about method lists.</dd></div>
<div><dt>authorization exec … <br>if-authenticated</dt><dd>Decides whether you get a shell at all and at what privilege level. <code>if-authenticated</code> at the end means "if the server is dead but you proved who you are, let them in" — without it, a dead server can authenticate you and then refuse you a prompt, which is a confusing half-locked-out state.</dd></div>
<div class="is-key"><dt>authorization commands 15</dt><dd><b>This is the line RADIUS cannot do.</b> Every level-15 command is sent to the server for approval before it runs. It is also the line that makes a slow or flapping TACACS+ server feel like a broken router, because each command waits for a round trip.</dd></div>
<div><dt>accounting commands 15 <br>start-stop</dt><dd>The audit trail. <code>start-stop</code> logs at both ends so a command that hangs is still recorded as attempted. This is what answers "who changed that at 2am".</dd></div>
<div class="is-key"><dt>username breakglass</dt><dd><b>Configure this before <code>aaa new-model</code>, not after.</b> Without a local account, <code>local</code> in the method list falls back to nothing and an unreachable server means nobody can log in — including you, including on console. <code>algorithm-type scrypt</code> stores it as a proper hash rather than the reversible type 7.</dd></div>
</dl>
</div>

<div class="cmd">
<div class="cmd-line"><span class="opt">! SSH, and what actually makes it work</span>
<span class="t">hostname</span> <span class="opt">R1</span>
<span class="t">ip domain name</span> <span class="opt">lab.local</span>
<span class="t">crypto key generate rsa modulus</span> <span class="opt">2048</span>
<span class="t">ip ssh version</span> <span class="opt">2</span>
!
<span class="t">line vty</span> <span class="opt">0 15</span>
 <span class="t">transport input ssh</span>
 <span class="t">exec-timeout</span> <span class="opt">10 0</span>
 <span class="t">login authentication</span> <span class="opt">default</span>
!
<span class="t">service password-encryption</span>
<span class="t">security passwords min-length</span> <span class="opt">10</span>
<span class="t">login block-for</span> <span class="opt">120</span> <span class="t">attempts</span> <span class="opt">4</span> <span class="t">within</span> <span class="opt">60</span></div>
<dl class="cmd-parts">
<div class="is-key"><dt>hostname + ip domain name<br>before the key</dt><dd><b>Order matters.</b> The RSA key is named <code>hostname.domain</code>, so generating it first and renaming the device afterwards leaves a key that no longer matches and SSH stops working. Set both, then generate.</dd></div>
<div><dt>modulus 2048</dt><dd>Below 768 the device refuses SSHv2 outright. 2048 is the sensible floor now.</dd></div>
<div class="is-key"><dt>transport input ssh</dt><dd><b>The line that actually disables Telnet.</b> Configuring SSH does not remove Telnet — the default on many images is <code>transport input all</code>, so the device happily accepts plaintext logins alongside your new SSH. Setting this explicitly is the difference between "SSH is configured" and "Telnet is off".</dd></div>
<div><dt>exec-timeout 10 0</dt><dd>Ten minutes. The default on vty is 10 minutes too, but <code>exec-timeout 0 0</code> — never time out — appears in an enormous number of production configs, usually copied from a lab.</dd></div>
<div><dt>service password-encryption</dt><dd><b>Type 7, and type 7 is reversible in a browser.</b> It stops shoulder-surfing and nothing else. It is not a substitute for <code>secret</code>, which is hashed.</dd></div>
<div class="is-key"><dt>login block-for 120<br>attempts 4 within 60</dt><dd>Four failures in a minute and the device refuses all login attempts for two minutes. <b>This is the cheapest anti-brute-force control IOS has</b> and almost nobody configures it. Pair it with an ACL under <code>access-class</code> on the vty lines so only management subnets can reach them at all.</dd></div>
</dl>
</div>

---

## Reading it

<div class="term">
<div class="term-bar"><span class="term-dots"><i></i><i></i><i></i></span>R1 — the debug that ends the argument</div>
<pre><span class="p">R1#</span> <span class="c">show aaa servers</span>
TACACS+: id 1, priority 0, host 10.0.0.81, auth-port 49
     State: current <span class="g">UP</span>, duration 41021s, previous duration 0s
     Authen: request 1842, timeouts 3, failover 0, retransmission 3
             Response: accept 1798, <span class="r">reject 41</span>, error 0
     Author: request 9914, timeouts 0
             Response: accept 9902, <span class="r">reject 12</span>

<span class="o">! "reject" is the server saying no. "timeouts" is the server not answering.</span>
<span class="o">! They are completely different faults and the fix for one never fixes the other.</span>

<span class="p">R1#</span> <span class="c">test aaa group TAC-GRP bhawneet Str0ngPass new-code</span>
<span class="g">User successfully authenticated</span>

<span class="p">R1#</span> <span class="c">debug tacacs</span>
TPLUS: Queuing AAA Authentication request 7 for processing
TPLUS: processing authentication start request id 7
TPLUS: Authentication start packet created for 7(bhawneet)
TPLUS: Waiting for reply
<span class="r">TPLUS: reply has invalid auth</span>                <span class="o">&lt;- the shared key does not match</span>

<span class="p">R1#</span> <span class="c">show aaa sessions</span>
Total sessions since last reload: 84
Session Id: 79
   Unique Id: 4b1
   User Name: bhawneet
   IP Address: 10.1.10.50
   Idle Time: 0
   CT Call Handle: 0<span class="cur"></span></pre>
</div>
<p class="term-cap"><b><code>test aaa group</code> is the command to reach for first.</b> It exercises the whole path — source interface, reachability, shared key, server policy — without you risking your own session. Run it before you change a method list, not after.</p>

<div class="real">
<b>In the real world</b>
The classic outage is not a security failure. It is <b>a method list with no local fallback and a server that became unreachable</b> — usually because someone changed routing, or the source interface moved, or a firewall rule was tightened. Every device on the network simultaneously stops accepting logins, including console, and the fix requires physical access and password recovery on each one.
<br><br>The habit that prevents it costs nothing: a local break-glass account created <b>before</b> AAA, <code>local</code> at the end of every method list, and a second session held open while you test. The people who have done this once never skip it again.
</div>

---

## What goes wrong

**Authentication fails, server logs show success.** Shared secret mismatch — the reply fails its authenticator check and is silently dropped.

**Works from one device, not another.** Source interface not pinned, so the server sees an unknown NAS address.

**Server reachable but user rejected, no fallback to local.** Working as designed. Fallback happens on *no response*, not on rejection.

**Locked out after `aaa new-model`.** No local user existed. This is why you create it first.

**Every command is slow.** `aaa authorization commands 15` with a distant or loaded server — each command waits for a round trip.

**Telnet still works after configuring SSH.** `transport input` was never restricted.

**SSH breaks after a rename.** The RSA key is tied to `hostname.domain`. Regenerate it.

---

<div class="lab">
<div class="lab-head">Lab — configure AAA, lock yourself out, and get back in</div>
<div class="lab-body">

<div class="lab-target"><b>Target</b>
Build TACACS+ authentication with a proper local fallback, then prove the fallback works by killing the server. Then deliberately build the version without a fallback and experience the lockout in a controlled way. Capture both protocols and see for yourself what is readable in each. Finish with per-command authorization and an accounting trail.</div>

**Topology.** R1 plus a TACACS+ server — Cisco ISE if you have it, or `tac_plus` on a Linux box, which is entirely adequate for this. A second Linux box for RADIUS (`freeradius`) so you can compare. **Keep a console session open throughout.**

<p class="lab-step"><span class="n">1</span>Create the escape route first</p>

```cisco
username breakglass privilege 15 algorithm-type scrypt secret <choose one>
```

<div class="lab-watch"><b>Things to notice</b>
Do this <b>before</b> <code>aaa new-model</code>. Check <code>show run | include username</code> and confirm it stored a <code>$9$</code> hash rather than a type 7 string.
<br><br>Then open a <b>second session</b> and leave it logged in. Everything after this step is safe only because of these two things.</div>

<p class="lab-step"><span class="n">2</span>Turn on AAA and watch the behaviour change</p>

```cisco
aaa new-model
aaa authentication login default group TAC-GRP local
```

<div class="lab-watch"><b>Things to notice</b>
Before you configure any server, try logging in from a third session. It falls through to <code>local</code> and your break-glass account works. <b>That is the fallback doing its job with no server present at all.</b>
<br><br>Now run <code>test aaa group TAC-GRP breakglass <password> new-code</code> and watch it fail — the group has no reachable server yet. Note that the failure mode is a <i>timeout</i>, not a rejection.</div>

<p class="lab-step"><span class="n">3</span>Point it at the server and capture both protocols</p>

Configure the TACACS+ server and key, then capture on the path with `tcpdump -i any -w aaa.pcap 'tcp port 49 or udp port 1812'`.

<div class="lab-watch"><b>Things to notice</b>
Log in over TACACS+, then switch the method list to RADIUS and log in again. Open both in Wireshark side by side.
<br><br>In the RADIUS packet, <b>find your username in ASCII</b>. In the TACACS+ packet, confirm you cannot — twelve bytes of header and then nothing readable. Then set the TACACS+ unencrypted flag in a lab config and capture again: <b>the whole body appears in plain text</b>, which shows you exactly what the obfuscation is buying.</div>

<p class="lab-step"><span class="n">4</span>Break the shared key on purpose</p>

Change the key on the router only, then try to log in.

<div class="lab-issues"><b>Possible issues</b>
<ul>
<li><b>Nothing useful in the logs</b> — expected. Run <code>debug tacacs</code> and look for <code>reply has invalid auth</code>.</li>
<li><b>The server shows a successful authentication</b> — also expected, and the point of the exercise. The server answered; the router rejected the answer.</li>
<li><b>You cannot log in at all</b> — use the session you left open. If you did not leave one open, use the console.</li>
</ul>
<b>Both ends are reporting the truth and they completely disagree.</b> Remember this shape — you will meet it again on a production device with someone watching.</div>

<p class="lab-step"><span class="n">5</span>Remove the fallback and feel it</p>

Fix the key. Then change the method list to `aaa authentication login default group TAC-GRP` — **no `local`** — and stop the TACACS+ daemon.

<div class="lab-watch"><b>Things to notice</b>
New logins fail on <b>every line, including console</b>. Your existing session still works, which is the only reason this is recoverable. Put <code>local</code> back from that session and watch logins start working again immediately.
<br><br><b>Now imagine this on fifty devices at once</b>, pushed by a template, with no session held open. That is the real outage, and you have just built a miniature of it deliberately so you never build it accidentally.</div>

<p class="lab-step"><span class="n">6</span>Per-command authorization and the audit trail</p>

```cisco
aaa authorization commands 15 default group TAC-GRP local
aaa accounting commands 15 default start-stop group TAC-GRP
```

On the server, permit `show` commands for a test user and deny `configure terminal`.

<div class="lab-watch"><b>Things to notice</b>
Log in as that user. <code>show ip interface brief</code> works; <code>configure terminal</code> is refused with <b>"Command authorization failed"</b> — and the refusal came from the server, not the router. <b>RADIUS cannot do this</b>, because its one authorization decision was made at login.
<br><br>Watch the server's accounting log fill up as you type. Then time a few commands with the server reachable and again with it heavily delayed (`tc qdisc add dev eth0 root netem delay 400ms`) — <b>every command now waits for a round trip</b>, which is how per-command authorization makes a healthy router feel broken.</div>

<div class="lab-earned"><b>What you earned</b>
You have a working AAA configuration with a fallback you have actually tested rather than assumed. You know the difference between a timeout and a reject, and that only one of them falls through to the next method. You have seen your own username in plain text in a RADIUS capture and seen nothing at all in a TACACS+ one. You have produced the shared-key failure where both ends report success and failure simultaneously. You have locked yourself out under controlled conditions and recovered. And you have watched per-command authorization refuse a command and then make every command slow — the cost that comes with the capability.</div>

</div>
</div>

---

## Test yourself

<div class="qz">
<p class="qz-q"><span class="qz-num">Q1</span>Which part of a RADIUS Access-Request is obscured?</p>
<label class="qz-opt"><input type="radio" name="aq1"><span>Only the User-Password attribute</span><em class="qz-fb qz-good">Correct — username, NAS address, assigned VLAN and everything else are plain text on the wire.</em></label>
<label class="qz-opt"><input type="radio" name="aq1"><span>The entire packet</span><em class="qz-fb qz-bad">That is TACACS+, and even there the 12-byte header stays readable.</em></label>
<label class="qz-opt"><input type="radio" name="aq1"><span>All attributes but not the header</span><em class="qz-fb qz-bad">Only attribute type 2 is hidden.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q2</span>Why can TACACS+ do per-command authorization when RADIUS cannot?</p>
<label class="qz-opt"><input type="radio" name="aq2"><span>It separates authentication from authorization, so it can hold a separate exchange per command</span><em class="qz-fb qz-good">Correct. RADIUS delivers its one authorization decision inside the Access-Accept, at login, and never asks again.</em></label>
<label class="qz-opt"><input type="radio" name="aq2"><span>Because it uses TCP</span><em class="qz-fb qz-bad">TCP helps with reliability and dead-server detection, but the separation of A from A is the reason.</em></label>
<label class="qz-opt"><input type="radio" name="aq2"><span>Because it encrypts the body</span><em class="qz-fb qz-bad">Encryption protects the exchange; it does not create the extra decision points.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q3</span>In <code>aaa authentication login default group TAC-GRP local</code>, when is <code>local</code> used?</p>
<label class="qz-opt"><input type="radio" name="aq3"><span>Only when the TACACS+ server does not respond — not when it rejects the user</span><em class="qz-fb qz-good">Correct, and this is the most misunderstood thing about method lists. A reject from a reachable server is final.</em></label>
<label class="qz-opt"><input type="radio" name="aq3"><span>Whenever TACACS+ authentication fails for any reason</span><em class="qz-fb qz-bad">A rejection is a successful exchange with a negative answer. No fallback.</em></label>
<label class="qz-opt"><input type="radio" name="aq3"><span>Only on the console line</span><em class="qz-fb qz-bad">The list applies wherever it is assigned; the console is not special here.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q4</span>Authentication fails on the router while the server logs show it succeeded. Most likely cause?</p>
<label class="qz-opt"><input type="radio" name="aq4"><span>Shared secret mismatch — the reply fails its authenticator check and is silently discarded</span><em class="qz-fb qz-good">Correct. Both ends report honestly and disagree completely. <code>debug tacacs</code> or <code>debug radius</code> shows the invalid auth.</em></label>
<label class="qz-opt"><input type="radio" name="aq4"><span>The method list is missing <code>local</code></span><em class="qz-fb qz-bad">That affects fallback, not whether a reply is accepted.</em></label>
<label class="qz-opt"><input type="radio" name="aq4"><span>The user has the wrong privilege level</span><em class="qz-fb qz-bad">That would refuse a shell, not fail authentication while the server reports success.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q5</span>You configured SSH but Telnet still works. What is missing?</p>
<label class="qz-opt"><input type="radio" name="aq5"><span><code>transport input ssh</code> on the vty lines</span><em class="qz-fb qz-good">Correct. Enabling SSH never disables Telnet — the default is often <code>transport input all</code>.</em></label>
<label class="qz-opt"><input type="radio" name="aq5"><span><code>ip ssh version 2</code></span><em class="qz-fb qz-bad">Sets the SSH version; does nothing to Telnet.</em></label>
<label class="qz-opt"><input type="radio" name="aq5"><span>A larger RSA modulus</span><em class="qz-fb qz-bad">Affects SSH key strength only.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q6</span>Which protocol pairing matches normal practice?</p>
<label class="qz-opt"><input type="radio" name="aq6"><span>TACACS+ for device administration, RADIUS for network access</span><em class="qz-fb qz-good">Correct — per-command control where humans type commands, and a standards-based multi-vendor protocol for 802.1X, VPN and wireless.</em></label>
<label class="qz-opt"><input type="radio" name="aq6"><span>RADIUS for device administration, TACACS+ for 802.1X</span><em class="qz-fb qz-bad">Backwards. 802.1X is defined around RADIUS; TACACS+ has no role there.</em></label>
<label class="qz-opt"><input type="radio" name="aq6"><span>Either one, interchangeably</span><em class="qz-fb qz-bad">They solve different problems, which is why most networks run both.</em></label>
</div>

---

## References

- **RFC 2865** — *Remote Authentication Dial In User Service (RADIUS)*. Packet format, the authenticators, and the password hiding algorithm.
- **RFC 2866** — *RADIUS Accounting*.
- **RFC 8907** — *The TACACS+ Protocol*. Including its own frank assessment of the obfuscation's limits.
- Cisco — [Authentication, Authorization, and Accounting Configuration Guide](https://www.cisco.com/c/en/us/td/docs/ios-xml/ios/sec_usr_aaa/configuration/xe-17/sec-usr-aaa-xe-17-book.html)
- Cisco — [TACACS+ and RADIUS Comparison](https://www.cisco.com/c/en/us/support/docs/security-vpn/remote-authentication-dial-user-service-radius/13838-10.html)

---

*Related: [Syslog](/blog/syslog-severities-timestamps-and-conditional-debugging) · [SNMP explained](/blog/snmp-v2c-v3-mibs-oids-and-traps) · [EAP-TLS frame by frame](/blog/eap-tls-explained-frame-by-frame).*

*Part of the [CCNA, ENCOR and ENARSI topic-by-topic study guide](/blog/ccna-ccnp-study-guide).*
