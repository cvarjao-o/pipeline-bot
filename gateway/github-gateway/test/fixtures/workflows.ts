/*strict*/

import * as model from '../../src/Model';
const workflows: model.Workflows = [] as model.Workflows;


const workflow1Def: any = {
  description: "CD",
  on: ["pull_request:opened","pull_request:reopened", "pull_request:synchronize"],
  jobs: {
    "build": {
      "steps":[
        {
          "uses": "docker://registry.access.redhat.com/openshift3/ose-cli:v3.11.129-1",
          "run": ["sh", "-c", "echo 'Building...'"]
        }
      ]
    }
  }
}

workflows.push(model.Factory.asWorkflow(workflow1Def))

export default workflows;
