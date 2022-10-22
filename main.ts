import { Construct } from "constructs";
import { App, S3Backend, TerraformOutput, TerraformStack } from "cdktf";
import { AwsProvider } from "@cdktf/provider-aws/lib/provider";
import { iamRole, alb, vpc, subnet, internetGateway, iamRolePolicyAttachment, dataAwsS3Bucket, lambdaFunction } from "@cdktf/provider-aws";
import path = require("path");

class MyStack extends TerraformStack {
  constructor(scope: Construct, name: string) {
    super(scope, name);

    new AwsProvider(this, "aws", {
      region: "eu-central-1",
    });

    // manually created state bucket
    new S3Backend(this, {
      bucket: "my-terraform-state-a2b1gnhxyx",
      key: "terraform.tfstate",
      region: "eu-central-1",
    });

    const myVpc = new vpc.Vpc(this, 'vpc', {
      cidrBlock: "10.0.0.0/16"
    })

    const subnet1 = new subnet.Subnet(this, 'subnet1', {
      vpcId: myVpc.id,
      mapPublicIpOnLaunch: true,
      availabilityZone: "eu-central-1a",
      cidrBlock: "10.0.3.0/24"
    })

    const subnet2 = new subnet.Subnet(this, 'subnet2', {
      vpcId: myVpc.id,
      mapPublicIpOnLaunch: true,
      availabilityZone: "eu-central-1b",
      cidrBlock: "10.0.4.0/24"
    })

    new internetGateway.InternetGateway(this, "igw", {
      vpcId: myVpc.id,
    });

    const stateBucket = new dataAwsS3Bucket.DataAwsS3Bucket(this, 's3-state', {
      bucket: "my-terraform-state-a2b1gnhxyx"
    })

    const role = new iamRole.IamRole(this, "lambda-role", {
      assumeRolePolicy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Action: "sts:AssumeRole",
            Effect: "Allow",
            Sid: "",
            Principal: {
              Service: "lambda.amazonaws.com",
            },
          },
        ],
      }),
      inlinePolicy: [
        {
          name: "allow-lambda-s3",
          policy: JSON.stringify({
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Action: [
                  "s3:ListBucket",
                ],
                Resource: stateBucket.arn,
              },
              {
                Effect: "Allow",
                Action: [
                  "s3:GetObject",
                ],
                Resource: stateBucket.arn + "/*",
              },
            ],
          }),
        },
      ],
    });

    new iamRolePolicyAttachment.IamRolePolicyAttachment(this, "lambda-managed-policy", {
      policyArn: 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
      role: role.name
    });

    new lambdaFunction.LambdaFunction(this, 'lambda-function', {
      functionName: "lambda-get-resource-outputs",
      role: role.arn,
      runtime: "python3.9",
      handler: "lambda.handler",
      filename: path.resolve(__dirname, "./src/lambda.zip"),
    })

    const myAlb = new alb.Alb(this, 'alb', {
      subnets: [subnet1.id, subnet2.id]
    })

    new TerraformOutput(this, "alb-dns-output", {
      value: myAlb.dnsName,
    });

    new TerraformOutput(this, "vpc-id-output", {
      value: myVpc.id,
    });

  }
}

const app = new App();
new MyStack(app, "lambda-crawl-cdktf");
app.synth();
