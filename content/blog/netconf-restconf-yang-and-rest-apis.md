---
title: "NETCONF, RESTCONF and YANG: Configuring a Router Without Pretending to Be a Human"
excerpt: "Screen-scraping the CLI works until the output format changes. YANG gives the device a schema, NETCONF and RESTCONF give you a way to read and write against it, and the reply comes back as structured data you can act on rather than text you have to guess at."
date: "2026-09-20"
tags: ["NETCONF", "RESTCONF", "YANG", "REST API", "Automation", "JSON", "ENCOR"]
draft: false
---

> **Blueprint:** ENCOR 350-401 — 4.6 *Configure and verify NETCONF and RESTCONF*, 6.3 *Describe the high-level principles and benefits of a data modeling language such as YANG*, 6.5 *Interpret REST API response codes and results in payload*, 5.3 *Describe REST API security*.

## Cheat sheet

| | NETCONF | RESTCONF |
|---|---|---|
| Transport | **SSH, port 830** | **HTTPS, port 443** |
| Encoding | **XML only** | **XML or JSON** |
| Operations | `<get>`, `<get-config>`, `<edit-config>`, `<lock>`, `<commit>` | **GET, POST, PUT, PATCH, DELETE** |
| Transactions | **Yes — lock, candidate, commit, rollback** | No |
| Multiple datastores | running, candidate, startup | running only |
| Tooling | ncclient, Ansible | **curl, Postman, any HTTP client** |
| Enable | `netconf-yang` | `restconf` |

| | |
|---|---|
| **YANG** | The *schema*. Defines what leaves exist, their types, and constraints |
| **NETCONF/RESTCONF** | The *protocols*. How you read and write against that schema |
| **XML / JSON** | The *encoding*. How the data looks on the wire |
| **Native model** | `Cisco-IOS-XE-native` — everything, vendor-specific |
| **OpenConfig / IETF** | Vendor-neutral, narrower coverage |

**Response codes worth knowing:** `200` OK with a body · `201` Created · `204` No Content — **the success you get from a successful PUT, and it has no body, which is not an error** · `400` malformed · `401` credentials · `403` authenticated but not permitted · `404` the path does not exist in the model · `409` conflict, usually a lock.

---

## The problem this solves

<figure class="fig">
<svg class="sv1" viewBox="0 0 640 250" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Screen scraping the CLI produces text that must be parsed while an API returns structured data">
  <style>.sv1 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv1 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv1 .m{font-family:ui-monospace,Menlo,monospace;font-size:10px;fill:#17171A}.sv1 .bad{fill:rgba(211,0,45,.08);stroke:#D3002D}.sv1 .good{fill:rgba(31,157,107,.10);stroke:#1f9d6b}.sv1 .hdr{font-family:ui-sans-serif,system-ui;font-size:10px;font-weight:700;letter-spacing:.06em;fill:#8A8A93}
  </style>
  <text class="hdr" x="14" y="20">SCREEN SCRAPING</text>
  <rect class="bad" x="14" y="30" width="300" height="86"/>
  <text class="m" x="26" y="50">Gi0/1   10.1.10.1   YES NVRAM  up   up</text>
  <text class="m" x="26" y="66">Gi0/2   unassigned  YES unset  down down</text>
  <text class="s" x="26" y="92">Column 3 is &#8220;OK?&#8221;. Or it was in 15.2.</text>
  <text class="s" x="26" y="108">Parse it with a regex and hope.</text>
  <text class="hdr" x="336" y="20">RESTCONF</text>
  <rect class="good" x="336" y="30" width="290" height="86"/>
  <text class="m" x="348" y="50">{"name": "GigabitEthernet0/1",</text>
  <text class="m" x="348" y="66"> "oper-status": "if-oper-state-ready",</text>
  <text class="m" x="348" y="82"> "ipv4": "10.1.10.1"}</text>
  <text class="s" x="348" y="108">Named fields. Typed values. No parsing.</text>
  <rect x="14" y="136" width="612" height="46" fill="#F1EEE9" stroke="#B5B5BC"/>
  <text class="k" x="26" y="156">The CLI is a human interface that automation borrowed. It was never a contract.</text>
  <text class="s" x="26" y="174">Column widths, headings and wording change between releases, and nothing tells you they have.</text>
  <rect x="14" y="194" width="612" height="46" fill="rgba(31,157,107,.10)" stroke="#1f9d6b"/>
  <text class="k" x="26" y="214" fill="#0f6b47">A YANG model is a contract. Fields have names, types and constraints.</text>
  <text class="s" x="26" y="232">If a field changes, the model changes — visibly, with a revision date you can check.</text>
</svg>
<figcaption><b>Figure 1.</b> The gain is not that it is newer. It is that there is a published schema, so your code can stop guessing.</figcaption>
</figure>

<div class="why">
<b>YANG is the model; NETCONF and RESTCONF are just doors into it</b>
People conflate the three constantly. <b>YANG</b> describes the data — what containers and leaves exist, what type each one is, which are configuration and which are read-only state. <b>NETCONF</b> and <b>RESTCONF</b> are two different ways to read and write that same data. <b>XML and JSON</b> are how it is serialised in transit.
<br><br>Change the protocol and you address the identical model. That is the whole architectural point, and it is why the exam asks you to <i>describe the benefits of a data modeling language</i> rather than to memorise a protocol.
</div>

---

## A RESTCONF request, end to end

<div class="walk">
<div class="walk-head">Reading and writing an interface <span class="walk-hint">click a step</span></div>
<div class="walk-tabs">
  <input type="radio" name="rcw" id="rc1" checked><label for="rc1"><span class="step-n">1</span>The URL is the model</label>
  <input type="radio" name="rcw" id="rc2"><label for="rc2"><span class="step-n">2</span>GET</label>
  <input type="radio" name="rcw" id="rc3"><label for="rc3"><span class="step-n">3</span>PUT</label>
  <input type="radio" name="rcw" id="rc4"><label for="rc4"><span class="step-n">4</span>NETCONF instead</label>
</div>
<div class="walk-panels">
<div class="walk-panel">
<svg class="sv2" viewBox="0 0 640 195" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A RESTCONF URL maps directly onto the YANG model hierarchy">
  <style>.sv2 .m{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;fill:#17171A}.sv2 .s{font-family:ui-sans-serif,system-ui;font-size:10px;fill:#5C5C64}.sv2 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv2 .f{fill:#F1EEE9;stroke:#B5B5BC}.sv2 .hl{fill:rgba(75,123,236,.16);stroke:#4b7bec}</style>
  <rect class="f" x="14" y="34" width="132" height="30"/><text class="m" x="80" y="54" text-anchor="middle">/restconf/data</text>
  <rect class="hl" x="150" y="34" width="210" height="30"/><text class="m" x="255" y="54" text-anchor="middle">/Cisco-IOS-XE-native:native</text>
  <rect class="f" x="364" y="34" width="120" height="30"/><text class="m" x="424" y="54" text-anchor="middle">/interface</text>
  <rect class="hl" x="488" y="34" width="138" height="30"/><text class="m" x="557" y="54" text-anchor="middle">/GigabitEthernet=2</text>
  <text class="s" x="80" y="80" text-anchor="middle">the datastore</text>
  <text class="s" x="255" y="80" text-anchor="middle">module name</text>
  <text class="s" x="424" y="80" text-anchor="middle">container</text>
  <text class="s" x="557" y="80" text-anchor="middle">list key</text>
  <text class="k" x="14" y="118">The path IS the model hierarchy. No separate API to learn.</text>
  <text class="s" x="14" y="142">Walk the YANG tree and you have walked every valid URL. <tspan font-family="ui-monospace,Menlo,monospace">=2</tspan> selects one entry from a</text>
  <text class="s" x="14" y="158">list by its key — the same idea as an index, expressed in the URL.</text>
  <text class="s" x="14" y="184">Try <tspan font-family="ui-monospace,Menlo,monospace">GET /restconf/data/ietf-yang-library:modules-state</tspan> to list every model the device supports.</text>
</svg>
<p class="walk-say"><span class="walk-title">The URL is generated from the schema</span>
There is no hand-written API surface here. The path is the YANG tree: module, then container, then list entry selected by key with <code>=</code>.
<br><br>Which means <b>the way to learn the API is to read the model</b>, with <code>pyang -f tree</code> or the device's own YANG library. If you can navigate the tree you can construct any URL, and if a path returns 404 the usual cause is that you have mis-walked the hierarchy rather than that the feature is missing.</p>
</div>
<div class="walk-panel">
<svg class="sv3" viewBox="0 0 640 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A GET returns 200 with a JSON body describing the interface">
  <style>.sv3 .m{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;fill:#17171A}.sv3 .s{font-family:ui-sans-serif,system-ui;font-size:10px;fill:#5C5C64}.sv3 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv3 .n{fill:#17171A}.sv3 .nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.sv3 .ok{fill:rgba(31,157,107,.16);stroke:#1f9d6b}</style>
  <rect class="n" x="20" y="60" width="90" height="32" rx="3"/><text class="nt" x="65" y="81" text-anchor="middle">client</text>
  <rect class="n" x="520" y="60" width="100" height="32" rx="3"/><text class="nt" x="570" y="81" text-anchor="middle">R1 :443</text>
  <path d="M 110 68 L 520 68" stroke="#4b7bec" stroke-width="2" fill="none"/>
  <circle r="4" fill="#4b7bec"><animateMotion dur="1.6s" repeatCount="indefinite" path="M 110 68 L 520 68"/></circle>
  <text class="m" x="315" y="58" text-anchor="middle">GET  Accept: application/yang-data+json</text>
  <path d="M 520 86 L 110 86" stroke="#1f9d6b" stroke-width="2" fill="none"/>
  <circle r="4" fill="#1f9d6b"><animateMotion dur="1.6s" begin="0.8s" repeatCount="indefinite" path="M 520 86 L 110 86"/></circle>
  <text class="m" x="315" y="104" text-anchor="middle" fill="#0f6b47">200 OK  +  JSON body</text>
  <rect class="ok" x="14" y="124" width="612" height="34"/>
  <text class="m" x="26" y="146">{"Cisco-IOS-XE-native:GigabitEthernet": {"name": "2", "ip": {...}}}</text>
  <text class="k" x="14" y="186">The key is namespaced — <tspan font-family="ui-monospace,Menlo,monospace">module:node</tspan> — so two models can use the same name safely.</text>
</svg>
<p class="walk-say"><span class="walk-title">200, with a body</span>
<code>Accept: application/yang-data+json</code> asks for JSON; send <code>+xml</code> and the identical data comes back as XML. Same model, same path, different serialisation.
<br><br>Note the namespaced key. <code>Cisco-IOS-XE-native:GigabitEthernet</code> carries its module prefix so that a field called <code>name</code> in one model cannot be confused with <code>name</code> in another. It looks verbose and it is what makes multiple models coexist on one device.</p>
</div>
<div class="walk-panel">
<svg class="sv4" viewBox="0 0 640 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A successful PUT returns 204 No Content which has an empty body and is not an error">
  <style>.sv4 .m{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;fill:#17171A}.sv4 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv4 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv4 .f{fill:#F1EEE9;stroke:#B5B5BC}.sv4 .ok{fill:rgba(31,157,107,.16);stroke:#1f9d6b}.sv4 .warn{fill:rgba(211,0,45,.08);stroke:#D3002D}</style>
  <rect class="f" x="14" y="28" width="300" height="76"/>
  <text class="m" x="26" y="48">PUT  …/GigabitEthernet=2</text>
  <text class="m" x="26" y="66">Content-Type: yang-data+json</text>
  <text class="m" x="26" y="84">{"…:GigabitEthernet": {"name":"2", …}}</text>
  <rect class="ok" x="326" y="28" width="300" height="76"/>
  <text class="m" x="338" y="48" fill="#0f6b47">HTTP/1.1 204 No Content</text>
  <text class="s" x="338" y="70">no body at all</text>
  <text class="s" x="338" y="88">the change is applied to running-config</text>
  <rect class="warn" x="14" y="122" width="612" height="44"/>
  <text class="k" x="26" y="142" fill="#B80027">204 is a SUCCESS. Scripts that test for a body treat it as failure.</text>
  <text class="s" x="26" y="158">Check the status code, not whether the response parsed as JSON. This one bites everybody once.</text>
  <text class="k" x="14" y="192">PUT replaces the whole resource. PATCH merges. Choosing wrong quietly deletes configuration.</text>
</svg>
<p class="walk-say"><span class="walk-title">204 No Content — the success that looks like failure</span>
A successful write returns <b>204 with an empty body</b>. Code that does <code>response.json()</code> and assumes an exception means failure will report every successful change as broken.
<br><br>The other trap is method choice. <b><code>PUT</code> replaces the entire resource</b> — send a partial interface object and everything you omitted is removed. <b><code>PATCH</code> merges</b>, leaving unmentioned fields alone. Use PATCH unless you genuinely intend a full replacement, and be aware that the difference only shows up later, as configuration that quietly vanished.
<br><br>And there is no transaction. <b>The change hits running-config immediately</b>, one request at a time, with no rollback if the fifth of ten calls fails.</p>
</div>
<div class="walk-panel">
<svg class="sv5" viewBox="0 0 640 215" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="NETCONF adds lock candidate datastore commit and rollback so a set of changes applies atomically">
  <style>.sv5 .m{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;fill:#17171A}.sv5 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv5 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv5 .f{fill:#F1EEE9;stroke:#B5B5BC}.sv5 .ok{fill:rgba(31,157,107,.16);stroke:#1f9d6b}</style>
  <defs><marker id="nm" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#8A8A93"/></marker></defs>
  <rect class="f" x="14" y="36" width="112" height="32"/><text class="m" x="70" y="57" text-anchor="middle">&lt;lock&gt;</text>
  <line x1="130" y1="52" x2="158" y2="52" stroke="#8A8A93" stroke-width="1.5" marker-end="url(#nm)"/>
  <rect class="f" x="162" y="36" width="150" height="32"/><text class="m" x="237" y="57" text-anchor="middle">&lt;edit-config&gt; ×N</text>
  <line x1="316" y1="52" x2="344" y2="52" stroke="#8A8A93" stroke-width="1.5" marker-end="url(#nm)"/>
  <rect class="ok" x="348" y="36" width="130" height="32"/><text class="m" x="413" y="57" text-anchor="middle">&lt;commit&gt;</text>
  <line x1="482" y1="52" x2="510" y2="52" stroke="#8A8A93" stroke-width="1.5" marker-end="url(#nm)"/>
  <rect class="f" x="514" y="36" width="112" height="32"/><text class="m" x="570" y="57" text-anchor="middle">&lt;unlock&gt;</text>
  <text class="s" x="70" y="84" text-anchor="middle">nobody else</text>
  <text class="s" x="237" y="84" text-anchor="middle">into candidate</text>
  <text class="s" x="413" y="84" text-anchor="middle">all or nothing</text>
  <rect class="ok" x="14" y="106" width="612" height="44"/>
  <text class="k" x="26" y="126" fill="#0f6b47">Ten changes either all apply or none do.</text>
  <text class="s" x="26" y="142">The candidate datastore holds them until commit. A failure discards the lot instead of leaving half.</text>
  <text class="k" x="14" y="176">This is the reason to choose NETCONF over RESTCONF for real configuration work.</text>
  <text class="s" x="14" y="198">RESTCONF is better for reading state and for quick single changes from anything that speaks HTTP.</text>
</svg>
<p class="walk-say"><span class="walk-title">Transactions, which RESTCONF does not have</span>
NETCONF writes into a <b>candidate datastore</b>, holds a <b>lock</b> so nobody else edits concurrently, and applies everything on <code>&lt;commit&gt;</code>. If any part fails, nothing is applied.
<br><br>With <code>commit confirmed</code> you get the automation equivalent of <code>reload in 5</code>: the change reverts automatically unless you confirm it, so a change that severs your own management path undoes itself.
<br><br>That is the real decision between the two protocols. <b>RESTCONF for reading state and simple changes; NETCONF when a set of changes must land together.</b></p>
</div>
</div>
</div>

---

## On the wire

<div class="cap">
<div class="cap-head">Capture · restconf session <span class="cap-filter">tcp.port == 443 (decrypted)</span></div>
<div class="cap-hex"><pre>$ curl -k -u admin:&lt;password&gt; \
    -H "Accept: application/yang-data+json" \
    https://10.0.0.1/restconf/data/Cisco-IOS-XE-native:native/interface/GigabitEthernet=2

<mark>HTTP/1.1 200 OK</mark>
Content-Type: application/yang-data+json

{
  "Cisco-IOS-XE-native:GigabitEthernet": {
    "name": "2",
    "description": "to-SW1",
    "ip": { "address": { "primary": { "address": "10.1.20.1",
                                      "mask": "255.255.255.0" } } }
  }
}

$ curl -k -u admin:&lt;password&gt; -X PATCH \
    -H "Content-Type: application/yang-data+json" \
    -d '{"Cisco-IOS-XE-native:GigabitEthernet":{"name":"2","description":"to-SW1-uplink"}}' \
    https://10.0.0.1/restconf/data/Cisco-IOS-XE-native:native/interface/GigabitEthernet=2

<mark>HTTP/1.1 204 No Content</mark>

$ curl ... /Cisco-IOS-XE-native:native/interface/GigabitEthernet=99

<mark>HTTP/1.1 404 Not Found</mark>
{"errors":{"error":[{"error-type":"application",
                     "error-tag":"invalid-value",
                     "error-message":"uri keypath not found"}]}}</pre></div>
<div class="cap-note">
Three outcomes worth recognising. <b>200</b> with a body on a read. <b>204</b> with <i>no</i> body on a successful write — success, despite looking empty. <b>404</b> with a structured <code>errors</code> object, because even the errors are modelled.<br>
That error body is the thing to read when a call fails. <code>error-tag</code> tells you the class of problem — <code>invalid-value</code>, <code>missing-element</code>, <code>access-denied</code>, <code>lock-denied</code> — and it is far more precise than the status code alone.<br>
<b>Note <code>-k</code>.</b> It disables certificate verification, which is fine in a lab and is how most people's first production script ends up too.
</div>
</div>

---

## Configuration, word by word

<div class="cmd">
<div class="cmd-line"><span class="t">netconf-yang</span>
<span class="t">restconf</span>
!
<span class="t">ip http secure-server</span>
<span class="t">no ip http server</span>
!
<span class="t">aaa new-model</span>
<span class="t">aaa authentication login</span> <span class="opt">default local</span>
<span class="t">aaa authorization exec</span> <span class="opt">default local</span>
!
<span class="t">username</span> <span class="opt">apiuser</span> <span class="t">privilege</span> <span class="opt">15</span> <span class="t">algorithm-type scrypt secret</span> <span class="opt">&lt;strong&gt;</span>
!
<span class="t">ip access-list standard</span> <span class="opt">MGMT-ONLY</span>
 <span class="t">permit</span> <span class="opt">10.0.0.0 0.0.0.255</span>
<span class="t">ip http access-class ipv4</span> <span class="opt">MGMT-ONLY</span></div>
<dl class="cmd-parts">
<div class="is-key"><dt>netconf-yang</dt><dd>Starts the NETCONF listener on <b>TCP 830</b> over SSH. It takes <b>up to a minute or two</b> to come up while the YANG models load, and connecting during that window gives a refused connection that looks like a configuration error. Wait, then check <code>show netconf-yang sessions</code>.</dd></div>
<div class="is-key"><dt>restconf</dt><dd>Needs the HTTPS server. <b>RESTCONF will not start without <code>ip http secure-server</code></b>, and the failure is silent — no error, the feature simply does not answer.</dd></div>
<div class="is-key"><dt>no ip http server</dt><dd><b>Turn off plain HTTP.</b> RESTCONF authenticates with HTTP Basic, which is base64 — not encryption. Over plain HTTP your credentials are readable by anyone on the path, on every single request.</dd></div>
<div class="is-key"><dt>aaa authorization exec<br>default local</dt><dd><b>Both lines are required and this is the classic gotcha.</b> With authentication but no exec authorization, the API returns <b>401</b> for a user whose password is entirely correct. People spend hours on the password. The answer is the missing authorization line.</dd></div>
<div><dt>privilege 15</dt><dd>The API user needs level 15 to write configuration. Give it a dedicated account, not a shared human one, so accounting can tell automation apart from people.</dd></div>
<div class="is-key"><dt>ip http access-class</dt><dd><b>Restrict who may even reach the API.</b> An unrestricted RESTCONF endpoint with Basic auth is a device-wide configuration interface exposed to whoever can route to it. This one line is the highest-value item in the block.</dd></div>
</dl>
</div>

<div class="why">
<b>REST API security, in four points the exam wants</b>
<b>Transport</b> — HTTPS always, and verify the certificate rather than passing <code>-k</code>. <b>Authentication</b> — Basic is base64, not encryption; prefer token or certificate-based auth where the platform supports it. <b>Authorization</b> — a dedicated least-privilege account per consumer, so a compromised script is bounded and accounting stays meaningful. <b>Exposure</b> — bind to a management interface and put an ACL in front of it; rate-limit where you can.
<br><br>The failure that actually happens is not exotic. It is <b>a level-15 API account with a weak password, on an endpoint reachable from the user network, over a session nobody verifies the certificate of.</b>
</div>

---

## Reading it

<div class="term">
<div class="term-bar"><span class="term-dots"><i></i><i></i><i></i></span>R1 — is it actually listening?</div>
<pre><span class="p">R1#</span> <span class="c">show netconf-yang status</span>
netconf-yang: <span class="g">enabled</span>
netconf-yang candidate-datastore: enabled

<span class="p">R1#</span> <span class="c">show netconf-yang sessions</span>
R: Global-lock on running datastore
C: Global-lock on candidate datastore
S: Global-lock on startup datastore
Number of sessions : 1
session-id  transport  username   source-host    global-lock
-------------------------------------------------------------
23          netconf-ssh  apiuser  10.0.0.9       <span class="y">C</span>

<span class="o">! A stale global-lock is why your next edit gets 409 / lock-denied.</span>
<span class="o">! A crashed script can hold it. Kill the session to clear it.</span>

<span class="p">R1#</span> <span class="c">show platform software yang-management process</span>
confd            : <span class="g">Running</span>
nesd             : <span class="g">Running</span>
syncfd           : <span class="g">Running</span>
ncsshd           : <span class="g">Running</span>
dmiauthd         : <span class="g">Running</span>
nginx            : <span class="g">Running</span>       <span class="o">&lt;- no nginx, no RESTCONF</span>
ndbmand          : <span class="g">Running</span>
pubd             : <span class="g">Running</span>

<span class="p">R1#</span> <span class="c">show running-config | include restconf|http</span>
restconf
ip http secure-server
<span class="o">! If "restconf" is present but nginx is not running, the HTTPS server is missing.</span><span class="cur"></span></pre>
</div>
<p class="term-cap"><b>`show platform software yang-management process` is the one to remember.</b> When RESTCONF or NETCONF "does not work", the usual answer is a process that is not running — most often `nginx` for RESTCONF, because `ip http secure-server` was never configured. The feature reports itself as enabled either way.</p>

<div class="real">
<b>In the real world</b>
Most teams do not write NETCONF XML by hand. They use Ansible or a Python library — <code>ncclient</code> for NETCONF, plain <code>requests</code> for RESTCONF — and the model knowledge still matters, because the module arguments are the YANG paths.
<br><br>The realistic first win is not configuration at all. <b>It is reading state from every device and putting it in one place</b>: software versions, interface descriptions, neighbours, uptimes. A loop of GET requests answers "which devices are still on that release" in seconds, and it cannot break anything, which makes it the right place to start.
</div>

---

## What goes wrong

**RESTCONF returns 401 with correct credentials.** Missing `aaa authorization exec default local`.

**RESTCONF does not answer at all.** `ip http secure-server` not configured — check `nginx` in the process list.

**NETCONF refuses connections right after enabling.** Still loading models. Wait a minute or two.

**409 / `lock-denied`.** Another session holds a lock. `show netconf-yang sessions`, then clear it.

**A PUT deleted configuration you did not mention.** PUT replaces. Use PATCH to merge.

**204 treated as an error by your script.** It is a success with no body. Test the status code.

**404 on a path that should exist.** Usually a mis-walked model, not a missing feature. Check with `pyang -f tree`.

---

<div class="lab">
<div class="lab-head">Lab — read, write, break, and roll back</div>
<div class="lab-body">

<div class="lab-target"><b>Target</b>
Enable both protocols and find out why one of them silently does not start. Read an interface with curl and write to it, seeing 200 and 204 and understanding why one has no body. Prove the difference between PUT and PATCH by deleting configuration with a PUT. Then use NETCONF's candidate datastore to apply a set of changes atomically, and use <code>commit confirmed</code> to recover from a change that cuts you off.</div>

**Topology.** One IOS-XE device (CSR1000v, Cat9000v or a DevNet sandbox) plus a machine with `curl`, Python, `ncclient` and `pyang`.

<p class="lab-step"><span class="n">1</span>Enable both — and watch one fail</p>

```cisco
netconf-yang
restconf
```

Deliberately **do not** configure `ip http secure-server` yet. Try a RESTCONF GET.

<div class="lab-watch"><b>Things to notice</b>
Connection refused, with <code>restconf</code> plainly present in the running config. Run <code>show platform software yang-management process</code> and find <b>nginx not running</b>.
<br><br>Add <code>ip http secure-server</code>, wait, check again. <b>That progression — feature configured, process absent, silent failure — is the fault you will hit in production</b>, and the process list is what tells you.</div>

<p class="lab-step"><span class="n">2</span>Produce the 401 that is not about the password</p>

Configure `aaa new-model` and `aaa authentication login default local` but **omit** the authorization line. Authenticate with a known-good password.

<div class="lab-watch"><b>Things to notice</b>
<b>401 Unauthorized</b>, with credentials that are completely correct. Add <code>aaa authorization exec default local</code> and the same request succeeds immediately.
<br><br>Remember the shape: <b>401 does not always mean the password is wrong.</b> Anyone who has not met this loses an afternoon to it.</div>

<p class="lab-step"><span class="n">3</span>GET, then PATCH, then read the codes</p>

```bash
curl -k -u apiuser:PASS -H "Accept: application/yang-data+json" https://R1/restconf/data/Cisco-IOS-XE-native:native/interface/GigabitEthernet=2
```

Then PATCH a new description, and request a nonexistent interface.

<div class="lab-watch"><b>Things to notice</b>
<b>200</b> with a body, <b>204</b> with nothing, <b>404</b> with a structured error object. Add <code>-i</code> so you can see the status lines.
<br><br>Then swap <code>Accept</code> to <code>application/yang-data+xml</code> and repeat. <b>Identical data, different encoding</b> — which makes the model/protocol/encoding split concrete rather than theoretical.</div>

<p class="lab-step"><span class="n">4</span>Delete configuration with a PUT</p>

Put a description, an IP address and a helper address on a test interface. Then `PUT` an object containing **only** the name and description.

<div class="lab-issues"><b>Possible issues</b>
<ul>
<li><b>It returns 400</b> — a PUT must include the list key. Include <code>"name"</code>.</li>
<li><b>Nothing appears to change</b> — check <code>show run interface</code> rather than the API response.</li>
<li><b>You cannot restore it</b> — that is the lesson; reconfigure from the CLI.</li>
</ul>
<b>The IP address and helper address are gone.</b> PUT replaced the resource with exactly what you sent. Repeat with PATCH and they survive. <b>Do this in a lab once and you will never confuse the two again.</b></div>

<p class="lab-step"><span class="n">5</span>NETCONF, with a transaction</p>

Use `ncclient` to `lock` the candidate, send two `edit-config` operations where the **second is deliberately invalid**, then `commit`.

<div class="lab-watch"><b>Things to notice</b>
The commit fails and <b>neither change is applied</b> — not even the valid one. Check <code>show run</code> to confirm. Then fix the second edit and commit again; both land together.
<br><br>That is the capability RESTCONF does not have. With RESTCONF the first call would have succeeded and the second failed, <b>leaving the device half-configured with nothing to roll back to</b>.</div>

<p class="lab-step"><span class="n">6</span>Cut yourself off, and get saved</p>

Issue a `commit confirmed` with a 60-second timeout, where the change removes your own management access.

<div class="lab-watch"><b>Things to notice</b>
You lose access. Wait. <b>The device reverts on its own</b> and you are back in. Repeat with a plain <code>commit</code> and you need console access to recover.
<br><br>This is <code>reload in 5</code> for the API era, and it belongs in every change that touches management reachability. Also try leaving a lock held by killing your script mid-session, then watch the next attempt fail with <b>409 / lock-denied</b> — and clear it with <code>show netconf-yang sessions</code>.</div>

<div class="lab-earned"><b>What you earned</b>
You can enable both protocols and diagnose the silent failure where the feature is configured and the process is not running. You know that a 401 can mean a missing authorization line rather than a bad password. You can read 200, 204 and 404 correctly, including why the success case has no body. You have deleted configuration with a PUT and kept it with a PATCH. You have watched a NETCONF transaction refuse to apply a partial change, and you have been rescued by <code>commit confirmed</code> from a change that cut off your own access.</div>

</div>
</div>

---

## Test yourself

<div class="qz">
<p class="qz-q"><span class="qz-num">Q1</span>What is YANG?</p>
<label class="qz-opt"><input type="radio" name="rq1"><span>A data modeling language — the schema describing what data exists and its types</span><em class="qz-fb qz-good">Correct. NETCONF and RESTCONF are protocols that access data modelled in YANG; XML and JSON are encodings.</em></label>
<label class="qz-opt"><input type="radio" name="rq1"><span>A transport protocol for network configuration</span><em class="qz-fb qz-bad">That is NETCONF or RESTCONF.</em></label>
<label class="qz-opt"><input type="radio" name="rq1"><span>An encoding format like JSON</span><em class="qz-fb qz-bad">YANG describes structure; JSON and XML serialise it.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q2</span>A RESTCONF PUT returns <code>204 No Content</code>. What happened?</p>
<label class="qz-opt"><input type="radio" name="rq2"><span>It succeeded — 204 means success with no response body</span><em class="qz-fb qz-good">Correct, and scripts that expect a JSON body will wrongly flag it as a failure.</em></label>
<label class="qz-opt"><input type="radio" name="rq2"><span>The resource was not found</span><em class="qz-fb qz-bad">That is 404.</em></label>
<label class="qz-opt"><input type="radio" name="rq2"><span>The request was rejected</span><em class="qz-fb qz-bad">Rejections are 4xx with an error body.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q3</span>Which capability does NETCONF have that RESTCONF does not?</p>
<label class="qz-opt"><input type="radio" name="rq3"><span>Transactions — lock, candidate datastore, commit and rollback</span><em class="qz-fb qz-good">Correct. A set of changes applies atomically or not at all, which is why configuration work belongs on NETCONF.</em></label>
<label class="qz-opt"><input type="radio" name="rq3"><span>JSON encoding</span><em class="qz-fb qz-bad">Backwards — RESTCONF does JSON; NETCONF is XML only.</em></label>
<label class="qz-opt"><input type="radio" name="rq3"><span>Reading operational state</span><em class="qz-fb qz-bad">Both read state perfectly well.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q4</span>RESTCONF returns 401 and you are certain the password is right. What is the likely cause?</p>
<label class="qz-opt"><input type="radio" name="rq4"><span>Missing <code>aaa authorization exec default local</code></span><em class="qz-fb qz-good">Correct — authentication alone is not enough, and the symptom points firmly at the wrong thing.</em></label>
<label class="qz-opt"><input type="radio" name="rq4"><span>The YANG model is not loaded</span><em class="qz-fb qz-bad">That produces 404 on a path, not 401.</em></label>
<label class="qz-opt"><input type="radio" name="rq4"><span>HTTPS is not enabled</span><em class="qz-fb qz-bad">Then nothing would answer at all.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q5</span>What is the difference between PUT and PATCH in RESTCONF?</p>
<label class="qz-opt"><input type="radio" name="rq5"><span>PUT replaces the whole resource; PATCH merges the fields you send</span><em class="qz-fb qz-good">Correct — which is why a partial PUT silently deletes everything you left out.</em></label>
<label class="qz-opt"><input type="radio" name="rq5"><span>PUT creates, PATCH updates</span><em class="qz-fb qz-bad">Closer to plain REST convention; in RESTCONF the replace-vs-merge distinction is the one that matters.</em></label>
<label class="qz-opt"><input type="radio" name="rq5"><span>PUT is transactional, PATCH is not</span><em class="qz-fb qz-bad">Neither is transactional. That is NETCONF.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q6</span>Which is the strongest single control on a RESTCONF endpoint?</p>
<label class="qz-opt"><input type="radio" name="rq6"><span>An access class limiting which sources can reach it, plus HTTPS only</span><em class="qz-fb qz-good">Correct. Basic auth over an endpoint anyone can route to is a device-wide config interface left open.</em></label>
<label class="qz-opt"><input type="radio" name="rq6"><span>A long password on the API account</span><em class="qz-fb qz-bad">Necessary and nowhere near sufficient.</em></label>
<label class="qz-opt"><input type="radio" name="rq6"><span>Using JSON rather than XML</span><em class="qz-fb qz-bad">Encoding has no security effect.</em></label>
</div>

---

## References

- **RFC 6241** — *Network Configuration Protocol (NETCONF)*. Operations, datastores, locking.
- **RFC 8040** — *RESTCONF Protocol*. URL structure, methods and the error format.
- **RFC 7950** — *The YANG 1.1 Data Modeling Language*.
- Cisco — [Programmability Configuration Guide](https://www.cisco.com/c/en/us/td/docs/ios-xml/ios/prog/configuration/17/b_1712_programmability_cg.html)
- [YangModels/yang on GitHub](https://github.com/YangModels/yang) — every vendor and IETF model, and [DevNet sandboxes](https://developer.cisco.com/site/sandbox/) to try them against.

---

*Related: [SNMP explained](/blog/snmp-v2c-v3-mibs-oids-and-traps) · [AAA: RADIUS and TACACS+](/blog/aaa-radius-tacacs-explained) · [How HTTP works](/blog/how-http-works-methods-status-codes-and-headers).*

*Part of the [CCNA, ENCOR and ENARSI topic-by-topic study guide](/blog/ccna-ccnp-study-guide).*
