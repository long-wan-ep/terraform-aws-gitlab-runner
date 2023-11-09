// runner
locals {
  gitlab_url                            = "https://gitlab.com/"
  aws_instance_metadata_service_api_url = "http://169.254.169.254/latest"

  manager_ssm_access                = true
  manager_disk_size_gb              = 50
  manager_detailed_monitoring       = true
  manager_prometheus_listen_address = "localhost:9252"

  worker_ssm_access          = true
  worker_disk_size_gb        = 75
  worker_detailed_monitoring = true
  worker_privileged          = true
  worker_idle_time           = 3000
  worker_image               = "alpine:latest"
  worker_device_name         = "/dev/xvda"

  runner_tags = {
    ManagedBy  = "Terraform"
    Owner      = "Test"
  }
}

module "runner" {
  source  = "cattle-ops/gitlab-runner/aws"
  version = "7.1.1"

  environment = "test-runner"

  // logging
  runner_cloudwatch = {
    log_group_name = "test-runner"
    retention_days = 7
  }

  // networking
  vpc_id                = "123"
  subnet_id             = "123"
  security_group_prefix = ""

  // manager instance configuration
  runner_install = {
    post_install_script = <<EOT
mkdir /etc/systemd/system/gitlab-runner.service.d
cat <<EOF > /etc/systemd/system/gitlab-runner.service.d/kill.conf
[Service]
TimeoutStopSec=600
KillSignal=SIGQUIT
EOF
EOT
  }
  runner_instance = {
    name       = "test-runner"
    monitoring = local.manager_detailed_monitoring
    ssm_access = local.manager_ssm_access
    type       = "t3.micro"
    root_device_config = {
      volume_size = local.manager_disk_size_gb
    }
    additional_tags = {
      GitlabRunnerInstanceType = "Manager"
    }
    name_prefix = "test-runner-manager"
  }
  runner_manager = {
    prometheus_listen_address = local.manager_prometheus_listen_address
    maximum_concurrent_jobs   = 10
  }
  runner_role = {
    policy_arns = [
      "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy",
      module.manager_autoscaling_policy.arn
    ]
  }

  // worker configuration (docker-machine)
  runner_worker = {
    ssm_access = local.worker_ssm_access
    max_jobs   = 10
  }
  runner_worker_docker_add_dind_volumes = false
  runner_worker_docker_machine_ec2_options = [
    "amazonec2-ssh-user=ec2-user",
    "amazonec2-device-name=${local.worker_device_name}"
  ]
  runner_worker_docker_machine_instance = {
    monitoring               = local.worker_detailed_monitoring
    idle_count               = 0
    idle_time                = 180
    destroy_after_max_builds = 10
    root_size                = local.worker_disk_size_gb
    name_prefix              = "test"
    types                    = ["t3.micro"]
    max_growth_rate          = 5
  }
  runner_worker_docker_machine_instance_spot = {
    enable = false
  }
  runner_worker_docker_machine_role = {
    additional_tags = {
      GitlabRunnerInstanceType = "Worker"
    }
    policy_arns = ["arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy"]
  }
  runner_worker_docker_options = {
    privileged = local.worker_privileged
    image      = local.worker_image
  }

  // tags
  tags = merge(
    local.runner_tags,
    {
      RunnerVersion = "16.1.0",
    }
  )

  // Runner Registration
  runner_gitlab = {
    runner_version = "16.1.0"
    url            = local.gitlab_url
  }
  runner_gitlab_registration_config = {
    access_level       = "not_protected"
    registration_token = "123"
    tag_list           = "name:test-runner"
    description        = "test-runner"
    locked_to_project  = "false"
    run_untagged       = "true"
    maximum_timeout    = ""
  }
}

module "graceful_terminate" {
  source         = "./modules/graceful_terminate"

  runner_name    = "test-runner"
  runner_account = "123"
  aws_region     = "us-west-2"
  runner_tags = merge(
    local.runner_tags,
    {
      Environment = "test-runner"
    },
  )
  asg_name                             = module.runner.runner_as_group_name
  lifecycle_timeout                    = 1800
  sqs_visibility_timeout               = 300
  sqs_max_receive_count                = 8
  lambda_timeout                       = 60
  cloudwatch_logging_retention_in_days = 7
}
