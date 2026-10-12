import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: { ignoreBuildErrors: false },
  // O projeto pode viver fora de um repo git; sem isso o Next sobe procurando
  // lockfile na home e avisa no console.
  outputFileTracingRoot: __dirname,
}

export default nextConfig
