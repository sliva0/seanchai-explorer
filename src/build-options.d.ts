// What a build is asked for beyond its mode: constants vite.config.ts defines from the environment, each replaced by
// its value where the code names it, so that a branch the build does not take, and every text only it uses, is left
// out of what it ships. Named as the globals they are, not imported, for the bundler to see each condition's value
// where it is written: a constant imported from another module it does not resolve when it leaves out unused code.
// The unit tests set them on globalThis (tests/setup.mjs, and a test of another build before it boots the site).

/**
 * `SEANCHAI_UNLINKED=1`: a site that names nothing of the open-source project, no GitHub or PyPI, no link to either,
 * no introduction of the site, and no command installing anything from them.
 */
declare const SEANCHAI_UNLINKED: boolean;

/**
 * The addresses the site counts as its own, normal, the first the one on the marked line of the Wireshark plugin it
 * ships, `local EXPLORER = "…" -- seanchai:explorer`: `SEANCHAI_EXPLORER_URLS`, else that line's address as seanchai
 * wrote it, else none. Viewed at one of them, the Wireshark page offers the plugin as served once the served file's
 * line says the first. A `SEANCHAI_UNLINKED=1` build asked for none has none, so that no chunk spells the public
 * site its plugin's line holds.
 */
declare const SEANCHAI_EXPLORER_ADDRESSES: readonly string[];
