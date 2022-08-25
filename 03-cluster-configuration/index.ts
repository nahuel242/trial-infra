import * as aws from "@pulumi/aws";
import * as eks from "@pulumi/eks";
import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";
import { config } from "./config";

const projectName = pulumi.getProject();
const stackName = pulumi.getStack();

export const adminsIamRoleArn = config.adminsIamRoleArn
// export const devsIamRoleArn = config.devsIamRoleArn
export const stdNodegroupIamRoleArn = config.stdNodegroupIamRoleArn
export const perfNodegroupIamRoleArn = config.perfNodegroupIamRoleArn
const adminsIamRoleName = adminsIamRoleArn.apply(s => s.split("/")).apply(s => s[1])
// const devsIamRoleName = devsIamRoleArn.apply(s => s.split("/")).apply(s => s[1])
const stdNodegroupIamRoleName = stdNodegroupIamRoleArn.apply(s => s.split("/")).apply(s => s[1])
const perfNodegroupIamRoleName = perfNodegroupIamRoleArn.apply(s => s.split("/")).apply(s => s[1])

// Create an EKS cluster.
const cluster = new eks.Cluster(`${projectName}`, {
    instanceRoles: [
        aws.iam.Role.get("adminsIamRole", stdNodegroupIamRoleName),
        aws.iam.Role.get("devsIamRole", perfNodegroupIamRoleName),
    ],
    roleMappings: [
        {
            roleArn: config.adminsIamRoleArn,
            groups: ["system:masters"],
            username: "pulumi:admins",
        }
        // {
        //     roleArn: config.devsIamRoleArn,
        //     groups: ["pulumi:devs"],
        //     username: "pulumi:alice",
        // },
    ],
    vpcId: config.vpcId,
    publicSubnetIds: config.publicSubnetIds,
    privateSubnetIds: config.privateSubnetIds,
    storageClasses: {
        "gp2-encrypted": { type: "gp2", encrypted: true},
        "sc1": { type: "sc1"}
    },
    nodeAssociatePublicIpAddress: false,
    skipDefaultNodeGroup: true,
    deployDashboard: false,
    version: "1.21",
    tags: {
        "Project": "k8s-aws-cluster",
        "Environment": `${stackName}`,
        "Org": "pulumi",
    },
    clusterSecurityGroupTags: { "ClusterSecurityGroupTag": "true" },
    nodeSecurityGroupTags: { "NodeSecurityGroupTag": "true" },
    enabledClusterLogTypes: ["api", "audit", "authenticator", "controllerManager", "scheduler"],
    // endpointPublicAccess: false,     // Requires bastion to access cluster API endpoint
    // endpointPrivateAccess: true,     // Requires bastion to access cluster API endpoint
});

// Export the cluster details.
export const kubeconfig = cluster.kubeconfig.apply(JSON.stringify);
export const clusterName = cluster.core.cluster.name;
export const region = aws.config.region;
export const securityGroupIds = [cluster.nodeSecurityGroup.id];

// Create a Standard node group of t2.medium workers.
const ngStandard = new eks.NodeGroup(`${projectName}-ng-standard`, {
    cluster: cluster,
    instanceProfile: new aws.iam.InstanceProfile("ng-standard", {role: stdNodegroupIamRoleName}),
    nodeAssociatePublicIpAddress: false,
    nodeSecurityGroup: cluster.nodeSecurityGroup,
    clusterIngressRule: cluster.eksClusterIngressRule,
    amiId: "ami-0ff8d483010b138ac", // k8s v1.21 in us-east-1 
    instanceType: "t2.medium",
    desiredCapacity: 1,
    minSize: 1,
    maxSize: 10,
    labels: {"amiId": "ami-0ff8d483010b138ac"},
    cloudFormationTags: clusterName.apply(clusterName => ({
        "CloudFormationGroupTag": "true",
        "k8s.io/cluster-autoscaler/enabled": "true",
        [`k8s.io/cluster-autoscaler/${clusterName}`]: "true",
    })),
}, {
    providers: { kubernetes: cluster.provider},
});

// Create a 2xlarge node group of t3.2xlarge workers with taints for special workloads.
// const ng2xlarge = new eks.NodeGroup(`${projectName}-ng-2xlarge`, {
//     cluster: cluster,
//     instanceProfile: new aws.iam.InstanceProfile("ng-2xlarge", {role: perfNodegroupIamRoleName}),
//     nodeAssociatePublicIpAddress: false,
//     nodeSecurityGroup: cluster.nodeSecurityGroup,
//     clusterIngressRule: cluster.eksClusterIngressRule,
//     amiId: "ami-0ca5998dc2c88e64b", // k8s v1.14.7 in us-west-2
//     instanceType: "t3.2xlarge",
//     desiredCapacity: 5,
//     minSize: 5,
//     maxSize: 10,
//     labels: {"amiId": "ami-0ca5998dc2c88e64b"},
//     taints: { "special": { value: "true", effect: "NoSchedule"}},
//     cloudFormationTags: clusterName.apply(clusterName => ({
//         "CloudFormationGroupTag": "true",
//         "k8s.io/cluster-autoscaler/enabled": "true",
//         [`k8s.io/cluster-autoscaler/${clusterName}`]: "true",
//     })),
// }, {
//     providers: { kubernetes: cluster.provider},
// });

// Create Kubernetes namespaces.
const clusterSvcsNamespace = new k8s.core.v1.Namespace("cluster-svcs", undefined, { provider: cluster.provider });
export const clusterSvcsNamespaceName = clusterSvcsNamespace.metadata.name;

const appSvcsNamespace = new k8s.core.v1.Namespace("app-svcs", undefined, { provider: cluster.provider });
export const appSvcsNamespaceName = appSvcsNamespace.metadata.name;

const appsNamespace = new k8s.core.v1.Namespace("apps", undefined, { provider: cluster.provider });
export const appsNamespaceName = appsNamespace.metadata.name;

// const nginxNs = new k8s.core.v1.Namespace("ingress-nginx", {metadata: {name: "ingress-nginx"}}, { provider: cluster.provider});

// Create a resource quota in the apps namespace.
const quotaAppNamespace = new k8s.core.v1.ResourceQuota("apps", {
    metadata: {namespace: appsNamespaceName},
    spec: {
        hard: {
            cpu: "20",
            memory: "1Gi",
            pods: "10",
            replicationcontrollers: "20",
            resourcequotas: "1",
            services: "5",
        },
    }
},{
    provider: cluster.provider
});

// Deploy the NGINX ingress controller using the Helm chart.
const nginx = new k8s.helm.v3.Chart("nginx",
    {
        namespace: appSvcsNamespaceName,
        chart: "nginx-ingress",
        version: "1.24.4",
        fetchOpts: {repo: "https://charts.helm.sh/stable/"},
        values: {
            controller: {
                publishService: {enabled: true},
                service: {
                    targetPorts: {
                        http: "http",
                        https: "http"
                    },
                    annotations: {
                        "service.beta.kubernetes.io/aws-load-balancer-ssl-cert": config.acmCertificate,
                        "service.beta.kubernetes.io/aws-load-balancer-backend-protocol": "http",
                        "service.beta.kubernetes.io/aws-load-balancer-ssl-ports": "https",
                        "service.beta.kubernetes.io/aws-load-balancer-connection-idle-timeout": '3600'
                    }

                }
            }
        },
        transformations: [
            (obj: any) => {
                // Do transformations on the YAML to set the namespace
                if (obj.metadata) {
                    obj.metadata.namespace = appSvcsNamespaceName;
                }
            },
        ],
    },
    {
        provider: cluster.provider
    },
);



