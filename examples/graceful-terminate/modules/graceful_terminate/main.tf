resource "aws_autoscaling_lifecycle_hook" "asg_lifecycle" {
  name                    = "${var.runner_name}-asg-lifecycle"
  autoscaling_group_name  = var.asg_name
  default_result          = "CONTINUE"
  heartbeat_timeout       = var.lifecycle_timeout
  lifecycle_transition    = "autoscaling:EC2_INSTANCE_TERMINATING"
  notification_target_arn = aws_sqs_queue.graceful_terminate_queue.arn
  role_arn                = module.graceful_terminate_asg_role.iam_role_arn
}

resource "aws_ssm_document" "stop_gitlab_runner" {
  name            = "${var.runner_name}-stop-gitlab-runner"
  document_format = "YAML"
  document_type   = "Command"

  content = <<DOC
schemaVersion: "2.2"
description: "Stops the gitlab-runner service, checks if service is stopped."
parameters: {}
mainSteps:
  - action: "aws:runShellScript"
    name: "StopGitLabRunner"
    inputs:
      runCommand:
        - systemctl --no-block stop gitlab-runner.service
        - sleep 5
        - status=$(systemctl is-active gitlab-runner.service)
        - |
          if [ "$status" == "inactive" ]
          then
            echo "gitlab-runner service stopped"
            machines=$(sudo docker-machine ls -q)
            if [ -n "$machines" ]; then
              if sudo docker-machine rm -y $machines; then
                echo "removed docker machines"
              else
                echo "failed to remove docker machines"
                exit 1
              fi
            fi
            exit 0
          else
            echo "gitlab-runner service not stopped" 1>&2
            exit 1
          fi
DOC

  tags = var.runner_tags
}

resource "aws_lambda_function" "gitlab_runner_graceful_stop" {
  depends_on = [data.external.fetch_lambda_artifact]

  filename         = "${path.module}/graceful_terminate.zip"
  function_name    = "${var.runner_name}-graceful-stop"
  role             = module.graceful_terminate_lambda_role.iam_role_arn
  handler          = "index.handler"
  source_code_hash = filebase64sha256(data.external.fetch_lambda_artifact.result.filename)
  runtime          = "nodejs16.x"
  timeout          = var.lambda_timeout

  environment {
    variables = {
      documentName = aws_ssm_document.stop_gitlab_runner.name
      region       = var.aws_region
    }
  }

  tags = var.runner_tags
}

resource "aws_cloudwatch_log_group" "gitlab_runner_graceful_stop_log_group" {
  name              = "/aws/lambda/${aws_lambda_function.gitlab_runner_graceful_stop.function_name}"
  retention_in_days = var.cloudwatch_logging_retention_in_days

  tags = var.runner_tags
}

resource "aws_lambda_event_source_mapping" "gitlab_runner_graceful_stop_trigger" {
  event_source_arn = aws_sqs_queue.graceful_terminate_queue.arn
  function_name    = aws_lambda_function.gitlab_runner_graceful_stop.arn
}

resource "aws_lambda_function_event_invoke_config" "example" {
  function_name          = aws_lambda_function.gitlab_runner_graceful_stop.function_name
  maximum_retry_attempts = 0
}
