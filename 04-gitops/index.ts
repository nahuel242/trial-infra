import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import { config } from "./config";

// read kubeconfig from cluster stack
export const kubeconfig = config.kubeconfig;

// create a new k8s provider with the kubeconfig
const provider = new k8s.Provider("k8sProvider", { kubeconfig });

// create argocd namespace
const name = "argocd";
const ns = new k8s.core.v1.Namespace( name, {
    metadata: {name: name},
}, { provider });


// install argocd helm chart

// try this if I have the time:
// if pulumi.getProject() !== bootstrap deploy  argocd agent and connect it to the argocd server instead of deploying a full
// argocd instance
// The idea is to have a bootstrap cluster with ArgoCD and the Pulumi operator and use that to spin-up all 
// the infrastructure with Pulumi & ArgoCD (AWS accounts, vpcs, IAM Roles, other clusters, Kubernetes services, AWS infrastructure, etc)

const argocd = new k8s.helm.v3.Chart("argocd",
    {
        namespace: ns.metadata.name,
        chart: "argo-cd",
        fetchOpts: { repo: "https://argoproj.github.io/argo-helm" },
        values: {
            installCRDs: false,
        },
    }, {provider})
    
export const argoNamespace = name;