const { SSMClient, SendCommandCommand, GetCommandInvocationCommand } = require('@aws-sdk/client-ssm');
const { AutoScalingClient, CompleteLifecycleActionCommand } = require('@aws-sdk/client-auto-scaling');
const { EC2Client, DescribeInstancesCommand, TerminateInstancesCommand } = require('@aws-sdk/client-ec2');

const {
    documentName,
    region
} = process.env;

const ssm = new SSMClient({ region });
const as = new AutoScalingClient({ region });
const ec2 = new EC2Client({ region });

exports.handler = async (event, _context) => {
    console.log('request Recieved.\nDetails:\n', JSON.stringify(event));
    const message = JSON.parse(event.Records[0].body);
    console.log('SQS message contents. \nMessage:\n', message);

    const instanceId = message.EC2InstanceId;
    console.log(`Manager instance ID: ${instanceId}`);

    if (!instanceId) {
      console.log('No instance ID, skipping');
      return 'No instance ID, skipping';
    }

    let managerRunning = true;
    try {
      console.log('Looking for running manager instance...');
      const response = await findRunningManager(instanceId);
      if (response.Reservations.length === 0) {
        console.log('Manager instance already terminated');
        managerRunning = false;
      } else {
        console.log('Manager instance still running');
      }
    } catch (err) {
      console.error('Failed to lookup manager instance:');
      throw err;
    }

    if (managerRunning) {
      try {
        console.log('Stopping gitlab-runner service...');
        const data = await executeCommand(instanceId);
        const commandId = data.Command.CommandId;
        const waitResult = await waitCommand(commandId, instanceId);
        if (waitResult.Status === 'Success') {
          console.log('gitlab-runner service stopped, SSM command status:\n', JSON.stringify(waitResult));
        } else {
          throw new Error(`ERROR: gitlab-runner service not stopped, SSM command status:\n${JSON.stringify(waitResult)}`);
        }
      } catch (err) {
        console.error('Failure waiting for command to be successful:');
        throw err;
      }

      try {
        console.log('Completing lifecycle action...');
        const result = await completeAsLifecycleAction(message);
        console.log('CompleteLifecycleAction Successful, result:\n', JSON.stringify(result));
      } catch (err) {
        console.error('Autoscaling lifecycle completion failed:');
        throw err;
      }
    }

    try {
      console.log('Terminating workers...');
      const result = await cleanUpWorkers(instanceId);
      console.log('Terminated workers:\n', JSON.stringify(result));
    } catch (err) {
      console.error('Failed to terminate all workers:');
      throw err;
    }

    console.log('Graceful termination successful');
    return 'Graceful termination successful';
};

const findRunningManager = async (instanceId) => {
  const ec2Params = {
    Filters: [
      {
        'Name': 'instance-state-name',
        'Values': ['running', 'pending'],
      }
    ],
    InstanceIds: [instanceId]
  };
  const command = new DescribeInstancesCommand(ec2Params);
  return ec2.send(command);
}

const executeCommand = async (nodename) => {
    const ssmParams = {
      DocumentName: documentName,
      Comment: 'Stop gitlab-runner service, and check whether it\'s stopped.',
      InstanceIds: [nodename],
      Parameters: {}
    };
    const command = new SendCommandCommand(ssmParams);
    return ssm.send(command);
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitCommand = async (commandId, instanceId) => {
  const ssmParams = {
    CommandId: commandId,
    InstanceId: instanceId
  };
  const command = new GetCommandInvocationCommand(ssmParams);
  while (true) {
    delay(2000);
    try {
      const result = await ssm.send(command);
      if (result.Status !== 'Pending' && result.Status !== 'InProgress' && result.Status !== 'Delayed') {
        return result;
      }
    } catch (err) {
      if (err.name === "InvocationDoesNotExist") {
        console.log('Command invocation not found, retrying...');
      } else {
        throw err;
      }
    }
  }
}

const cleanUpWorkers = async (parentId) => {
  const ec2Params = {
    Filters: [
      {
        'Name': 'instance-state-name',
        'Values': ['running', 'pending', 'stopping', 'stopped'],
      },
      {
        'Name': 'tag:gitlab-runner-parent-id',
        'Values': [parentId]
      },
      {
        'Name': 'tag:GitlabRunnerInstanceType',
        'Values': ['Worker']
      }
    ]
  };
  const describeCommand = new DescribeInstancesCommand(ec2Params);
  const reservations = await ec2.send(describeCommand);
  const workerIds = reservations.Reservations.length > 0 && reservations.Reservations.flatMap((reservation) => reservation.Instances.map((instance) => instance.InstanceId));
  if (workerIds && workerIds.length > 0) {
    const terminateParams = {
      InstanceIds: workerIds
    };
    const terminateCommand = new TerminateInstancesCommand(terminateParams);
    return ec2.send(terminateCommand);
  } else {
    return 'No running workers';
  }
}

const completeAsLifecycleAction = async (message) => {
    const lifecycleParams = {
      'AutoScalingGroupName': message.AutoScalingGroupName,
      'LifecycleHookName': message.LifecycleHookName,
      'LifecycleActionToken': message.LifecycleActionToken,
      'LifecycleActionResult': 'CONTINUE'
    };
    const command = new CompleteLifecycleActionCommand(lifecycleParams);
    return as.send(command);
}
