import { parse } from "querystring";


export class Factory {
  public static asWorkflows(items:Array<any>) : Workflows {
    const workflows = new Workflows();
    for (let workflow of items) {
      workflows.push(Factory.asWorkflow(workflow));
    };
    return workflows;
  }
  public static asWorkflow(object:object) : Workflow {
    const workflow = new Workflow();
    return workflow.fill(object);
  }
}
export interface PodVolume {
  name: string;
  downwardAPI: any;
  emptyDir: any;
  configMap: any;
  secret: any;
  persistentVolumeClaim: any;
}

export interface PodVolumeMount {
  name: string;
  mountPath: string;
  subPath: string;
  readOnly: boolean;
}
export interface IWorkflows extends Array<IWorkflow> {} ;
export class Workflows extends Array<Workflow> implements IWorkflows{
};

export interface IWorkflow {
  name: string;
  description: string;
  on: string[];
  /**
   * The key (job id) must start with a letter or _ and contain only alphanumeric characters, -, or _.
   */
  jobs: Jobs;
}


export interface Checkrun {
  actions: object[];
  completed_at: string;
  id: number;
  head_branch: string;
  head_sha: string;
  name: string;
  status: string;
  conclusion: string;
}

export class Workflow implements IWorkflow {
  name!: string;
  on!: string[];
  description!: string;
  jobs:Jobs = new Jobs();

  public fill(object:any): this {
    const self:any = this;
    Object.keys(object).forEach( (key:string) =>{
      switch (key) {
        case "jobs":
            self.jobs.populate(object[key]);
          break;
        default:
          self[key]=object[key];
      }
    })
    return self;
  }
}

export class Jobs extends Map<string, Job> {
  populate(object:any): this {
    Object.keys(object).forEach( (key:string) =>{
      this.set(key, Job.create(object[key]));
    })
    return this;
  }
  set(key:string, value:Job) : this {
    value.id = key;
    return super.set(key, value)
  }
}

export interface JobOrStep {
  id?: string;
  name?: string;
  if?: string;
}

export interface IJob extends JobOrStep {
  needs: string[];
  steps: Steps;
  timeoutInMinutes: number;
  container: any;
  input ?: Input;
}

export class Job implements IJob {
  needs!: string[];
  steps: Steps = new Steps();
  timeoutInMinutes!: number;
  container: any;
  id?: string;
  name?: string;
  if?: string;
  input?: Input;
  namespace?: string;

  public static create(object:any):Job {
    const self:any = new Job();
    Object.keys(object).forEach( (key:string) =>{
      switch (key) {
        case "steps":
            self.steps.populate(object[key]);
          break;
        default:
          self[key]=object[key];
      }
    })
    return self;
  }
}

export class Steps extends Array<Step> {
  public populate(object:Array<object>):this {
    const self:this = this;
    object.forEach( (item:object) =>{
      self.push(new Step().fill(item));
    })
    return self;
  }
}
export interface IStep extends JobOrStep {
  uses: string;
  run: string;
  with: Map<string, string>
  env: Map<string, string>
  entrypoint: string;
  args: string[];
  workingDirectory: string;
  continueOnError: boolean;
  timeoutInMinutes: number;
}
export class Step implements IStep {
  uses!: string;
  run!: string;
  with!: Map<string, string>;
  env!: Map<string, string>;
  entrypoint!: string;
  args!: string[];
  workingDirectory!: string;
  continueOnError!: boolean;
  timeoutInMinutes!: number;
  id?: string | undefined;
  name?: string | undefined;
  if?: string | undefined;
  namespace?: string;

  public fill(object:any): this {
    const self:any = this;
    Object.keys(object).forEach( (key:string) =>{
      switch (key) {
        default:
          self[key]=object[key];
      }
    })
    return self;
  }
}

export interface Input {
  id ?: string;
  label: string;
  description: string;
}
