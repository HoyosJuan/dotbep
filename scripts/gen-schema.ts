import { z } from 'zod'
import { writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { join, dirname } from 'path'
import { BEPSchema, ChangelogSchema } from '../core/src/types/schema.ts'

const output = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'DotBEP Schema',
  description: 'Open format for authoring BIM Execution Plans programmatically.',
  bep:       z.toJSONSchema(BEPSchema),
  changelog: z.toJSONSchema(ChangelogSchema),
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outPath = join(root, 'bep.schema.json')
writeFileSync(outPath, JSON.stringify(output, null, 2))
console.log(`Generated: bep.schema.json`)
