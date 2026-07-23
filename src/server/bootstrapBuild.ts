/**
 * Name of the throwaway build the Lua bridge loads to prove HeadlessWrapper came
 * up. It is not user work, so guards that protect unsaved builds must not mistake
 * it for one.
 *
 * Kept in its own module so guards can import it without pulling in the bridge
 * lifecycle (which uses `import.meta` and cannot load under the CommonJS tests).
 */
export const BOOTSTRAP_BUILD_NAME = 'Init Test';
