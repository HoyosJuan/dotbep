// part of: node --experimental-strip-types examples/run-all.ts  (use --05 to stop here)
//
// Covers: standards.
//
// Standards are the normative documents embedded inside the .bep zip — the
// naming conventions, export guidelines, and BIM requirements that govern how
// the project must be executed. Each standard is a markdown file stored at an
// auto-generated path inside the zip.
//
// Unlike other entities, standards carry file content in addition to metadata.
// The add() call takes content as a markdown string; the core writes it to the
// zip and stores the path in the entity. getContent/setContent read and overwrite
// that file. remove() also deletes the .md file from the zip.
//
// This dual nature — entity record + embedded file — is what makes standards
// versionable: the history system snapshots the .md file alongside bep.json
// whenever it changes between commits.

import { readFileSync, writeFileSync } from 'node:fs'
import { Bep } from '../dist/index.js'

const bep = await Bep.open(readFileSync('examples/example.bep'))

// ─── Standards ────────────────────────────────────────────────────────────────

// add() auto-generates a UUID path for each standard and writes the markdown
// content to the zip immediately. The returned entity carries contentPath so
// callers can see where the file lives inside the archive.
const stdAdded = bep.standards.add([
  { name: 'Naming Convention', content: '# Naming Convention\nAll files must follow ISO 19650 naming.' },
  { name: 'IFC Export Guide',  content: '# IFC Export Guide\nUse IFC4 Reference View profile.'        },
  { name: 'BIM Requirements',  content: '# BIM Requirements\nMinimum LOD per phase defined below.'    },
])
const stdNamingId = stdAdded.succeeded[0].id
const stdIfcId    = stdAdded.succeeded[1].id
const stdBimId    = stdAdded.succeeded[2].id
console.log('add succeeded:', stdAdded.succeeded.map(s => s.name))
console.log('content paths:', stdAdded.succeeded.map(s => s.contentPath))  // uuid-based paths in zip

// getContent — reads the .md file from inside the zip
const namingContent = await bep.standards.getContent(stdNamingId)
console.log('\ngetContent (first 45 chars):', namingContent.slice(0, 45))

// setContent — overwrites the .md file in the zip; no append, caller owns the full string
bep.standards.setContent(stdNamingId, '# Naming Convention v2\nRevised rules after client review.')
const updated = await bep.standards.getContent(stdNamingId)
console.log('after setContent (first 45 chars):', updated.slice(0, 45))

// remove — also deletes the corresponding .md file from the zip
const stdRemoved = bep.standards.remove([stdIfcId, 'ghost-std'])
console.log('\nremove succeeded:', stdRemoved.succeeded)
console.log('remove failed:   ', stdRemoved.failed)

console.log('standards remaining:', bep.standards.list().map(s => s.name))
// → ['Naming Convention', 'BIM Requirements']

// ─── Save ─────────────────────────────────────────────────────────────────────

writeFileSync('examples/example.bep', await bep.save())
console.log('\nSaved → examples/example.bep')
