import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { Client } from 'basic-ftp'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const envFile = path.join(root, '.env.deploy')

const fail = (message) => {
  console.error(message)
  process.exit(1)
}

const loadEnvFile = (filePath) => {
  if (!fs.existsSync(filePath)) return
  const text = fs.readFileSync(filePath, 'utf8')
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = value
  }
}

const readSecure = () => {
  const raw = (process.env.FTP_SECURE || 'false').trim().toLowerCase()
  if (raw === 'false' || raw === '') return false
  if (raw === 'true' || raw === 'explicit') return true
  if (raw === 'implicit') return 'implicit'
  fail('FTP_SECURE must be false, true, or implicit.')
}

const readRemoteDir = () => {
  const raw = (process.env.FTP_REMOTE_DIR || '').trim().replace(/\\/g, '/')
  const parts = raw.split('/').filter(Boolean)
  if (
    !raw ||
    raw === '/' ||
    parts.length === 0 ||
    parts.some((part) => part === '.' || part === '..')
  ) {
    fail('FTP_REMOTE_DIR must be a specific folder, not the FTP root.')
  }
  return `${raw.startsWith('/') ? '/' : ''}${parts.join('/')}`
}

const readParallel = () => {
  const raw = (process.env.FTP_PARALLEL || '4').trim()
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 1 || value > 8) {
    fail('FTP_PARALLEL must be an integer from 1 to 8.')
  }
  return value
}

const build = () => {
  const result = spawnSync('pnpm', ['build'], { cwd: root, stdio: 'inherit' })
  if (result.status !== 0) process.exit(result.status ?? 1)
  if (!fs.existsSync(path.join(root, 'dist', 'index.html'))) {
    fail('Build finished without dist/index.html.')
  }
}

const connect = async (options) => {
  const client = new Client(120_000)
  await client.access(options)
  return client
}

const listEntries = async (client) =>
  (await client.list()).filter((entry) => entry.name && entry.name !== '.' && entry.name !== '..')

const deleteEntry = async (client, entry) => {
  if (entry.isDirectory) {
    await client.removeDir(entry.name)
    return
  }
  try {
    await client.remove(entry.name)
  } catch {
    await client.removeDir(entry.name)
  }
}

const emptyWorkingDir = async (client, remotePath) => {
  console.log(`Emptying ${remotePath}`)
  let removed = 0
  for (let pass = 0; pass < 8; pass++) {
    const entries = await listEntries(client)
    if (entries.length === 0) {
      console.log(`Removed ${removed} items from ${remotePath}`)
      return
    }
    for (const entry of entries) {
      console.log(`delete ${entry.name}`)
      await deleteEntry(client, entry)
      removed++
    }
  }
  const left = await listEntries(client)
  if (left.length > 0) {
    fail(`Could not empty ${remotePath}. Remaining: ${left.map((entry) => entry.name).join(', ')}`)
  }
}

const collectFiles = (dir, prefix = '') => {
  const files = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const remote = prefix ? `${prefix}/${entry.name}` : entry.name
    const local = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...collectFiles(local, remote))
    else if (entry.isFile()) files.push({ local, remote })
  }
  return files
}

const ensureRemoteDirs = async (client, remotePath, files) => {
  const dirs = [
    ...new Set(files.map((file) => path.posix.dirname(file.remote)).filter((dir) => dir !== '.')),
  ].sort((a, b) => a.split('/').length - b.split('/').length)

  for (const dir of dirs) {
    await client.cd(remotePath)
    await client.ensureDir(dir)
  }
  await client.cd(remotePath)
}

const uploadFiles = async (options, remotePath, files, parallel) => {
  const workers = Math.min(parallel, files.length)
  let cursor = 0
  let done = 0
  console.log(`Uploading ${files.length} files, ${workers} at a time`)

  const worker = async () => {
    const client = await connect(options)
    let cwd = ''
    try {
      while (cursor < files.length) {
        const file = files[cursor++]
        const parent = path.posix.dirname(file.remote)
        const targetDir = parent === '.' ? remotePath : path.posix.join(remotePath, parent)
        if (cwd !== targetDir) {
          await client.cd(targetDir)
          cwd = targetDir
        }
        await client.uploadFrom(file.local, path.posix.basename(file.remote))
        done++
        console.log(`upload ${done}/${files.length} ${file.remote}`)
      }
    } finally {
      client.close()
    }
  }

  await Promise.all(Array.from({ length: workers }, () => worker()))
}

const upload = async ({ host, port, user, password, secure, remoteDir, parallel }) => {
  const options = { host, port, user, password, secure }
  const client = await connect(options)
  let remotePath
  let files
  try {
    await client.ensureDir(remoteDir)
    remotePath = await client.pwd()
    if (remotePath === '/') fail('Refusing to replace the FTP root.')
    await emptyWorkingDir(client, remotePath)
    files = collectFiles(path.join(root, 'dist'))
    await ensureRemoteDirs(client, remotePath, files)
  } finally {
    client.close()
  }
  await uploadFiles(options, remotePath, files, parallel)
  console.log(`Deployed to ${host}${remotePath}`)
}

loadEnvFile(envFile)

const host = process.env.FTP_HOST?.trim()
const user = process.env.FTP_USER?.trim()
const password = process.env.FTP_PASSWORD ?? ''
const port = Number(process.env.FTP_PORT || 21)
const secure = readSecure()
const parallel = readParallel()
const remoteDir = process.env.FTP_REMOTE_DIR?.trim() ? readRemoteDir() : ''

if (!host || !user || !password || !remoteDir || !Number.isInteger(port) || port <= 0) {
  fail(
    'Missing FTP settings. Copy .env.deploy.example to .env.deploy and fill in the server login. That file stays on this machine and is not committed.'
  )
}

build()
await upload({ host, port, user, password, secure, remoteDir, parallel })
