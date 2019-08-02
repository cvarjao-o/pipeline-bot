export interface Workflow {
  readonly workflow: Map<string, Flow>;
  readonly actions: Map<string, Action>;
}

export interface Flow {
  description: string;
  on: string[];
  resolves: string[];
}

export interface Action {
  description: string;
  uses: string;
  needs: string[]
}

export interface Input {

}

export interface Needs {
  
}