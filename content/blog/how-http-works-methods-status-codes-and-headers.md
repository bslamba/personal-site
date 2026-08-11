---
title: "How HTTP Works: Methods, Status Codes, and the Headers That Actually Matter"
excerpt: "The request/response model, what each method and status class really means, the version differences from 1.1 through 3, and the security headers every site should be sending."
date: "2026-01-22"
tags: ["HTTP", "Networking", "Web Security", "Fundamentals", "Headers"]
draft: false
---

## Cheat sheet

| | |
|---|---|
| **Transport** | TCP 80 (HTTP), TCP 443 (HTTPS). HTTP/3 uses QUIC over **UDP 443**. |
| **Stateless** | Every request is independent. Cookies and tokens add state on top. |

**Methods**

| Method | Purpose | Safe | Idempotent |
|---|---|---|---|
| GET | Retrieve | Yes | Yes |
| HEAD | Headers only | Yes | Yes |
| POST | Submit / create | No | No |
| PUT | Replace | No | Yes |
| PATCH | Partial update | No | No |
| DELETE | Remove | No | Yes |
| OPTIONS | Ask what's allowed | Yes | Yes |

**Status classes**

| Class | Meaning |
|---|---|
| 1xx | Informational |
| 2xx | Success |
| 3xx | Redirection |
| 4xx | Client error — *you* sent something wrong |
| 5xx | Server error — *it* failed |

**Security headers worth setting:** `Strict-Transport-Security` · `Content-Security-Policy` · `X-Content-Type-Options: nosniff` · `X-Frame-Options` / `frame-ancestors` · `Referrer-Policy` · `Permissions-Policy`

---

HTTP is a request/response protocol, and it's deliberately simple. A client sends a request with a method, a path and some headers. A server sends back a status code, some headers and usually a body.

Everything else — sessions, authentication, caching, compression — is built on top of those two messages.

## The request

```
GET /blog/index.html HTTP/1.1
Host: example.com
User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)
Accept: text/html,application/xhtml+xml
Accept-Encoding: gzip, deflate, br
Connection: keep-alive
```

**The `Host` header** is what makes shared hosting possible. One IP address, one port, many sites — the server decides which to serve based on this header. It became mandatory in HTTP/1.1 for exactly that reason.

**`User-Agent`** identifies the client. It's also the single most useful signal for device profiling, which is why the ISE HTTP probe exists — it distinguishes Windows from macOS from iOS reliably in a way little else does.

**`Accept-Encoding`** advertises which compression the client understands. If the server supports one of them, the response comes back compressed.

## The response

```
HTTP/1.1 200 OK
Date: Wed, 22 Jan 2026 10:00:00 GMT
Content-Type: text/html; charset=utf-8
Content-Length: 4821
Cache-Control: public, max-age=3600
Strict-Transport-Security: max-age=31536000
```

**`Content-Type`** tells the browser how to interpret the body. Get it wrong and the browser may guess — which is exactly the behaviour `X-Content-Type-Options: nosniff` exists to prevent, because guessing can be manipulated into executing something as script.

## Methods, and the two properties that matter

**Safe** means it doesn't change server state. **Idempotent** means doing it twice has the same effect as doing it once.

These aren't academic. They determine what's safe to retry automatically, what a proxy may cache, and what a browser may prefetch.

**GET** — retrieve. Safe and idempotent. Should never change anything. An API that deletes a record on GET will have records deleted by link prefetchers and crawlers, and this genuinely happens.

**POST** — submit or create. Neither safe nor idempotent, which is why browsers warn before re-submitting a form.

**PUT** — replace entirely. Idempotent: PUT the same resource twice and the end state is identical.

**PATCH** — partial update. Not idempotent in general, because "increment by one" applied twice differs from once.

**DELETE** — remove. Idempotent: deleting an already-deleted thing leaves the same state, even if the status code differs.

**HEAD** — like GET but headers only. Useful for checking whether something exists or has changed without transferring it.

**OPTIONS** — ask what's permitted. Used by CORS preflight, which is why it appears in logs for cross-origin API calls.

## Status codes worth knowing precisely

### 2xx — Success

**200 OK** — the normal one.
**201 Created** — a POST created something. Should include a `Location` header pointing at it.
**204 No Content** — succeeded, nothing to return. Common for DELETE.

### 3xx — Redirection

**301 Moved Permanently** — permanent. Browsers and search engines cache it hard, and it passes SEO value. Getting a 301 wrong is painful because clients remember it.
**302 Found** — temporary. Not cached the same way.
**304 Not Modified** — the client's cached copy is still valid. No body sent. This is what makes conditional requests efficient.
**307 / 308** — like 302 and 301 but guarantee the method isn't changed. 301 and 302 historically caused clients to convert POST to GET, which 307/308 fix.

### 4xx — Client error

**400 Bad Request** — malformed.
**401 Unauthorized** — actually means *unauthenticated*. You haven't proved who you are. Should include a `WWW-Authenticate` header.
**403 Forbidden** — authenticated, but not permitted. The distinction between 401 and 403 is worth getting right; it's the difference between "log in" and "you may not".
**404 Not Found** — no such resource.
**405 Method Not Allowed** — resource exists, that method isn't supported.
**429 Too Many Requests** — rate limited. Should include `Retry-After`.

### 5xx — Server error

**500 Internal Server Error** — something broke and wasn't handled.
**502 Bad Gateway** — a proxy got an invalid response from upstream. In a load-balanced environment this usually means the backend is down or returning garbage.
**503 Service Unavailable** — temporarily unable, often deliberate during maintenance.
**504 Gateway Timeout** — the proxy waited and the backend never answered.

**The operational shorthand:** 502 means the backend answered wrongly, 504 means it didn't answer at all. That single distinction points you at different halves of the infrastructure.

## Version differences

**HTTP/1.0** — one request per TCP connection. Enormously wasteful.

**HTTP/1.1** — persistent connections (`keep-alive`), so several requests reuse one connection. Added the mandatory `Host` header, chunked transfer encoding, and better caching. Still suffers **head-of-line blocking**: responses must come back in order, so one slow response stalls everything behind it.

**HTTP/2** — binary rather than text. **Multiplexing**: many requests in flight on one connection, responses in any order. Header compression (HPACK), because repeating the same headers on every request is substantial overhead. Server push, which turned out to be less useful than hoped and has largely been abandoned.

HTTP/2 solves head-of-line blocking at the HTTP layer, but not at the TCP layer — a lost packet still stalls every stream on that connection, because TCP delivers in order.

**HTTP/3** — runs over **QUIC**, which is built on **UDP 443** rather than TCP. Each stream is independent at the transport layer, so packet loss affecting one stream doesn't stall the others. Connection establishment is faster because TLS 1.3 is integrated into the transport handshake.

**The firewall consequence:** HTTP/3 is UDP 443. Networks that permit TCP 443 and block UDP will silently fall back to HTTP/2, which mostly works but loses the benefit. Worth knowing when someone asks why the new protocol isn't being used.

## The security headers

These are the ones that meaningfully reduce attack surface, and most sites send few of them.

**`Strict-Transport-Security`**

```
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

Tells the browser to only ever use HTTPS for this domain, for the stated duration. Prevents the downgrade attack where an attacker intercepts the initial plain-HTTP request before the redirect happens. `includeSubDomains` extends it — powerful, and worth checking every subdomain has a certificate before enabling.

**`Content-Security-Policy`**

The strongest defence against cross-site scripting. Declares which sources are permitted for scripts, styles, images and frames.

```
Content-Security-Policy: default-src 'self'; script-src 'self'; frame-ancestors 'none'
```

Difficult to retrofit onto an existing site — inline scripts break — but transformative on a new one. Deploy in report-only mode first.

**`X-Content-Type-Options: nosniff`**

Stops the browser guessing content types. Without it, a file the server labels as text could be sniffed as script and executed. One line, no downside, and frequently missing.

**`X-Frame-Options: DENY`** or CSP's `frame-ancestors`

Prevents your page being framed by another site, which is what clickjacking depends on. `frame-ancestors` in CSP is the modern replacement, but sending both covers older clients.

**`Referrer-Policy: strict-origin-when-cross-origin`**

Controls how much URL information leaks to third parties in the `Referer` header. Without it, a URL containing a token or an internal path is sent to every external site you link to.

**`Permissions-Policy`**

Declares which browser features the page may use — camera, microphone, geolocation. Reduces what a successful injection can reach.

### Headers to remove

**`Server`** and **`X-Powered-By`** advertise your software and version. That's free reconnaissance for anyone matching versions against known vulnerabilities. Strip them at the load balancer.

## Where this meets WAF work

If you operate a web application firewall — F5, AWS, Azure — HTTP is the layer you're inspecting. Worth being precise about:

**Layer 7 attacks are HTTP-shaped.** SQL injection in a parameter, XSS in a form field, path traversal in a URL, oversized headers. A WAF inspects the parsed HTTP request, which is why it can catch things a network firewall cannot.

**`X-Forwarded-For` matters when you SNAT.** If a load balancer rewrites the source IP, the backend logs the balancer's address for every request. Inserting the original client IP in an `X-Forwarded-For` header, and configuring the web server to log from that header instead, restores useful logging.

**Automated testing of all inputs is worth doing** — parameters, headers, URL, cookies, JSON, SOAP and XML. Attackers don't limit themselves to form fields, and neither should your testing.

---

HTTP is simple enough to read by hand and complicated enough that most production deployments get the headers wrong. The methods and status codes are worth knowing precisely, because half of API debugging is someone using the wrong one and the other half is someone misreading what a 401 means.
