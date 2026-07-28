// SPDX-License-Identifier: MIT
// Block edit tool calls when oldText is not present in the target file.
// Forces the model to re-read the file before editing instead of guessing
// stale oldText and getting caught in repeated retry loops.
import { readFileSync } from "node:fs";
const guardEditToolCall = async (event, _ctx) => {
    const { path, edits } = event.input;
    if (!edits || !Array.isArray(edits))
        return;
    let fileContent;
    try {
        fileContent = readFileSync(path, "utf8");
    }
    catch {
        return;
    }
    for (const edit of edits) {
        if (!fileContent.includes(edit.oldText)) {
            return {
                block: true,
                reason: `oldText not found in ${path}. Re-read the file and copy the exact text (edit protocol: VERIFY before EDIT).`,
            };
        }
    }
};
export function registerEditGuard(pi) {
    if (pi == null)
        return;
    const on = pi.on;
    if (typeof on !== "function")
        return;
    pi.on("tool_call", guardEditToolCall);
}
//# sourceMappingURL=edit-guard.js.map