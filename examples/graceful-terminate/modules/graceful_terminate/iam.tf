module "graceful_terminate_asg_lifecycle_policy" {
  source  = "terraform-aws-modules/iam/aws//modules/iam-policy"
  version = "~> 4.24"

  name        = "${var.runner_name}-graceful-terminate-asg-lifecycle-policy"
  path        = "/"
  description = "Policy granting required IAM permissions to send messages to SQS"

  policy = <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AsgLifecycleSqs",
      "Effect": "Allow",
      "Action": [
        "sqs:SendMessage",
        "sqs:GetQueueUrl"
      ],
      "Resource": [
        "${aws_sqs_queue.graceful_terminate_queue.arn}"
      ]
    }
  ]
}
EOF

  tags = var.runner_tags
}

module "graceful_terminate_asg_role" {
  source  = "terraform-aws-modules/iam/aws//modules/iam-assumable-role"
  version = "~> 4.24"

  role_name               = "${var.runner_name}-graceful-terminate-asg"
  role_description        = "Role that allows ASG lifecycle hooks to send messages to SQS"
  create_role             = true
  trusted_role_services   = ["autoscaling.amazonaws.com"]
  custom_role_policy_arns = [module.graceful_terminate_asg_lifecycle_policy.arn]
  role_requires_mfa       = false

  tags = var.runner_tags
}

module "graceful_terminate_lambda_policy" {
  source  = "terraform-aws-modules/iam/aws//modules/iam-policy"
  version = "~> 4.24"

  name        = "${var.runner_name}-graceful-terminate-lambda-policy"
  path        = "/"
  description = "Policy granting required IAM permissions to gitlab-runner-graceful-stop lambda"

  policy = <<EOF
{
    "Version": "2012-10-17",
    "Statement": [
        {
          "Effect": "Allow",
          "Action": [
            "autoscaling:CompleteLifecycleAction"
          ],
          "Resource": [
            "arn:aws:autoscaling:${var.aws_region}:${var.runner_account}:autoScalingGroup:*:autoScalingGroupName/${var.asg_name}"
          ]
        },
        {
          "Effect": "Allow",
          "Action": [
            "ec2:DescribeInstances"
          ],
          "Resource": [
            "*"
          ]
        },
        {
          "Effect": "Allow",
          "Action": [
            "ec2:TerminateInstances"
          ],
          "Resource": [
            "arn:aws:ec2:${var.aws_region}:${var.runner_account}:instance/*"
          ],
          "Condition":{
            "StringLike":{
              "aws:ResourceTag/Environment":[
                "${var.runner_name}"
              ]
            }
          }
        },
        {
          "Effect": "Allow",
          "Action": [
            "logs:CreateLogGroup",
            "logs:CreateLogStream",
            "logs:PutLogEvents"
          ],
          "Resource": [
            "${resource.aws_cloudwatch_log_group.gitlab_runner_graceful_stop_log_group.arn}:*"
          ]
        },
        {
          "Effect": "Allow",
          "Action": [
            "sqs:DeleteMessage",
            "sqs:GetQueueAttributes",
            "sqs:ReceiveMessage"
          ],
          "Resource": [
            "${resource.aws_sqs_queue.graceful_terminate_queue.arn}"
          ]
        },
        {
          "Effect": "Allow",
          "Action": [
            "ssm:SendCommand"
          ],
          "Resource": [
            "${resource.aws_ssm_document.stop_gitlab_runner.arn}"
          ]
        },
        {
          "Effect": "Allow",
          "Action": [
            "ssm:SendCommand"
          ],
          "Resource": [
            "arn:aws:ec2:${var.aws_region}:${var.runner_account}:instance/*"
          ],
          "Condition":{
            "StringLike":{
              "ssm:ResourceTag/Name": [
                "${var.runner_name}*"
              ]
            }
          }
        },
        {
          "Effect": "Allow",
          "Action": [
            "ssm:GetCommandInvocation"
          ],
          "Resource": [
            "*"
          ]
        }
    ]
}
EOF

  tags = var.runner_tags
}

module "graceful_terminate_lambda_role" {
  source  = "terraform-aws-modules/iam/aws//modules/iam-assumable-role"
  version = "~> 4.24"

  role_name               = "${var.runner_name}-graceful-terminate-lambda"
  role_description        = "Role for gitlab-runner-graceful-stop lambda"
  create_role             = true
  trusted_role_services   = ["lambda.amazonaws.com"]
  custom_role_policy_arns = [module.graceful_terminate_lambda_policy.arn]
  role_requires_mfa       = false

  tags = var.runner_tags
}
