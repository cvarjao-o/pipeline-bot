import * as child_process from 'child_process'

export class OpenshiftClientTool {
  public static spawn(args: string[], options?: child_process.SpawnOptions): child_process.ChildProcess {
    const p:any[] = [];
    p.push('oc')
    p.push(args)
    p.push(options)
    return child_process.spawn.apply(null, p as [string, readonly string[], child_process.SpawnOptions]);
  }
}