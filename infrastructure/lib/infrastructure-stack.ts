import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecrAssets from 'aws-cdk-lib/aws-ecr-assets';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as path from 'path';

export class InfrastructureStack extends cdk.Stack {

    constructor(
        scope: Construct,
        id: string,
        props?: cdk.StackProps
    ) {
        super(scope, id, props);

        // ---------------------------------------------------------
        // VPC
        // ---------------------------------------------------------

        const vpc = new ec2.Vpc(this, 'WebApplicationVpc', {
            vpcName: 'web-application-vpc',
            maxAzs: 2,
            natGateways: 1,
        });

        // ---------------------------------------------------------
        // ECS CLUSTER
        // ---------------------------------------------------------

        const cluster = new ecs.Cluster(this, 'WebApplicationCluster', {
            vpc,
            clusterName: 'WebApplicationCluster',
        });

        // ---------------------------------------------------------
        // SECURITY GROUP FOR ALB
        // ---------------------------------------------------------

        const albSecurityGroup = new ec2.SecurityGroup(
            this,
            'AlbSecurityGroup',
            {
                vpc,
                allowAllOutbound: true,
                description: 'Security group for web application ALB',
            }
        );

        albSecurityGroup.addIngressRule(
            ec2.Peer.anyIpv4(),
            ec2.Port.tcp(80),
            'Allow HTTP from internet'
        );

        // ---------------------------------------------------------
        // SECURITY GROUP FOR ECS
        // ---------------------------------------------------------

        const serviceSecurityGroup = new ec2.SecurityGroup(
            this,
            'ServiceSecurityGroup',
            {
                vpc,
                allowAllOutbound: true,
                description: 'Security group for ECS application',
            }
        );

        // Only allow the ALB to access the application.
        serviceSecurityGroup.addIngressRule(
            albSecurityGroup,
            ec2.Port.tcp(3000),
            'Allow traffic from ALB'
        );

        // ---------------------------------------------------------
        // DOCKER IMAGE
        // ---------------------------------------------------------

        /*
         * IMPORTANT:
         *
         * __dirname is:
         *
         * YourProject/infrastructure/lib
         *
         * ../.. points to:
         *
         * YourProject
         *
         * That is exactly where your Dockerfile is.
         */

        const applicationImage = new ecrAssets.DockerImageAsset(
            this,
            'ApplicationImage',
            {
                directory: path.join(
                    __dirname,
                    '..',
                    '..'
                ),
            }
        );

        // ---------------------------------------------------------
        // ECS TASK DEFINITION
        // ---------------------------------------------------------

        const taskDefinition = new ecs.FargateTaskDefinition(
            this,
            'ApplicationTaskDefinition',
            {
                cpu: 512,
                memoryLimitMiB: 1024,
            }
        );

        // ---------------------------------------------------------
        // CONTAINER
        // ---------------------------------------------------------

        taskDefinition.addContainer(
            'ApplicationContainer',
            {
                image: ecs.ContainerImage.fromDockerImageAsset(
                    applicationImage
                ),

                environment: {
                    NODE_ENV: 'production',
                    PORT: '3000',
                },

                logging: ecs.LogDrivers.awsLogs({
                    streamPrefix: 'WebApplication',
                }),

                portMappings: [
                    {
                        containerPort: 3000,
                        protocol: ecs.Protocol.TCP,
                    },
                ],
            }
        );

        // ---------------------------------------------------------
        // ECS SERVICE
        // ---------------------------------------------------------

        const service = new ecs.FargateService(
            this,
            'ApplicationService',
            {
                cluster,
                taskDefinition,

                desiredCount: 1,

                securityGroups: [
                    serviceSecurityGroup,
                ],

                vpcSubnets: {
                    subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
                },

                enableExecuteCommand: true,

                healthCheckGracePeriod: cdk.Duration.seconds(60),
            }
        );

        // ---------------------------------------------------------
        // APPLICATION LOAD BALANCER
        // ---------------------------------------------------------

        const alb = new elbv2.ApplicationLoadBalancer(
            this,
            'ApplicationALB',
            {
                vpc,
                internetFacing: true,
                securityGroup: albSecurityGroup,
            }
        );

        // ---------------------------------------------------------
        // TARGET GROUP
        // ---------------------------------------------------------

        const targetGroup = new elbv2.ApplicationTargetGroup(
            this,
            'ApplicationTargetGroup',
            {
                vpc,

                port: 3000,

                protocol: elbv2.ApplicationProtocol.HTTP,

                targetType: elbv2.TargetType.IP,

                healthCheck: {
                  path: '/health',
                  protocol: elbv2.Protocol.HTTP,
                  interval: cdk.Duration.seconds(30),
                  timeout: cdk.Duration.seconds(5),
                  healthyThresholdCount: 2,
                  unhealthyThresholdCount: 3,
                  healthyHttpCodes: '200',
              },
            }
        );

        targetGroup.addTarget(service);

        // ---------------------------------------------------------
        // ALB LISTENER
        // ---------------------------------------------------------

        alb.addListener(
            'ApplicationListener',
            {
                port: 80,

                protocol: elbv2.ApplicationProtocol.HTTP,

                defaultTargetGroups: [
                    targetGroup,
                ],
            }
        );

        // ---------------------------------------------------------
        // OUTPUTS
        // ---------------------------------------------------------

        new cdk.CfnOutput(
            this,
            'ApplicationUrl',
            {
                value: `http://${alb.loadBalancerDnsName}`,
                description: 'Application URL',
            }
        );

        new cdk.CfnOutput(
            this,
            'LoadBalancerDns',
            {
                value: alb.loadBalancerDnsName,
                description: 'ALB DNS',
            }
        );

        new cdk.CfnOutput(
            this,
            'ClusterName',
            {
                value: cluster.clusterName,
                description: 'ECS Cluster',
            }
        );

        new cdk.CfnOutput(
            this,
            'ServiceName',
            {
                value: service.serviceName,
                description: 'ECS Service',
            }
        );

        new cdk.CfnOutput(
            this,
            'DockerImageUri',
            {
                value: applicationImage.imageUri,
                description: 'Docker image URI',
            }
        );
    }
}