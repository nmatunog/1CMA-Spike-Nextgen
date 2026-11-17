# Existing SPIKE verifier

JavaScript files in this directory, including the local memory-admin test adapter,
are byte-identical copies of `functions/_shared/versaCode/` from
`nmatunog/SPIKE` commit `482c31ced71096a9edc1d732af58bffcee4f0c6f`.
Only the modules needed by the existing verifier and its synthetic adapter are included.

`lib/member/verifier.ts` calls `verify()` without redemption; it never calls `redeem()`.
Upstream verification can record failed attempts and rate counters through its adapter;
it is not side-effect-free. Those writes are confined to memory in this demo.
The demo's synthetic inventory is local only. A real authoritative inventory
adapter remains an open dependency. This copy does not replace SPIKE's L1/L2 gates.
