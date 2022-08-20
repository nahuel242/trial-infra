import * as pulumi from "@pulumi/pulumi";

const pulumiConfig = new pulumi.Config();


// Create a reference for the kubernetes cluster
const clusterStackRef = new pulumi.StackReference(pulumiConfig.require("clusterStack"));

// Get the kubeconfig from the cluster stack output.

// Export the kubeconfig
export const config = {
    // kubeconfig
    kubeconfig:  clusterStackRef.getOutput("kubeconfig")
};
