import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"

// The documents are written by hand; these checks keep them from silently rotting:
// the module map must name every source file, and every link must lead somewhere.
const ROOT = path.resolve(import.meta.dirname, "..", "..")
const read = (name) => fs.readFileSync(path.join(ROOT, name), "utf8")

function sourceFiles(dir = "src") {
  return fs.readdirSync(path.join(ROOT, dir), {withFileTypes: true}).flatMap((e) => (e.isDirectory() ? sourceFiles(path.join(dir, e.name)) : e.name.endsWith(".js") ? [path.join(dir, e.name)] : []))
}

test("ARCHITECTURE.md names every source file", () => {
  const doc = read("ARCHITECTURE.md")
  const missing = sourceFiles().filter((f) => !doc.includes(f))
  assert.deepEqual(missing, [], "add these files to the module map in ARCHITECTURE.md")
})

test("the documents link only to files that exist", () => {
  for (const name of ["ARCHITECTURE.md", "FEATURES.md"]) {
    const doc = read(name)
    for (const [, target] of doc.matchAll(/\]\(([^)#\s]+)\)/g)) {
      if (/^[a-z]+:/i.test(target)) continue // external link
      assert.ok(fs.existsSync(path.join(ROOT, target)), `${name} links to a missing ${target}`)
    }
  }
})

test("README points at the documents", () => {
  const readme = read("README.md")
  for (const name of ["INTERFACE.md", "ARCHITECTURE.md", "FEATURES.md"]) assert.match(readme, new RegExp(name.replace(".", "\\.")), `README should mention ${name}`)
})
