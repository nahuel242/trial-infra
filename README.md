# trial-infra
Trial project base layer infrastructure

## Deploying the Stack

To deploy your infrastructure, follow the below steps.

### Prerequisites

1. [Get Started with Kubernetes on Pulumi](https://www.pulumi.com/docs/get-started/kubernetes/)

### Steps

After cloning this repo, from every project directory, run these commands:

1. Set your Pulimi & AWS credentials

    ```bash
    $ export AWS_ACCESS_KEY_ID=XXXXXXXXXX
    $ export AWS_SECRET_ACCESS_KEY=XXXXXXXXXX
    $ export PULUMI_ACCESS_TOKEN=XXXXXXXXXX

1. Install the required Node.js packages:

    ```bash
    $ npm install
    ```

1. Update the stack.

    ```bash
    $ pulumi up
    ```
