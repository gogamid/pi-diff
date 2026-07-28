/**
 * Cascading text replacement engine for LLM edit tools.
 *
 * When an LLM calls the edit tool with oldString + newString, the oldString
 * often doesn't match exactly due to:
 *   - Whitespace differences (indentation, trailing spaces)
 *   - Escape sequences (LLMs escaping \n, \t, quotes in tool call params)
 *   - Minor formatting drift (tabs vs spaces, trimmed lines)
 *
 * This module provides a cascade of replacer strategies, each progressively
 * more lenient. The first strategy that finds exactly one match wins.
 * If multiple candidates exist for a fuzzy strategy, we reject (safety first).
 *
 * Design inspired by OpenCode's edit tool (anomalyco/opencode) and
 * Cline's diff-apply evals, but restructured for independent use.
 */
export interface ReplaceResult {
    /** The resulting content after replacement (unchanged if no match). */
    content: string;
    /** Whether a replacement was made. */
    changed: boolean;
    /** Name of the replacer strategy that matched, or "none". */
    strategy: string;
    /** Number of occurrences replaced (only when changed=true). */
    count: number;
}
/**
 * Replace oldString with newString in content using a cascade of matching
 * strategies. Tries exact match first, then progressively relaxes matching
 * rules. If no strategy finds a match, returns unchanged content.
 *
 * Safety: if a fuzzy strategy finds multiple candidates, it is skipped
 * (we never auto-pick among ambiguous matches). Only exact matches
 * (SimpleReplacer) are allowed to match multiple occurrences, and only
 * when replaceAll=true.
 *
 * @param content - The full file content to edit.
 * @param oldString - The text to find and replace.
 * @param newString - The replacement text.
 * @param options.replaceAll - When true, replace ALL non-overlapping
 *   occurrences. Only safe for exact matches (simple replacer).
 * @returns ReplaceResult with the new content and match strategy info.
 */
export declare function replace(content: string, oldString: string, newString: string, options?: {
    replaceAll?: boolean;
}): ReplaceResult;
/**
 * Conservative matcher for source mutations: exact text first, then one
 * unambiguous block whose only difference is a uniform indentation shift.
 * Unlike `replace`, it never guesses from similar content or normalizes
 * whitespace inside source tokens.
 */
export declare function replaceForPatch(content: string, oldText: string, newText: string): ReplaceResult;
//# sourceMappingURL=replace.d.ts.map