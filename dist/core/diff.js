import * as Diff from "diff";
// ---------------------------------------------------------------------------
// Unified diff patch parsing
//
// Parses git/unified diff strings (output of `git diff`, `Diff.formatPatch`,
// or similar) into our internal ParsedDiff representation. Preserves hunk
// function context from hunk headers.
//
// Handles these formats:
//   diff --git a/file.ts b/file.ts \n --- a/file.ts \n +++ b/file.ts
//   --- a/file.ts \n +++ b/file.ts  (no diff --git prefix)
//   @@ -start,count +start,count @@ func_name (with or without func context)
// ---------------------------------------------------------------------------
/**
 * Parse a unified diff/patch string into one or more ParsedDiff.
 * Each file in the patch gets its own entry.
 */
export function parsePatchFiles(patch) {
    if (!patch.trim())
        return [];
    // Split into file sections
    const lines = patch.split("\n");
    const sections = [];
    let cur = [];
    // Split by "+++ " or "diff --git " (start of a new file)
    for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        if (l.startsWith("diff --git ") || (l.startsWith("--- ") && cur.length > 0 && cur[0]?.startsWith("+++"))) {
            if (cur.length > 0)
                sections.push(cur);
            cur = [];
        }
        cur.push(l);
    }
    if (cur.length > 0)
        sections.push(cur);
    const result = [];
    for (const sec of sections) {
        const parsed = parseOneFile(sec);
        if (parsed)
            result.push(parsed);
    }
    return result.length > 0 ? result : [parseOneFile(lines) ?? emptyDiff()];
}
/** Parse a single file section into a ParsedDiff. */
function parseOneFile(lines) {
    const all = [];
    let added = 0, removed = 0;
    let i = 0;
    while (i < lines.length) {
        const raw = lines[i];
        const hdr = parseHunkHeader(raw);
        if (!hdr) {
            i++;
            continue;
        }
        // Emit sep for this hunk's metadata (synthetic at position 0 for first)
        if (all.length === 0 || all.filter((l) => l.type !== "sep").length > 0) {
            // After some non-sep content, push a sep for the next hunk
            all.push({ type: "sep", oldNum: null, newNum: null, content: "", hunkMeta: hdr });
        }
        else {
            // Already have only seps (first hunk) — update the last sep's metadata
            all[all.length - 1] = { type: "sep", oldNum: null, newNum: null, content: "", hunkMeta: hdr };
        }
        let oL = hdr.oldStart;
        let nL = hdr.newStart;
        // Advance past the hunk header
        i++;
        // Process hunk content lines (until next hunk header or end)
        while (i < lines.length) {
            const line = lines[i];
            if (line.startsWith("@@"))
                break; // next hunk header — outer loop handles it
            if (line.startsWith("\\ ")) {
                i++;
                continue; // "\\ No newline at end of file"
            }
            if (/^(---|\+\+\+|diff --git|index |new file|old mode|new mode|deleted|rename|similarity|copy)/.test(line)) {
                i++;
                continue; // skip headers/metadata
            }
            if (line.length === 0 || line[0] === " ") {
                all.push({ type: "ctx", oldNum: oL++, newNum: nL++, content: line.slice(1) });
            }
            else if (line[0] === "+") {
                all.push({ type: "add", oldNum: null, newNum: nL++, content: line.slice(1) });
                added++;
            }
            else if (line[0] === "-") {
                all.push({ type: "del", oldNum: oL++, newNum: null, content: line.slice(1) });
                removed++;
            }
            i++;
        }
    }
    if (all.length === 0)
        return null;
    // Compute chars from content lines only (not seps)
    let chars = 0;
    for (const l of all) {
        if (l.type !== "sep")
            chars += l.content.length;
    }
    return { lines: all, added, removed, chars };
}
/**
 * Parse a hunk header line like:
 *   @@ -oldStart,oldCount +newStart,newCount @@ optional func context
 */
function parseHunkHeader(line) {
    const m = line.match(/^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@(?:\s+(.*))?$/);
    if (!m)
        return null;
    const oldStart = Number(m[1]);
    const oldLines = m[2] ? Number(m[2]) : 1;
    const newStart = Number(m[3]);
    const newLines = m[4] ? Number(m[4]) : 1;
    const context = m[5]?.trim() || undefined;
    return { oldStart, oldLines, newStart, newLines, context };
}
function emptyDiff() {
    return { lines: [], added: 0, removed: 0, chars: 0 };
}
let _sepStyle = "auto";
/**
 * Resolve hunk separator style from env var PI_DIFF_SEP_STYLE.
 * Call once during extension init, or with force=true to re-read.
 */
export function resolveSepStyle() {
    const fromEnv = process.env.PI_DIFF_SEP_STYLE;
    if (fromEnv && ["auto", "simple", "gap", "context", "metadata"].includes(fromEnv)) {
        _sepStyle = fromEnv;
    }
    else {
        _sepStyle = "auto";
    }
    return _sepStyle;
}
/**
 * Get the current separator style (resolved once via resolveSepStyle()).
 */
export function getSepStyle() {
    return _sepStyle;
}
/**
 * Generate a hunk separator label for the unified view.
 * Returns the full label including spacing, or an empty string when no useful label exists.
 * If `content` is non-empty, it is used directly (e.g. "───── Edit 2 ─────").
 */
export function sepLabelUnified(style, hunkMeta, gap, content) {
    // Custom content (e.g. multi-edit separators) takes precedence
    if (content)
        return ` ${content} `;
    const ctx = hunkMeta?.context;
    switch (style) {
        case "simple":
            return "";
        case "gap":
            if (gap && gap > 0)
                return ` ${gap} unmodified lines `;
            return "";
        case "context":
            if (ctx)
                return ` ${ctx} `;
            if (gap && gap > 0)
                return ` ${gap} unmodified lines `;
            return "";
        case "metadata":
            if (ctx)
                return ` ${ctx} `;
            if (gap && gap > 0)
                return ` +${gap} lines `;
            return "";
        default:
            if (ctx && gap && gap > 0)
                return ` ${ctx} — +${gap} lines `;
            if (ctx)
                return ` ${ctx} `;
            if (gap && gap > 0)
                return ` +${gap} lines `;
            return "";
    }
}
/**
 * Generate a hunk separator label for the split view.
 * Returns useful context/gap labels without decorative ellipses.
 * If `content` is non-empty, it is used directly (e.g. "───── Edit 2 ─────").
 */
export function sepLabelSplit(style, hunkMeta, gap, content) {
    // Custom content (e.g. multi-edit separators) takes precedence
    if (content)
        return `${content}`;
    const ctx = hunkMeta?.context;
    switch (style) {
        case "simple":
            return "";
        case "gap":
            if (gap && gap > 0)
                return ` ${gap} lines `;
            return "";
        case "context":
            if (ctx && gap && gap > 0)
                return ` ${ctx} — ${gap} lines `;
            if (ctx)
                return ` ${ctx} `;
            if (gap && gap > 0)
                return ` ${gap} lines `;
            return "";
        case "metadata":
            if (ctx)
                return ` ${ctx} `;
            if (gap && gap > 0)
                return ` ${gap} lines `;
            return "";
        default:
            if (ctx && gap && gap > 0)
                return ` ${ctx} — +${gap} lines `;
            if (ctx)
                return ` ${ctx} `;
            if (gap && gap > 0)
                return ` +${gap} lines `;
            return "";
    }
}
/**
 * Walk a ParsedDiff and extract hunk blocks.
 * Each block is a group of consecutive deletes followed by consecutive adds.
 * Context and separator lines are skipped.
 */
export function computeHunkBlocks(diff) {
    const blocks = [];
    let i = 0;
    const lines = diff.lines;
    while (i < lines.length) {
        if (lines[i].type === "sep" || lines[i].type === "ctx") {
            i++;
            continue;
        }
        // Collect consecutive deletions
        const deletions = [];
        while (i < lines.length && lines[i].type === "del") {
            deletions.push(lines[i]);
            i++;
        }
        // Collect consecutive additions
        const additions = [];
        while (i < lines.length && lines[i].type === "add") {
            additions.push(lines[i]);
            i++;
        }
        if (deletions.length === 0 && additions.length === 0)
            continue;
        blocks.push({ deletions, additions });
    }
    return blocks;
}
export function parseDiff(oldContent, newContent, ctx = 3) {
    const patch = Diff.structuredPatch("", "", oldContent, newContent, "", "", { context: ctx });
    const lines = [];
    let added = 0;
    let removed = 0;
    for (let hi = 0; hi < patch.hunks.length; hi++) {
        const h = patch.hunks[hi];
        const meta = {
            oldStart: h.oldStart,
            oldLines: h.oldLines,
            newStart: h.newStart,
            newLines: h.newLines,
        };
        // Emit hunk metadata as a synthetic sep (position 0 for first hunk,
        // between-hunk sep for subsequent). This ensures every hunk has metadata.
        if (hi > 0) {
            const prev = patch.hunks[hi - 1];
            const gap = h.oldStart - (prev.oldStart + prev.oldLines);
            lines.push({ type: "sep", oldNum: null, newNum: gap > 0 ? gap : null, content: "", hunkMeta: meta });
        }
        else {
            lines.push({ type: "sep", oldNum: null, newNum: null, content: "", hunkMeta: meta });
        }
        let oL = h.oldStart;
        let nL = h.newStart;
        for (const raw of h.lines) {
            if (raw === "\\ No newline at end of file")
                continue;
            const ch = raw[0];
            const text = raw.slice(1);
            if (ch === "+") {
                lines.push({ type: "add", oldNum: null, newNum: nL++, content: text });
                added++;
            }
            else if (ch === "-") {
                lines.push({ type: "del", oldNum: oL++, newNum: null, content: text });
                removed++;
            }
            else {
                lines.push({ type: "ctx", oldNum: oL++, newNum: nL++, content: text });
            }
        }
    }
    return { lines, added, removed, chars: oldContent.length + newContent.length };
}
//# sourceMappingURL=diff.js.map