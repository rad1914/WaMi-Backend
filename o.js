// @path: o.js
import fs from 'fs'
import path from 'path'

const inputFile = 'backend.txt'

const raw = fs.readFileSync(inputFile, 'utf-8')

const fileBlocks = raw.split(/\/\/\s*@path:\s*(.+)/g).slice(1)

for (let i = 0; i < fileBlocks.length; i += 2) {
  const filePath = fileBlocks[i].trim()
  const fileContent = fileBlocks[i + 1].trimStart()

  const fullPath = path.resolve(filePath)
  const dir = path.dirname(fullPath)

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  fs.writeFileSync(fullPath, fileContent, 'utf-8')
  console.log(`✅ Saved: ${filePath}`)
}
