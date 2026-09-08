# Data governance

Users must attest that they are authorized and that the file is synthetic or confirmed non-personal before upload. Before final approval, they must record the accountable owner, classification, official HTTPS source where required, date checked by the owner, decision purpose, and authorization. These are declarations by the user; DataLens records them in signed event evidence but cannot independently certify them.

| Classification | Current policy |
| --- | --- |
| Synthetic or confirmed non-personal | Allowed for authenticated, authorized Nexus users. |
| Personal, confidential, restricted, sensitive, or regulated | Out of scope until the privacy, contract, security, residency, deletion, retention, and legal gates in the readiness report are approved. |

CSV contents are read through the framework, analyzed, returned, and released at request completion. The application does not create a dataset record or object. The browser keeps results only in React state. Closing/reloading the page or signing out removes that state. Framework/hosting infrastructure can use transient memory or temporary storage; provider behavior must be verified before the policy is expanded.

The SHA-256 digest identifies the exact uploaded byte sequence. An executive report should be archived by the accountable organization together with the original file under its own records policy.
