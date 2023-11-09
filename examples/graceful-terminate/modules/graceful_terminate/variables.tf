variable "runner_name" {
  description = "Unique logical name of the runner. Runners will be registered with tag name:runner_name and infrastructure objects will be named accordingly."
  type        = string
}

variable "runner_account" {
  description = "AWS Account ID that the runner is being deployed in"
  type        = string
}

variable "aws_region" {
  description = "AWS region being deployed to."
  type        = string
}

variable "runner_tags" {
  description = "Tags to set on all supported infrastructure"
  type        = map(string)
  default     = {}
}

variable "asg_name" {
  description = "Name of ASG to add lifecycle hook to."
  type        = string
}

variable "lifecycle_timeout" {
  description = "Time in seconds to wait for lifecycle complete action before continuing termination."
  type        = number
  default     = 1800
}

variable "sqs_visibility_timeout" {
  description = "Time in seconds that a message will be invisible for after being consumed."
  type        = number
  default     = 300
}

variable "sqs_max_receive_count" {
  description = "Number of times a message can be consumed before it's placed in the DLQ."
  type        = number
  default     = 8
}

variable "lambda_timeout" {
  description = "gitlab-runner-graceful-stop lambda timeout in seconds."
  type        = number
  default     = 60
}

variable "cloudwatch_logging_retention_in_days" {
  description = "Days to retain cloudwatch logs."
  type        = number
  default     = 14
}
