interface NpmRunInvocationOptions {
  readonly nodeExecutable: string
  readonly npmEntryPoint: string
  readonly script: string
  readonly args: ReadonlyArray<string>
}

interface CommandInvocation {
  readonly command: string
  readonly args: ReadonlyArray<string>
}

export const createNpmRunInvocation = (
  options: NpmRunInvocationOptions,
): CommandInvocation => ({
  command: options.nodeExecutable,
  args: [
    options.npmEntryPoint,
    "run",
    "--silent",
    options.script,
    "--",
    ...options.args,
  ],
})
