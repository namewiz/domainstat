#!/usr/bin/env node
import process from 'node:process';
import { createRequire } from 'node:module';
import { Console as NodeConsole } from 'node:console';
import { checkBatchStream } from './index';
import type { AdapterSource, CheckOptions, DomainStatus } from './types';

const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };

type OutputFormat = 'pretty' | 'json';

interface ParsedCliArgs {
  options: CheckOptions;
  domains: string[];
  format: OutputFormat;
  colorPreference?: boolean;
  showHelp: boolean;
  showVersion: boolean;
}

class CliError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CliError';
  }
}

const KNOWN_ADAPTERS: AdapterSource[] = [
  'validator',
  'dns.doh',
  'rdap',
  'rdap.ng',
  'altstatus',
  'altstatus.domainr',
  'altstatus.mono',
  'whois.api',
  'app',
];

function splitFlag(arg: string): { flag: string; inlineValue?: string } {
  if (arg.startsWith('--')) {
    const eq = arg.indexOf('=');
    if (eq !== -1) {
      return { flag: arg.slice(0, eq), inlineValue: arg.slice(eq + 1) };
    }
  }
  return { flag: arg };
}

function readValue(
  argv: string[],
  index: number,
  inlineValue: string | undefined,
  flag: string,
): { value: string; nextIndex: number } {
  if (inlineValue !== undefined) {
    if (!inlineValue) {
      throw new CliError(`Option '${flag}' requires a value`);
    }
    return { value: inlineValue, nextIndex: index + 1 };
  }
  const next = argv[index + 1];
  if (next === undefined) {
    throw new CliError(`Option '${flag}' requires a value`);
  }
  return { value: next, nextIndex: index + 2 };
}

function parseList(flag: string, raw: string): string[] {
  const values = raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (!values.length) {
    throw new CliError(`Option '${flag}' requires at least one value`);
  }
  return values;
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values));
}

function parseNumberMap(flag: string, raw: string): Partial<Record<AdapterSource, number>> {
  const entries = raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (!entries.length) {
    throw new CliError(`Option '${flag}' requires at least one entry in the form adapter=milliseconds`);
  }
  const adapterSet = new Set<string>(KNOWN_ADAPTERS);
  const result: Partial<Record<AdapterSource, number>> = {};
  for (const entry of entries) {
    const [adapter, rawValue] = entry.split('=');
    if (!adapter || rawValue === undefined) {
      throw new CliError(`Invalid format for option '${flag}': '${entry}'. Expected adapter=milliseconds`);
    }
    const trimmedAdapter = adapter.trim();
    if (!adapterSet.has(trimmedAdapter)) {
      throw new CliError(`Unknown adapter '${trimmedAdapter}' supplied to option '${flag}'`);
    }
    const ms = Number(rawValue);
    if (!Number.isFinite(ms) || ms < 0) {
      throw new CliError(`Invalid numeric value '${rawValue}' for adapter '${trimmedAdapter}' in option '${flag}'`);
    }
    result[trimmedAdapter as AdapterSource] = ms;
  }
  return result;
}

function mergeNumberMaps(
  target: Partial<Record<AdapterSource, number>> | undefined,
  source: Partial<Record<AdapterSource, number>>,
): Partial<Record<AdapterSource, number>> {
  return { ...(target ?? {}), ...source };
}

function parseArgs(argv: string[]): ParsedCliArgs {
  const options: CheckOptions = {};
  const domains: string[] = [];
  const only: string[] = [];
  const skip: string[] = [];
  let format: OutputFormat = 'pretty';
  let colorPreference: boolean | undefined;
  let showHelp = false;
  let showVersion = false;
  let tldConfig: CheckOptions['tldConfig'];
  let staggerDelay: CheckOptions['staggerDelay'];
  let timeoutConfig: CheckOptions['timeoutConfig'];
  let apiKeys: NonNullable<CheckOptions['apiKeys']> | undefined;

  let index = 0;
  while (index < argv.length) {
    const arg = argv[index];
    if (arg === '--') {
      domains.push(...argv.slice(index + 1));
      break;
    }

    const { flag, inlineValue } = splitFlag(arg);

    switch (flag) {
      case '-h':
      case '--help':
        showHelp = true;
        index += 1;
        continue;
      case '-v':
      case '--version':
        showVersion = true;
        index += 1;
        continue;
      case '--json':
        format = 'json';
        index += 1;
        continue;
      case '--pretty':
        format = 'pretty';
        index += 1;
        continue;
      case '--color':
        colorPreference = true;
        index += 1;
        continue;
      case '--no-color':
        colorPreference = false;
        index += 1;
        continue;
      case '--verbose':
        options.verbose = true;
        index += 1;
        continue;
      case '--burst':
      case '--parallel':
        options.burstMode = true;
        index += 1;
        continue;
      case '--serial':
        options.burstMode = false;
        index += 1;
        continue;
      case '--cache':
        options.cache = true;
        index += 1;
        continue;
      case '--no-cache':
        options.cache = false;
        index += 1;
        continue;
      case '--skip-rdap':
      case '--no-rdap':
        tldConfig = { ...(tldConfig ?? {}), skipRdap: true };
        index += 1;
        continue;
      default:
        break;
    }

    if (flag === '--concurrency') {
      const { value, nextIndex } = readValue(argv, index, inlineValue, flag);
      const parsed = Number.parseInt(value, 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new CliError(`Option '${flag}' expects a positive integer, received '${value}'`);
      }
      options.concurrency = parsed;
      index = nextIndex;
      continue;
    }

    if (flag === '--only') {
      const { value, nextIndex } = readValue(argv, index, inlineValue, flag);
      only.push(...parseList(flag, value));
      index = nextIndex;
      continue;
    }

    if (flag === '--skip') {
      const { value, nextIndex } = readValue(argv, index, inlineValue, flag);
      skip.push(...parseList(flag, value));
      index = nextIndex;
      continue;
    }

    if (flag === '--domainr-key') {
      const { value, nextIndex } = readValue(argv, index, inlineValue, flag);
      if (!apiKeys) apiKeys = {};
      apiKeys.domainr = value;
      index = nextIndex;
      continue;
    }

    if (flag === '--whoisfreaks-key') {
      const { value, nextIndex } = readValue(argv, index, inlineValue, flag);
      if (!apiKeys) apiKeys = {};
      apiKeys.whoisfreaks = value;
      index = nextIndex;
      continue;
    }

    if (flag === '--whoisxml-key') {
      const { value, nextIndex } = readValue(argv, index, inlineValue, flag);
      if (!apiKeys) apiKeys = {};
      apiKeys.whoisxml = value;
      index = nextIndex;
      continue;
    }

    if (flag === '--rdap-server') {
      const { value, nextIndex } = readValue(argv, index, inlineValue, flag);
      if (!value) {
        throw new CliError(`Option '${flag}' requires a non-empty value`);
      }
      tldConfig = { ...(tldConfig ?? {}), rdapServer: value };
      index = nextIndex;
      continue;
    }

    if (flag === '--stagger-delay') {
      const { value, nextIndex } = readValue(argv, index, inlineValue, flag);
      staggerDelay = mergeNumberMaps(staggerDelay, parseNumberMap(flag, value));
      index = nextIndex;
      continue;
    }

    if (flag === '--timeout') {
      const { value, nextIndex } = readValue(argv, index, inlineValue, flag);
      timeoutConfig = mergeNumberMaps(timeoutConfig, parseNumberMap(flag, value));
      index = nextIndex;
      continue;
    }

    if (arg.startsWith('-')) {
      throw new CliError(`Unknown option '${arg}'`);
    }

    domains.push(arg);
    index += 1;
  }

  if (only.length) {
    options.only = dedupe(only);
  }
  if (skip.length) {
    options.skip = dedupe(skip);
  }
  if (tldConfig) {
    options.tldConfig = tldConfig;
  }
  if (staggerDelay) {
    options.staggerDelay = staggerDelay;
  }
  if (timeoutConfig) {
    options.timeoutConfig = timeoutConfig;
  }
  if (apiKeys && Object.keys(apiKeys).length > 0) {
    options.apiKeys = apiKeys;
  }

  return { options, domains, format, colorPreference, showHelp, showVersion };
}

const RESET = '\u001B[0m';
const STATUS_COLORS: Record<string, string> = {
  unregistered: '\u001B[32m',
  registered: '\u001B[31m',
  unsupported: '\u001B[36m',
  invalid: '\u001B[33m',
  unknown: '\u001B[35m',
};

const STATUS_ICONS: Record<string, string> = {
  unregistered: '🟢',
  registered: '🔴',
  unsupported: '⚪',
  invalid: '⚠️',
  unknown: '❔',
};

function colorize(text: string, colorCode: string, enabled: boolean): string {
  if (!enabled || !colorCode) return text;
  return `${colorCode}${text}${RESET}`;
}

function formatPretty(res: DomainStatus, useColor: boolean): string {
  const icon = STATUS_ICONS[res.availability] ?? '•';
  const color = STATUS_COLORS[res.availability] ?? '';
  const statusText = colorize(res.availability, color, useColor);
  const resolver = res.resolver;
  const latency = res.latencies?.[resolver];
  const latencyText = typeof latency === 'number' && Number.isFinite(latency)
    ? ` in ${Math.round(latency)}ms`
    : '';
  const fineStatus = res.fineStatus ? ` [${res.fineStatus}]` : '';
  const errorText = res.error ? ` error(${res.error.code}): ${res.error.message}` : '';
  return `${icon} ${res.domain}${fineStatus} -> ${statusText} via ${resolver}${latencyText}${errorText}`;
}

function printHelp(stream: NodeJS.WritableStream = process.stdout): void {
  stream.write(
    `domainstat v${version}\n\n` +
      'Usage: domainstat [options] <domain...>\n\n' +
      'Checks the availability of one or more domain names and streams results as they arrive.\n\n' +
      'Options:\n' +
      '  -h, --help                 Show this help message\n' +
      '  -v, --version              Print the installed version\n' +
      '      --json                 Output newline-delimited JSON objects\n' +
      '      --pretty               Force pretty text output (default for TTY)\n' +
      '      --color / --no-color   Force enable or disable ANSI colors\n' +
      '      --concurrency <n>      Maximum concurrent lookups (default 10)\n' +
      '      --burst                Run adapters in parallel (burst mode)\n' +
      '      --serial               Force serial adapter execution\n' +
      '      --only <prefixes>      Comma separated adapter namespace prefixes to allow\n' +
      '      --skip <prefixes>      Comma separated adapter namespace prefixes to skip\n' +
      '      --cache / --no-cache   Enable or disable response caching\n' +
      '      --verbose              Emit adapter logs to stderr\n' +
      '      --domainr-key <key>    Domainr API key\n' +
      '      --whoisfreaks-key <k>  WhoisFreaks API key\n' +
      '      --whoisxml-key <key>   WhoisXML API key\n' +
      '      --rdap-server <url>    Override the RDAP server URL\n' +
      '      --skip-rdap            Skip RDAP lookups\n' +
      '      --timeout a=ms,...     Abort adapters after the given milliseconds\n' +
      '      --stagger-delay a=ms,...     Delay before launching the next adapter in serial mode\n' +
      '\nEnvironment variables:\n' +
      '  DOMAINSTAT_DOMAINR_KEY, DOMAINSTAT_WHOISFREAKS_KEY, DOMAINSTAT_WHOISXML_KEY\n' +
      '  provide default API keys when the corresponding flags are omitted.\n',
  );
}

function getEnvApiKeys(): NonNullable<CheckOptions['apiKeys']> {
  const envKeys: NonNullable<CheckOptions['apiKeys']> = {};
  if (process.env.DOMAINSTAT_DOMAINR_KEY) {
    envKeys.domainr = process.env.DOMAINSTAT_DOMAINR_KEY;
  }
  if (process.env.DOMAINSTAT_WHOISFREAKS_KEY) {
    envKeys.whoisfreaks = process.env.DOMAINSTAT_WHOISFREAKS_KEY;
  }
  if (process.env.DOMAINSTAT_WHOISXML_KEY) {
    envKeys.whoisxml = process.env.DOMAINSTAT_WHOISXML_KEY;
  }
  return envKeys;
}

async function run(): Promise<void> {
  let parsed: ParsedCliArgs;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (err) {
    if (err instanceof CliError) {
      console.error(`domainstat: ${err.message}`);
      process.exitCode = 1;
      return;
    }
    throw err;
  }

  if (parsed.showHelp) {
    printHelp();
    return;
  }

  if (parsed.showVersion) {
    process.stdout.write(`${version}\n`);
    return;
  }

  if (!parsed.domains.length) {
    console.error('domainstat: no domains provided.');
    printHelp(process.stderr);
    process.exitCode = 1;
    return;
  }

  const envApiKeys = getEnvApiKeys();
  if (Object.keys(envApiKeys).length > 0 || parsed.options.apiKeys) {
    parsed.options.apiKeys = {
      ...envApiKeys,
      ...(parsed.options.apiKeys ?? {}),
    };
  }
  if (parsed.options.apiKeys && Object.keys(parsed.options.apiKeys).length === 0) {
    delete parsed.options.apiKeys;
  }

  if (parsed.options.verbose) {
    const stderrConsole = new NodeConsole({ stdout: process.stderr, stderr: process.stderr });
    parsed.options.logger = stderrConsole as unknown as Console;
  }

  const defaultColor = process.stdout.isTTY && !('NO_COLOR' in process.env);
  const useColor = parsed.format === 'json' ? false : parsed.colorPreference ?? defaultColor;

  try {
    for await (const res of checkBatchStream(parsed.domains, parsed.options)) {
      if (parsed.format === 'json') {
        process.stdout.write(`${JSON.stringify(res)}\n`);
      } else {
        process.stdout.write(`${formatPretty(res, useColor)}\n`);
      }
    }
  } catch (err) {
    if (err instanceof CliError) {
      console.error(`domainstat: ${err.message}`);
    } else if (err instanceof Error) {
      console.error(`domainstat: ${err.message}`);
    } else {
      console.error('domainstat: unexpected error', err);
    }
    process.exitCode = 1;
    return;
  }
}

run().catch((err) => {
  if (err instanceof Error) {
    console.error(`domainstat: ${err.message}`);
  } else {
    console.error('domainstat: unexpected error', err);
  }
  process.exitCode = 1;
});

