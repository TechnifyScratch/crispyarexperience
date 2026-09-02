import {cp, mkdir} from 'node:fs/promises'
import {resolve} from 'node:path'

const source = resolve('node_modules/@8thwall/engine-binary/dist')
const destination = resolve('public/vendor/8thwall')

await mkdir(destination, {recursive: true})
await cp(source, destination, {recursive: true, force: true})

