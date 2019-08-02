# pipeline-bot

#How to build
## prerequisites
- node 8.3.0+
- npm 6+

```
#Install node wihtout npm - https://gist.github.com/DanHerbert/9520689
curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.33.11/install.sh | bash
nvm install --lts
nvm use --delete-prefix v8.12.0
```

## Build


pipeline:
-[trigger]-> gateway -[event]-> controller -[command]>  agent -[command]-> worker

events:
- github:push
- github:pull_request:synchronize
- github:pull_request:opened
- github:pull_request:reopened
- github:pull_request:closed
- github:issue_comment:created
- pipeline:started
- job:started
- job:completed
- pipeline:completed

command:
start:<pipeline>
stop:<pipeline>
pause:<pipeline>
resume:<pipeline>


Project -> Build -> Job -> Task
