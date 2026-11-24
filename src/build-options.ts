// What a build is asked for beyond its mode, fixed when it is built: vite.config.ts defines each from the environment,
// so a branch the build does not take, and the words in it, are left out of what it ships.

declare const SEANCHAI_UNLINKED: boolean | undefined;

/**
 * `SEANCHAI_UNLINKED=1`: a site that names nothing of the open-source project, no GitHub or PyPI, no link to either, no
 * introduction of the site, and no command installing anything from them. Unit tests set the global before booting.
 */
export const UNLINKED = typeof SEANCHAI_UNLINKED !== 'undefined' && SEANCHAI_UNLINKED === true;
