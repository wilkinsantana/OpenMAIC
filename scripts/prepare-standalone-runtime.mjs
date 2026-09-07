#!/usr/bin/env node
// Keep operator-owned runtime configuration outside replaceable Next builds.
// Run from the application root before activating a standalone build.
import { existsSync, lstatSync, rmSync, symlinkSync } from 'node:fs';
import { resolve, join } from 'node:path';
const root = process.cwd();
const destination = resolve(process.argv[2] || '.next/standalone');
if (!existsSync(join(destination, 'server.js'))) throw new Error('Standalone server.js not found');
for (const name of [
  '.env',
  '.env.production',
  '.env.local',
  '.env.production.local',
  'server-providers.yml',
]) {
  const source = join(root, name);
  const target = join(destination, name);
  if (!existsSync(source)) continue;
  if (source === target)
    throw new Error('Runtime configuration source and destination must differ');
  try {
    if (lstatSync(target).isDirectory()) throw new Error('Configuration target is a directory');
    rmSync(target);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  symlinkSync(source, target);
  console.log(`Linked runtime configuration: ${name}`);
}
