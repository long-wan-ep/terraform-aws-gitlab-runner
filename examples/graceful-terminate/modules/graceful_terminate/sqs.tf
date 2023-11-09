resource "aws_sqs_queue" "graceful_terminate_dlq" {
  name                    = "${var.runner_name}-graceful-terminate-dlq"
  sqs_managed_sse_enabled = true

  tags = var.runner_tags
}

resource "aws_sqs_queue" "graceful_terminate_queue" {
  name                       = "${var.runner_name}-graceful-terminate-queue"
  sqs_managed_sse_enabled    = true
  visibility_timeout_seconds = var.sqs_visibility_timeout
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.graceful_terminate_dlq.arn
    maxReceiveCount     = var.sqs_max_receive_count
  })

  tags = var.runner_tags
}
