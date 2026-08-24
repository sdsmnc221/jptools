import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { ShimError } from "jpt-commons/errors";

export async function readTemplate(relativePath) {
  const url = new URL(relativePath, import.meta.url);
  return readFile(fileURLToPath(url), "utf8");
}

/**
 * Expand `{{NAME}}` placeholders. Unknown placeholders are an error rather than
 * being left in the output, so a typo cannot silently ship a broken entry file.
 */
export function fill(template, values) {
  return template.replace(/\{\{\s*([A-Z0-9_]+)\s*\}\}/g, (_, key) => {
    if (!(key in values))
      throw new ShimError(`Template placeholder {{${key}}} has no value`);
    return values[key];
  });
}

/**
 * Replace exactly one <script> tag in an HTML document.
 *
 * This is the core of entry substitution: the game's own index.html is the
 * starting point, and only the boot script is swapped. Everything else is
 * carried through untouched.
 *
 * Matching exactly once is deliberate. Zero matches means the export does not
 * look the way the adapter expects; more than one means the document is
 * ambiguous. I'd refuse both.
 */
export function replaceScriptTag(html, srcSubstring, replacement) {
  const pattern = new RegExp(
    `[ \\t]*<script\\b[^>]*\\bsrc\\s*=\\s*["'][^"']*${escapeRegExp(srcSubstring)}["'][^>]*>\\s*</script>\\s*\\n?`,
    "gi",
  );
  const matches = html.match(pattern);
  if (!matches)
    throw new ShimError(
      `No <script src="...${srcSubstring}"> tag found in the entry HTML`,
    );
  if (matches.length > 1) {
    throw new ShimError(
      `Expected exactly one <script src="...${srcSubstring}"> tag, found ${matches.length}`,
    );
  }
  return html.replace(pattern, replacement);
}

/**
 * Insert `<base href="...">` as the first thing in <head>.
 *
 * Needed when the entry file does not sit in the game root: the shim
 * lives in `<game>/shim/index-patch.html`, so every relative URL inherited from
 * the game's own markup would otherwise resolve one directory too deep.
 *
 * A <base> fixes all of them at once, and crucially also fixes URLs the HTML
 * cannot reach: Construct resolves its asset and Worker URLs against
 * `document.baseURI` at runtime, as does `fetch()` in the boot fragment.
 */
export function injectBase(html, href) {
  if (/<base\b[^>]*\bhref\s*=/i.test(html)) {
    throw new ShimError(
      "The entry HTML already declares a <base href>; the shim cannot safely add another",
    );
  }
  const headOpen = html.match(/<head\b[^>]*>/i);
  if (!headOpen)
    throw new ShimError("The entry HTML has no <head> to insert <base> into");
  const at = headOpen.index + headOpen[0].length;
  return html.slice(0, at) + `\n  <base href="${href}">` + html.slice(at);
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function injectBefore(anchor, tag) {
  return { key: anchor, value: tag + anchor };
}

export function injectAfter(anchor, tag) {
  return { key: anchor, value: anchor + tag };
}
