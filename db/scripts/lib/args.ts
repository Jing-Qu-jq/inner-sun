// Minimal flag parsing for the db CLI scripts. Nothing here needs an argument parser
// dependency: the scripts take a handful of boolean flags and no positional arguments.
//
// Note the `--` when invoking through npm:  npm run db:seed -- --fake

/** True when `--<name>` appears in the arguments this script was invoked with. */
export function hasFlag(name: string): boolean {
  return process.argv.slice(2).includes(`--${name}`);
}
