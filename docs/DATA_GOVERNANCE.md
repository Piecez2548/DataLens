# Data governance

The uploader records the accountable owner, classification, official HTTPS source, date last verified, decision purpose, and authorization before DataLens accepts a file. These are declarations by the user; DataLens preserves them as evidence but cannot independently certify them.

| Classification | Current policy |
| --- | --- |
| Public | Allowed with authorization and a cited source. |
| Internal | Allowed for authenticated, authorized Nexus users. |
| Confidential | Allowed only when the owner accepts request-only processing and the 4 MiB limit. |
| Restricted or regulated | Out of scope until an organization approves storage, DLP, key management, residency, deletion, and retention controls. |

CSV contents are read into bounded process memory, analyzed, returned, and released at request completion. The application does not create a dataset record or object. The browser keeps results only in React state. Closing/reloading the page or signing out removes that state. Vercel/framework infrastructure may process request bytes according to the hosting provider's platform controls.

The SHA-256 digest identifies the exact uploaded byte sequence. An executive report should be archived by the accountable organization together with the original file under its own records policy.

